/* =====================================================
   SF Validation Manager - Main JavaScript
   =====================================================
   This app uses:
   - OAuth 2.0 (User-Agent / Implicit Flow) to log in to Salesforce
   - Tooling API to read validation rules
   - Tooling API PATCH to update (deploy) validation rules
   ===================================================== */

// ---- GLOBAL VARIABLES ----

// These will be set after login
let accessToken = "";      // OAuth access token
let instanceUrl = "";      // Salesforce instance URL (e.g. https://myorg.my.salesforce.com)
let apiVersion = "v62.0";  // Salesforce API version

// Store validation rules fetched from Salesforce
let validationRules = [];

// Track which rules the user has modified (toggled) locally
let modifiedRuleIds = new Set();


// ---- DOM ELEMENTS ----

const loginSection     = document.getElementById("login-section");
const appSection       = document.getElementById("app-section");
const clientIdInput    = document.getElementById("client-id-input");
const loginBtn         = document.getElementById("login-btn");
const logoutBtn        = document.getElementById("logout-btn");
const fetchBtn         = document.getElementById("fetch-btn");
const enableAllBtn     = document.getElementById("enable-all-btn");
const disableAllBtn    = document.getElementById("disable-all-btn");
const deployBtn        = document.getElementById("deploy-btn");
const rulesContainer   = document.getElementById("rules-container");
const statusBar        = document.getElementById("status-bar");
const statusMessage    = document.getElementById("status-message");
const userDisplay      = document.getElementById("user-display");
const instanceDisplay  = document.getElementById("instance-display");
const changesSummary   = document.getElementById("changes-summary");
const changesList      = document.getElementById("changes-list");
const loadingOverlay   = document.getElementById("loading-overlay");
const loadingText      = document.getElementById("loading-text");


// =====================================================
// 1. OAuth 2.0 LOGIN
// =====================================================

/**
 * When user clicks "Login to Salesforce":
 * - We redirect them to Salesforce's OAuth authorization page
 * - After they log in, Salesforce redirects back with the access token in the URL hash
 */
loginBtn.addEventListener("click", function () {
    // Get the Client ID the user entered
    let clientId = clientIdInput.value.trim();

    if (!clientId) {
        showStatus("Please enter your Connected App Client ID (Consumer Key).", "error");
        return;
    }

    // Save client ID in localStorage so user doesn't have to re-enter it
    localStorage.setItem("sf_client_id", clientId);

    // The redirect URI must EXACTLY match what's configured in the Connected App.
    // We build it from the current origin + pathname to avoid issues with query params or hashes.
let redirectUri = window.location.origin + "/index.html";
    // Remove trailing slash if any, for consistency
    if (redirectUri.endsWith("/")) {
        redirectUri = redirectUri.slice(0, -1);
    }

    // Save the redirect URI so we can verify it on callback
    localStorage.setItem("sf_redirect_uri", redirectUri);

    console.log("Redirect URI being sent:", redirectUri);

    // Build the Salesforce OAuth authorization URL
    // We use "token" response_type for the Implicit (User-Agent) flow
    let authUrl = "https://login.salesforce.com/services/oauth2/authorize"
        + "?response_type=token"
        + "&client_id=" + encodeURIComponent(clientId)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&scope=api%20full";

    // Redirect the browser to Salesforce login page
    console.log("AUTH URL:", authUrl);
    window.location.href = authUrl;
});


/**
 * After Salesforce redirects back, the access token is in the URL hash.
 * Example hash: #access_token=xxxxx&instance_url=https://myorg.my.salesforce.com&...
 * This function parses it.
 */
function handleOAuthCallback() {
    let hash = window.location.hash;

    if (hash && hash.includes("access_token")) {
        // Parse the hash parameters
        let params = {};
        hash.substring(1).split("&").forEach(function (part) {
            let pair = part.split("=");
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
        });

        // Extract token and instance URL
        accessToken = params["access_token"];
        instanceUrl = params["instance_url"];

        // Save to sessionStorage so it survives page refreshes (but not new tabs)
        sessionStorage.setItem("sf_access_token", accessToken);
        sessionStorage.setItem("sf_instance_url", instanceUrl);

        // Clean the URL (remove the hash so token isn't visible)
        history.replaceState(null, "", window.location.pathname);

        // Show the app
        showAppSection();
    }
}


/**
 * Check if user is already logged in (from sessionStorage)
 */
