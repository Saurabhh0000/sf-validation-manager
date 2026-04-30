


let accessToken = "";    
let instanceUrl = "";      
let apiVersion = "v62.0"; 

let validationRules = [];

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


// 1. OAuth 2.0 LOGIN

loginBtn.addEventListener("click", function () {
    let clientId = clientIdInput.value.trim();

    if (!clientId) {
        showStatus("Please enter your Connected App Client ID (Consumer Key).", "error");
        return;
    }

    localStorage.setItem("sf_client_id", clientId);


let redirectUri = window.location.origin + "/index.html";
    if (redirectUri.endsWith("/")) {
        redirectUri = redirectUri.slice(0, -1);
    }

    localStorage.setItem("sf_redirect_uri", redirectUri);

    console.log("Redirect URI being sent:", redirectUri);

    let authUrl = "https://login.salesforce.com/services/oauth2/authorize"
        + "?response_type=token"
        + "&client_id=" + encodeURIComponent(clientId)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&scope=api%20full";

    console.log("AUTH URL:", authUrl);
    window.location.href = authUrl;
});


function handleOAuthCallback() {
    let hash = window.location.hash;

    if (hash && hash.includes("access_token")) {
        let params = {};
        hash.substring(1).split("&").forEach(function (part) {
            let pair = part.split("=");
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
        });

        accessToken = params["access_token"];
        instanceUrl = params["instance_url"];

        sessionStorage.setItem("sf_access_token", accessToken);
        sessionStorage.setItem("sf_instance_url", instanceUrl);

        history.replaceState(null, "", window.location.pathname);

        showAppSection();
    }
}



function checkExistingLogin() {
    let savedToken = sessionStorage.getItem("sf_access_token");
    let savedInstance = sessionStorage.getItem("sf_instance_url");

    if (savedToken && savedInstance) {
        accessToken = savedToken;
        instanceUrl = savedInstance;
        showAppSection();
    }
}



function showAppSection() {
    loginSection.style.display = "none";
    appSection.style.display = "block";

    userDisplay.textContent = "Logged In";
    instanceDisplay.textContent = instanceUrl;

    getUserInfo();
}



function getUserInfo() {
    fetch(instanceUrl + "/services/data/v62.0/chatter/users/me", {
        headers: {
            "Authorization": "Bearer " + accessToken
        }
    })
    .then(res => res.json())
    .then(data => {
        console.log("User Info (Chatter):", data);

        if (data.name) {
            userDisplay.textContent = data.name;
        } else {
            userDisplay.textContent = "User";
        }
    })
    .catch(err => {
        console.log("User API failed:", err);
        userDisplay.textContent = "Logged In";
    });
}



logoutBtn.addEventListener("click", function () {
    sessionStorage.removeItem("sf_access_token");
    sessionStorage.removeItem("sf_instance_url");
    accessToken = "";
    instanceUrl = "";
    window.location.reload();
});


fetchBtn.addEventListener("click", function () {
    showLoading("Fetching validation rules...");

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

        let ruleIds = data.records.map(function (r) { return r.Id; });
        let fetchPromises = ruleIds.map(function (id) {
            return fetchOneRule(id);
        });

        return Promise.all(fetchPromises);
    })
    .then(function (fullRules) {
        hideLoading();

        if (!fullRules) return; 

        validationRules = fullRules.filter(function (r) { return r !== null; });
        modifiedRuleIds.clear();

        renderRules();

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



function renderRules() {
    rulesContainer.innerHTML = ""; 

    validationRules.forEach(function (rule, index) {
        let isActive = rule.Metadata.active;
        let isModified = modifiedRuleIds.has(rule.Id);

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

    let toggles = rulesContainer.querySelectorAll('input[type="checkbox"]');
    toggles.forEach(function (toggle) {
        toggle.addEventListener("change", function () {
            let ruleId = this.getAttribute("data-rule-id");
            toggleRule(ruleId, this.checked);
        });
    });

    updateChangesSummary();
}



function toggleRule(ruleId, newActiveState) {
    let rule = validationRules.find(function (r) { return r.Id === ruleId; });
    if (!rule) return;

    rule.Metadata.active = newActiveState;

    modifiedRuleIds.add(ruleId);

    deployBtn.disabled = false;

    renderRules();

    showStatus(
        rule.ValidationName + " set to " + (newActiveState ? "Active" : "Inactive") + " (not deployed yet).",
        "info"
    );
}



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



deployBtn.addEventListener("click", function () {
    if (modifiedRuleIds.size === 0) {
        showStatus("No changes to deploy.", "warning");
        return;
    }

    showLoading("Deploying " + modifiedRuleIds.size + " change(s) to Salesforce...");

    let rulesToDeploy = validationRules.filter(function (r) {
        return modifiedRuleIds.has(r.Id);
    });

    let deployPromises = rulesToDeploy.map(function (rule) {
        return deployOneRule(rule);
    });

    Promise.all(deployPromises)
        .then(function (results) {
            hideLoading();

            let failures = results.filter(function (r) { return !r.success; });

            if (failures.length === 0) {
                modifiedRuleIds.clear();
                deployBtn.disabled = true;
                renderRules();
                showStatus("✅ All changes deployed successfully to Salesforce!", "success");
            } else {
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



function deployOneRule(rule) {
    let url = instanceUrl + "/services/data/" + apiVersion
            + "/tooling/sobjects/ValidationRule/" + rule.Id;

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
            console.log("Deployed successfully:", rule.ValidationName);
            modifiedRuleIds.delete(rule.Id);
            return { success: true, name: rule.ValidationName };
        } else {
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



function showStatus(message, type) {
    statusBar.style.display = "block";
    statusBar.className = "status-bar " + type;
    statusMessage.textContent = message;

    setTimeout(function () {
        statusBar.style.display = "none";
    }, 8000);
}


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


function showLoading(text) {
    loadingText.textContent = text || "Loading...";
    loadingOverlay.style.display = "flex";
}


function hideLoading() {
    loadingOverlay.style.display = "none";
}


function escapeHtml(text) {
    if (!text) return "";
    let div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}



(function init() {
    let savedClientId = localStorage.getItem("sf_client_id");
    if (savedClientId) {
        clientIdInput.value = savedClientId;
    }

    if (window.location.hash && window.location.hash.includes("access_token")) {
        handleOAuthCallback();
    } else {
        checkExistingLogin();
    }
})();
