# 🚀 SF Validation Rule Manager

A web application to **view, enable, disable, and deploy Salesforce Account Validation Rules** using the Salesforce Tooling API.

---

## 🌍 Live Demo

👉 https://validation-manager-salesforce.netlify.app

---

## 🎯 Features

- 🔐 Login using Salesforce OAuth 2.0 (Implicit Flow)
- 📥 Fetch all Account validation rules
- 🔄 Activate / Deactivate rules
- ⚡ Bulk enable/disable all rules
- 🚀 Deploy changes back to Salesforce
- 👤 Display logged-in user info
- 🧠 Track pending changes before deployment

---

## 🛠️ Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Salesforce OAuth 2.0
- Salesforce Tooling API
- Netlify (Hosting)

---

## 🔐 Authentication Flow

1. User enters **Consumer Key**
2. Redirect to Salesforce login
3. User authorizes access
4. Access token returned in URL hash
5. App uses token to call Salesforce APIs

---

## ⚙️ Salesforce Setup

### 1. Create Connected App

Go to:

Setup → App Manager → New Connected App

Fill:

- App Name: ValidationRuleManager
- Enable OAuth Settings

### Callback URL

https://validation-manager-salesforce.netlify.app/index.html

### OAuth Scopes

- Full access (full)
- Access and manage your data (api)

### Important Settings

- Disable PKCE
- Do NOT require client secret

Save and wait 2–5 minutes

---

## 🌐 Enable CORS

Go to:

Setup → CORS → New

Add:

https://validation-manager-salesforce.netlify.app

---

## 🔑 Get Consumer Key

- Open your Connected App
- Click Manage Consumer Details
- Copy the Consumer Key
- Paste it into the app UI

---

## 🚀 How to Use

1. Open:
https://validation-manager-salesforce.netlify.app

2. Paste your Consumer Key

3. Click Login to Salesforce

4. After login:
- Click Get Validation Rules
- Toggle rules
- Click Deploy Changes

---

## 📁 Project Structure

validation-manager/
├── index.html
├── style.css
├── app.js
└── README.md

---

## ⚠️ Troubleshooting

redirect_uri_mismatch → Check callback URL exactly matches

CORS Error → Add Netlify domain in CORS

401 Unauthorized → Login again

---

## 🙌 Author

Saurabh Keshri
