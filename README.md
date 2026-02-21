# 💰 Expense Tracker — Ionic Angular + Firebase

A full-featured mobile expense tracking app built with **Ionic 6**, **Angular 15**, **Firebase**, and **Capacitor 5** for Android APK generation via **Codemagic CI/CD**.

---

## ✨ Features

- 🔐 **Authentication** — Sign Up, Login, Logout with Firebase Auth
- 📊 **Dashboard** — View all expenses with stats (today, monthly, all-time)
- ➕ **Add/Edit Expenses** — Full form with category selection, date, notes
- 🗂️ **Categories** — 8 default categories + create custom ones
- 🔍 **Filter** — Filter by category and/or date range
- 📄 **PDF Export** — Download filtered expense report as PDF
- 👤 **Profile** — View account info and spending stats
- 🗑️ **Delete** — Remove expenses with confirmation
- 📱 **Android APK** — Build and distribute via Codemagic CI/CD

---

## 🚀 Setup Instructions

### Step 1: Install Node.js v22+

Make sure you have Node.js v22 or higher installed. You can use nvm:
```bash
nvm install 22
nvm use 22
```

### Step 2: Install Ionic CLI

```bash
npm install -g @ionic/cli@7
```

### Step 3: Install Dependencies

```bash
cd expense-tracker
yarn install
```

### Step 4: Create Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add Project"** → Enter project name → Create
3. Go to **Authentication** → **Sign-in method** → Enable **Email/Password**
4. Go to **Firestore Database** → **Create database** → Start in **test mode**
5. Go to **Project Settings** → **General** → scroll to **"Your apps"**
6. Click the **web icon (`</>`)** to register a web app
7. Copy the Firebase config

### Step 5: Add Firebase Config

Open `src/environments/environment.ts` and replace with your config:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
  }
};
```

Do the same for `src/environments/environment.prod.ts`.

### Step 6: Set Firestore Security Rules

In Firebase Console → Firestore → **Rules** tab, paste the contents of `firestore.rules`.

### Step 7: Set Firestore Indexes

In Firebase Console → Firestore → **Indexes** tab → Import `firestore.indexes.json`, OR create manually:
- Collection: `expenses`, Fields: `userId ASC`, `date DESC`
- Collection: `categories`, Fields: `userId ASC`, `name ASC`

### Step 8: Run the App

```bash
ionic serve
```

Open [http://localhost:8100](http://localhost:8100) in your browser.

---

## 📱 Build Android APK (via Codemagic)

### Local Setup (One-time)

```bash
# Build web assets
yarn build

# Initialize Capacitor (if not done)
npx cap init

# Add Android platform
npx cap add android

# Sync web build to Android
npx cap sync android

# Push to GitHub
git add .
git commit -m "Added Capacitor Android setup"
git push origin master
```

### Codemagic CI/CD

This project uses `codemagic.yaml` at the root for automated APK builds.

1. Connect your GitHub repo to [codemagic.io](https://codemagic.io)
2. Select the `master` branch
3. Select the `codemagic.yaml` workflow
4. Click **Start new build**
5. Once build succeeds, download `app-debug.apk` from the **Artifacts** section

### Install APK on Android Phone

1. Download the APK from Codemagic
2. Transfer to your phone via USB or Google Drive
3. On your phone: **Settings → Security → Enable "Install from Unknown Sources"**
4. Open the APK and click **Install**

---

## 📁 Project Structure

```
expense-tracker/
├── android/                           # Capacitor Android project
├── www/                               # Web build output
├── src/
│   ├── app/
│   │   ├── guards/
│   │   │   └── auth.guard.ts          # Route protection
│   │   ├── models/
│   │   │   └── models.ts              # TypeScript interfaces
│   │   ├── pages/
│   │   │   ├── signup/                # Sign up page
│   │   │   ├── login/                 # Login page
│   │   │   ├── tabs/                  # Tab bar layout
│   │   │   ├── dashboard/             # Main expense list + stats
│   │   │   ├── add-expense/           # Add/Edit expense form
│   │   │   ├── categories/            # Manage categories
│   │   │   └── profile/               # User profile & stats
│   │   ├── services/
│   │   │   ├── auth.service.ts        # Firebase Auth
│   │   │   ├── expense.service.ts     # Firestore expenses CRUD
│   │   │   ├── category.service.ts    # Firestore categories CRUD
│   │   │   └── export.service.ts      # PDF generation
│   │   ├── app.module.ts
│   │   ├── app-routing.module.ts
│   │   └── app.component.ts
│   ├── environments/
│   │   ├── environment.ts             # ← ADD YOUR FIREBASE CONFIG HERE
│   │   └── environment.prod.ts
│   ├── global.scss
│   └── theme/variables.scss
├── codemagic.yaml                     # Codemagic CI/CD config
├── capacitor.config.ts                # Capacitor configuration
├── firestore.rules                    # Security rules
├── firestore.indexes.json             # Composite indexes
├── angular.json                       # Angular configuration
└── package.json
```

---

## 🗄️ Firestore Data Structure

```
/users/{uid}
  - firstName, lastName, email, createdAt

/categories/{id}
  - name, icon, color, userId, isDefault, createdAt

/expenses/{id}
  - title, amount, categoryId, categoryName, categoryIcon
  - categoryColor, date, notes, userId, createdAt
```

---

## 🔧 Default Categories

When a user signs up, 8 default categories are automatically created:
- 🍽️ Food & Dining
- 🚗 Transportation
- 🛍️ Shopping
- 🎮 Entertainment
- 💊 Health
- 📄 Bills & Utilities
- 📚 Education
- ⋯ Other

---

## 📦 Build for Production

```bash
yarn build --prod
```

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Ionic | 6.x | UI Framework |
| Angular | 15.x | Frontend Framework |
| Firebase Auth | 9.x | Authentication |
| Cloud Firestore | 9.x | Database |
| AngularFire | 7.x | Firebase + Angular integration |
| Capacitor | 5.x | Native Android/iOS bridge |
| jsPDF | 2.x | PDF Export |
| Codemagic | - | CI/CD & APK builds |
| Node.js | 22.x | Runtime |
