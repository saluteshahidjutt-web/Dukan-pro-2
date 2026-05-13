# How to Host your App on Firebase Hosting

Since you want to host this app on your own Firebase project (`gen-lang-client-0827279424`), follow these steps on **your computer**:

### 1. Install Firebase Tools
If you haven't already, install the Firebase CLI:
```bash
npm install -g firebase-tools
```

### 2. Login and Initialize
Open your terminal in the project folder and run:
```bash
firebase login
firebase init hosting
```
- Select **"Use an existing project"** and choose `gen-lang-client-0827279424`.
- What do you want to use as your public directory? Enter **`dist`**.
- Configure as a single-page app (rewrite all urls to /index.html)? Enter **`Yes`**.
- Set up automatic builds and deploys with GitHub? Enter **`No`**.

### 3. Build the App
Run the build command to generate the production files:
```bash
npm run build
```

### 4. Deploy
Deploy the files to Firebase:
```bash
firebase deploy --only hosting
```

Your app will then be live at `https://gen-lang-client-0827279424.web.app` or `https://gen-lang-client-0827279424.firebaseapp.com`.

---

### Important: Authorized Domains
Make sure you add your Firebase Hosting domain to the **Authorized Domains** in the Firebase Console (Authentication > Settings > Authorized Domains) if you haven't already.

Current Authorizations Needed:
- `localhost` (for local testing)
- `ais-dev-ksuvaniosyfjqu7guwziey-604133282907.asia-southeast1.run.app` (for AI Studio development)
- `ais-pre-ksuvaniosyfjqu7guwziey-604133282907.asia-southeast1.run.app` (for AI Studio shared preview)
- `gen-lang-client-0827279424.web.app` (your own hosting)
- `gen-lang-client-0827279424.firebaseapp.com` (your own hosting)