function checkExistingLogin() {
    let savedToken = sessionStorage.getItem("sf_access_token");
    let savedInstance = sessionStorage.getItem("sf_instance_url");

    if (savedToken && savedInstance) {
        accessToken = savedToken;
        instanceUrl = savedInstance;
        showAppSection();
    }
}


/**
 * Show the app section and hide login
 */
function showAppSection() {
    loginSection.style.display = "none";
    appSection.style.display = "block";

    // Show user info
    userDisplay.textContent = "Logged In";
    instanceDisplay.textContent = instanceUrl;

    // Try to get user info from Salesforce
    getUserInfo();
}


/**
 * Get the logged-in user's name from Salesforce
 */
function getUserInfo() {
    // Salesforce provides a userinfo endpoint
    fetch(instanceUrl + "/services/oauth2/userinfo", {
        headers: {
            "Authorization": "Bearer " + accessToken
        }
    })
    .then(function (response) { return response.json(); })
    .then(function (data) {
        if (data.name) {
            userDisplay.textContent = data.name;
        }
    })
    .catch(function (err) {
        console.log("Could not fetch user info:", err);
    });
}


/**
 * Logout - clear tokens and reload
 */
logoutBtn.addEventListener("click", function () {
    sessionStorage.removeItem("sf_access_token");
    sessionStorage.removeItem("sf_instance_url");
    accessToken = "";
    instanceUrl = "";
    window.location.reload();
});


// =====================================================
// 2. FETCH VALIDATION RULES (Tooling API)
// =====================================================

/**
 * Fetch all validation rules on the Account object using the Tooling API.
 * 
 * Salesforce Tooling API does NOT allow querying Metadata/FullName when
 * multiple rows are returned. So we use a 2-step approach:
 *   Step 1: Query just the IDs of all Account validation rules
 *   Step 2: Fetch each rule individually to get its full Metadata
 */
fetchBtn.addEventListener("click", function () {
    showLoading("Fetching validation rules...");

    // Step 1: Query just the basic fields (no Metadata/FullName)
    let query = "SELECT Id, ValidationName, Active, Description "
              + "FROM ValidationRule "
              + "WHERE EntityDefinition.QualifiedApiName = 'Account'";

    let url = instanceUrl + "/services/data/" + apiVersion + "/tooling/query/"
            + "?q=" + encodeURIComponent(query);

    fetch(url, {
        headers: {
            "Authorization": "Bearer " + accessToken,
            "Content-Type": "application/json"
        }
    })
    .then(function (response) {
        if (!response.ok) {
            return response.text().then(function (errorBody) {
                console.error("Salesforce API Error:", errorBody);
                let errorMsg = "HTTP " + response.status;
                try {
                    let errData = JSON.parse(errorBody);
                    if (errData[0] && errData[0].message) {
                        errorMsg = errData[0].message;
                    } else if (errData.message) {
                        errorMsg = errData.message;
                    }
                } catch(e) {
                    errorMsg = errorBody || errorMsg;
                }
                throw new Error(errorMsg);
            });
        }
        return response.json();
    })
    .then(function (data) {
        if (!data.records || data.records.length === 0) {
            hideLoading();
            rulesContainer.innerHTML = '<div class="empty-state"><p>No validation rules found on the Account object.</p></div>';
            showStatus("No validation rules found. Create some in your Salesforce org first.", "warning");
            return;
        }

        // Step 2: For each rule, fetch its full details (including Metadata & FullName)
        let ruleIds = data.records.map(function (r) { return r.Id; });
        let fetchPromises = ruleIds.map(function (id) {
            return fetchOneRule(id);
        });

        return Promise.all(fetchPromises);
    })
    .then(function (fullRules) {
        hideLoading();

        if (!fullRules) return; // was handled above (no records)

        // Filter out any failed fetches
        validationRules = fullRules.filter(function (r) { return r !== null; });
        modifiedRuleIds.clear();

        // Render them on the page
        renderRules();

        // Enable toolbar buttons
        enableAllBtn.disabled = false;
        disableAllBtn.disabled = false;

        showStatus("Found " + validationRules.length + " validation rule(s) on Account.", "success");
    })
    .catch(function (err) {
        hideLoading();
        console.error("Error fetching rules:", err);
        showStatus("Error: " + err.message, "error");
    });
});


/**
 * Fetch a single validation rule by ID to get its full Metadata and FullName.
 * Returns the full rule object, or null if it fails.
 */
