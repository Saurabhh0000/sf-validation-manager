# SF Validation Rule Manager

A simple web application (HTML, CSS, JavaScript) that connects to a Salesforce Developer Org and lets you manage **Account Validation Rules** — view, activate, deactivate, and deploy changes.

---

## 🎥 How It Works

1. **Login** → Click "Login to Salesforce" using OAuth 2.0
2. **Fetch** → Click "Get Validation Rules" to load all Account validation rules
3. **Toggle** → Use the toggle switch to activate/deactivate individual rules
4. **Bulk Actions** → "Enable All" or "Disable All" buttons for quick changes
5. **Deploy** → Click "Deploy Changes" to push your modifications to Salesforce

---

## 📋 Setup Instructions

### Step 1: Create a Salesforce Developer Org

1. Go to [developer.salesforce.com/signup](https://developer.salesforce.com/signup)
2. Fill in the form and create your free Developer Org
3. Verify your email and set your password

### Step 2: Create Validation Rules on Account

1. In Salesforce, go to **Setup → Object Manager → Account → Validation Rules**
2. Create 4-5 validation rules. Here are examples:

| Rule Name | Formula | Error Message |
|-----------|---------|---------------|
| Phone_Required | `ISBLANK(Phone)` | Phone number is required. |
| Website_Format | `AND(NOT(ISBLANK(Website)), NOT(BEGINS(Website, "http")))` | Website must start with http:// or https:// |
| Industry_Required | `ISBLANK(TEXT(Industry))` | Please select an Industry. |
| Rating_Required | `ISBLANK(TEXT(Rating))` | Rating is required for all accounts. |
| Annual_Revenue_Positive | `AND(NOT(ISBLANK(AnnualRevenue)), AnnualRevenue <= 0)` | Annual Revenue must be greater than 0. |

### Step 3: Create a Connected App

1. Go to **Setup → App Manager → New Connected App**
2. Fill in:
   - **Connected App Name**: `ValidationRuleManager`
   - **API Name**: `ValidationRuleManager`
   - **Contact Email**: your email
3. Check ✅ **"Enable OAuth Settings"**
4. **Callback URL**: `http://localhost:5500/sf-validation-manager/index.html`
   - (Adjust if using a different port or URL)
5. **Selected OAuth Scopes**: Add these:
   - `Full access (full)`
   - `Manage user data via APIs (api)`
6. **Uncheck** "Require Proof Key for Code Exchange (PKCE)"
7. Click **Save** → then click **Continue**
8. Wait **2-10 minutes** for the app to activate
9. Click **Manage Consumer Details** → copy the **Consumer Key**

### Step 4: Enable CORS in Salesforce

1. Go to **Setup → CORS** (search "CORS" in Quick Find)
2. Click **New**
3. **Origin URL Pattern**: `http://localhost:5500`
4. Save

### Step 5: Run the App

#### Option A: VS Code Live Server (Recommended)
1. Open this folder in VS Code
2. Install the **Live Server** extension
3. Right-click `index.html` → **Open with Live Server**
4. It opens at `http://localhost:5500`

#### Option B: Python Simple Server
```bash
cd sf-validation-manager
python3 -m http.server 5500
```
Then open `http://localhost:5500/index.html`

#### Option C: Node.js
```bash
npx -y serve -l 5500
```

---

## 🔧 Technologies Used

- **HTML5** — Page structure
- **CSS3** — Styling (no frameworks)
- **Vanilla JavaScript** — All logic
- **Salesforce OAuth 2.0** — User-Agent (Implicit) flow for authentication
- **Salesforce Tooling API** — To read and update validation rules

---

## 📁 Project Structure

```
sf-validation-manager/
├── index.html      ← Main HTML page
├── style.css       ← All styles
├── app.js          ← JavaScript logic (OAuth, API calls, UI)
└── README.md       ← This file
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Login redirects but nothing happens | Check your Callback URL matches exactly in the Connected App |
| "Blocked by CORS policy" error | Add your origin URL in Setup → CORS |
| "HTTP 401" error | Your session expired. Click Logout and Login again |
| No validation rules found | Make sure you created rules on the **Account** object |
| Deploy fails | Check browser console (F12) for detailed error messages |

---

## 📌 Notes

- This app uses the **Implicit Grant (User-Agent)** OAuth flow — the access token is in the URL hash and stored in `sessionStorage`
- Tokens expire after the Salesforce session timeout (default ~2 hours)
- Changes are **local** until you click **Deploy** — this gives you a chance to review before pushing to Salesforce
- The Tooling API is used to both query and update ValidationRule metadata
