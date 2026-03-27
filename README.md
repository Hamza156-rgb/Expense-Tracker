# Money Map (Ionic Angular + Firebase)

A mobile-first expense tracking app built with Ionic 6, Angular 15, Firebase Auth, and Cloud Firestore.

## Features

- Email/password authentication with Firebase
- Sign up, login, logout, and forgot password (reset email)
- Auth loading screen that auto-redirects based on login state
- Route guards:
- `PublicGuard` blocks authenticated users from `/login` and `/signup`
- `AuthGuard` protects `/tabs` and `/add-expense`
- Dashboard with:
- Total filtered spend
- Today spend
- This month spend
- Expense list with edit/delete actions
- Category + date range filtering
- PDF export of currently filtered expenses
- Expense management:
- Add new expense
- Edit existing expense
- Delete expense with confirmation
- Category management:
- 8 default categories created on signup
- Create/edit custom categories
- Prevent deletion of default categories
- Profile screen with spending stats and account details

## Tech Stack

- Ionic 6
- Angular 15
- AngularFire 7 (`compat` APIs)
- Firebase Auth + Cloud Firestore
- Capacitor 5
- jsPDF + jspdf-autotable

## Prerequisites

- Node.js LTS (recommended)
- Ionic CLI

```bash
npm install -g @ionic/cli
```

## Getting Started

1. Clone the repo

```bash
git clone <your-repo-url>
cd expense-tracker
```

2. Install dependencies

```bash
npm install
```

3. Configure Firebase

- Create a Firebase project
- Enable Email/Password sign-in in Authentication
- Create Firestore database
- Add your Firebase web config to:
- `src/environments/environment.ts`
- `src/environments/environment.prod.ts`

Example:

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: '...',
    appId: '...'
  }
};
```

4. Apply Firestore rules and indexes

- Rules file: `firestore.rules`
- Indexes file: `firestore.indexes.json`

5. Run the app

```bash
ionic serve
```

App runs at `http://localhost:8100`.

## Main Routes

- `/` → auth loading page
- `/login` → login (public only)
- `/signup` → sign up (public only)
- `/tabs/dashboard` → dashboard
- `/tabs/profile` → profile
- `/tabs/categories` → categories
- `/add-expense` and `/tabs/add-expense` → add/edit expense page

## Data Model (Firestore)

`users/{uid}`
- `firstName`, `lastName`, `email`, `createdAt`

`categories/{id}`
- `name`, `icon`, `color`, `userId`, `isDefault`, `createdAt`

`expenses/{id}`
- `title`, `amount`, `categoryId`, `categoryName`, `categoryIcon`, `categoryColor`, `date`, `notes`, `userId`, `createdAt`

## Default Categories

Created automatically when a new user signs up:

- Food & Dining
- Transportation
- Shopping
- Entertainment
- Health
- Bills & Utilities
- Education
- Other

## Build

Web build:

```bash
npm run build
```

Android sync/build (Capacitor):

```bash
npx cap sync android
npx cap open android
```

## Project Structure

```text
src/app/
├── guards/
│   ├── auth.guard.ts
│   └── public.guard.ts
├── models/
│   └── models.ts
├── pages/
│   ├── auth-loading/
│   ├── login/
│   ├── signup/
│   ├── tabs/
│   ├── dashboard/
│   ├── add-expense/
│   ├── categories/
│   └── profile/
└── services/
    ├── auth.service.ts
    ├── expense.service.ts
    ├── category.service.ts
    └── export.service.ts
```