function fetchOneRule(ruleId) {
    let url = instanceUrl + "/services/data/" + apiVersion
            + "/tooling/sobjects/ValidationRule/" + ruleId;

    return fetch(url, {
        headers: {
            "Authorization": "Bearer " + accessToken,
            "Content-Type": "application/json"
        }
    })
    .then(function (response) {
        if (!response.ok) {
            console.error("Failed to fetch rule " + ruleId);
            return null;
        }
        return response.json();
    })
    .catch(function (err) {
        console.error("Error fetching rule " + ruleId + ":", err);
        return null;
    });
}


// =====================================================
// 3. RENDER VALIDATION RULES
// =====================================================

/**
 * Display all validation rules as cards with toggle switches.
 */
function renderRules() {
    rulesContainer.innerHTML = ""; // Clear previous content

    validationRules.forEach(function (rule, index) {
        let isActive = rule.Metadata.active;
        let isModified = modifiedRuleIds.has(rule.Id);

        // Create the rule card HTML
        let card = document.createElement("div");
        card.className = "rule-card " + (isActive ? "active" : "inactive") + (isModified ? " modified" : "");
        card.style.animationDelay = (index * 0.05) + "s";
        card.id = "rule-" + rule.Id;

        card.innerHTML = ''
            + '<div class="rule-info">'
            + '  <div class="rule-name">' + escapeHtml(rule.ValidationName) + '</div>'
            + '  <div class="rule-description">' + escapeHtml(rule.Description || "No description") + '</div>'
            + '  <span class="rule-status ' + (isActive ? "active" : "inactive") + '">'
            + '    ' + (isActive ? "● Active" : "○ Inactive")
            + '  </span>'
            + '  ' + (isModified ? '<span style="font-size:12px;color:#e87722;margin-left:8px;">⚠ Modified</span>' : '')
            + '</div>'
            + '<label class="toggle-switch">'
            + '  <input type="checkbox" ' + (isActive ? "checked" : "") + ' data-rule-id="' + rule.Id + '">'
            + '  <span class="toggle-slider"></span>'
            + '</label>';

        rulesContainer.appendChild(card);
    });

    // Add event listeners to all toggle switches
    let toggles = rulesContainer.querySelectorAll('input[type="checkbox"]');
    toggles.forEach(function (toggle) {
        toggle.addEventListener("change", function () {
            let ruleId = this.getAttribute("data-rule-id");
            toggleRule(ruleId, this.checked);
        });
    });

    updateChangesSummary();
}


// =====================================================
// 4. TOGGLE RULES (Local Changes)
// =====================================================

/**
 * Toggle a single validation rule's active state (locally, not in Salesforce yet).
 * Changes are tracked and will be deployed when user clicks "Deploy".
 */
function toggleRule(ruleId, newActiveState) {
    // Find the rule in our array
    let rule = validationRules.find(function (r) { return r.Id === ruleId; });
    if (!rule) return;

    // Update the active state in the local Metadata
    rule.Metadata.active = newActiveState;

    // Track this rule as modified
    modifiedRuleIds.add(ruleId);

    // Enable deploy button since there are changes
    deployBtn.disabled = false;

    // Re-render to update the UI
    renderRules();

    showStatus(
        rule.ValidationName + " set to " + (newActiveState ? "Active" : "Inactive") + " (not deployed yet).",
        "info"
    );
}


/**
 * Enable ALL validation rules (locally)
 */
enableAllBtn.addEventListener("click", function () {
    validationRules.forEach(function (rule) {
        if (!rule.Metadata.active) {
            rule.Metadata.active = true;
            modifiedRuleIds.add(rule.Id);
        }
    });

    deployBtn.disabled = false;
    renderRules();
    showStatus("All rules set to Active (not deployed yet). Click Deploy to save.", "info");
});


/**
 * Disable ALL validation rules (locally)
 */
disableAllBtn.addEventListener("click", function () {
    validationRules.forEach(function (rule) {
        if (rule.Metadata.active) {
            rule.Metadata.active = false;
            modifiedRuleIds.add(rule.Id);
        }
    });

    deployBtn.disabled = false;
    renderRules();
    showStatus("All rules set to Inactive (not deployed yet). Click Deploy to save.", "info");
});


// =====================================================
// 5. DEPLOY CHANGES TO SALESFORCE
// =====================================================

/**
 * Deploy all modified rules to Salesforce using the Tooling API.
 * For each modified rule, we send a PATCH request with the updated Metadata.
 */
deployBtn.addEventListener("click", function () {
    if (modifiedRuleIds.size === 0) {
        showStatus("No changes to deploy.", "warning");
        return;
    }

    showLoading("Deploying " + modifiedRuleIds.size + " change(s) to Salesforce...");

    // Collect all modified rules
    let rulesToDeploy = validationRules.filter(function (r) {
        return modifiedRuleIds.has(r.Id);
    });

    // We'll deploy them one by one using Promises
    let deployPromises = rulesToDeploy.map(function (rule) {
        return deployOneRule(rule);
    });

    // Wait for ALL deployments to finish
    Promise.all(deployPromises)
        .then(function (results) {
            hideLoading();

            // Check if any failed
            let failures = results.filter(function (r) { return !r.success; });

            if (failures.length === 0) {
                // All succeeded!
                modifiedRuleIds.clear();
                deployBtn.disabled = true;
                renderRules();
                showStatus("✅ All changes deployed successfully to Salesforce!", "success");
            } else {
                // Some failed
                let failNames = failures.map(function (f) { return f.name; }).join(", ");
                showStatus("⚠ Some rules failed to deploy: " + failNames + ". Check console for details.", "error");
                renderRules();
            }
        })
        .catch(function (err) {
            hideLoading();
            console.error("Deploy error:", err);
            showStatus("Error during deployment: " + err.message, "error");
        });
});


/**
 * Deploy a single rule to Salesforce via Tooling API PATCH.
 * Returns a promise that resolves with {success: true/false, name: ruleName}.
 */
function deployOneRule(rule) {
    let url = instanceUrl + "/services/data/" + apiVersion
            + "/tooling/sobjects/ValidationRule/" + rule.Id;

    // Build the request body - we need FullName and Metadata
    let body = {
        FullName: rule.FullName,
        Metadata: rule.Metadata
    };

    return fetch(url, {
        method: "PATCH",
        headers: {
            "Authorization": "Bearer " + accessToken,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    })
    .then(function (response) {
        if (response.ok || response.status === 204) {
            // Success - PATCH returns 204 No Content on success
            console.log("Deployed successfully:", rule.ValidationName);
            modifiedRuleIds.delete(rule.Id);
            return { success: true, name: rule.ValidationName };
        } else {
            // Failed - try to get error details
            return response.text().then(function (text) {
                console.error("Failed to deploy " + rule.ValidationName + ":", text);
                return { success: false, name: rule.ValidationName, error: text };
            });
        }
    })
    .catch(function (err) {
        console.error("Network error deploying " + rule.ValidationName + ":", err);
        return { success: false, name: rule.ValidationName, error: err.message };
    });
}


// =====================================================
// 6. HELPER FUNCTIONS
// =====================================================

/**
 * Show a status message to the user
 */
function showStatus(message, type) {
    statusBar.style.display = "block";
    statusBar.className = "status-bar " + type;
    statusMessage.textContent = message;

    // Auto-hide after 8 seconds
    setTimeout(function () {
        statusBar.style.display = "none";
    }, 8000);
}

/**
 * Update the "Pending Changes" summary box
 */
function updateChangesSummary() {
    if (modifiedRuleIds.size === 0) {
        changesSummary.style.display = "none";
        return;
    }

    changesSummary.style.display = "block";
    changesList.innerHTML = "";

    validationRules.forEach(function (rule) {
        if (modifiedRuleIds.has(rule.Id)) {
            let li = document.createElement("li");
            li.innerHTML = (rule.Metadata.active ? "🟢" : "🔴") + " "
                + "<strong>" + escapeHtml(rule.ValidationName) + "</strong>"
                + " → " + (rule.Metadata.active ? "Activate" : "Deactivate");
            changesList.appendChild(li);
        }
    });
}

/**
 * Show the loading overlay
 */
function showLoading(text) {
    loadingText.textContent = text || "Loading...";
    loadingOverlay.style.display = "flex";
}

/**
 * Hide the loading overlay
 */
function hideLoading() {
    loadingOverlay.style.display = "none";
}

/**
 * Escape HTML to prevent XSS when inserting user data
 */
function escapeHtml(text) {
    if (!text) return "";
    let div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// =====================================================
// 7. INITIALIZATION
// =====================================================

// When the page loads:
// 1. Check if there's an OAuth callback (token in URL hash)
// 2. If not, check if there's a saved token in sessionStorage
// 3. Restore saved client ID if available

(function init() {
    // Restore saved client ID
    let savedClientId = localStorage.getItem("sf_client_id");
    if (savedClientId) {
        clientIdInput.value = savedClientId;
    }

    // Check for OAuth callback first
    if (window.location.hash && window.location.hash.includes("access_token")) {
        handleOAuthCallback();
    } else {
        // Check for existing login
        checkExistingLogin();
    }
})();
