# TsuberMango 🥭

A specialized agricultural management platform for mango shipping and pallet sorting. High-performance Vue.js frontend with an Express backend using **Firebase Firestore** as the primary database (multi-tenant, namespaced under `centers/{centerId}`), with Google Sheets retained only for shipping-label spreadsheets.

## 🚀 Architecture Overview
- **Frontend**: Vue 3 (Vite, TailwindCSS)
- **Backend**: Node.js (Express, Passport.js Google OAuth)
- **Primary Database**: Firebase Firestore — pallet records, audit, config, users, sessions, real-time events (all under `centers/{centerId}/…`), accessed via a storage-agnostic `RecordRepository`
- **Legacy Store**: Google Sheets — now only shipping-label spreadsheets + farmer-sheet provisioning
- **Deployment**: Firebase Hosting (Frontend) + Google Cloud Run (Backend)

---

## 🛠️ Development Setup

### Backend
1. `cd backend`
2. Create `.env` from template (needs `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, etc.)
3. Add `SheetsCred.env.json` (Google Service Account key)
4. `npm install`
5. `npm run dev`

### Frontend
1. `cd frontend`
2. Create `.env` (needs `VITE_API_BASE_URL` pointing to backend)
3. `npm install`
4. `npm run dev`

---

## 📦 Deployment to Production

### 1. Backend (Google Cloud Run)
Deployment is handled via the gcloud CLI from the `backend/` directory:
service name: backend-service
```bash
gcloud run deploy --source . --region europe-west1

```

### 2. Frontend (Firebase Hosting)
Building the optimized bundle and pushing to hosting:
```bash
cd frontend
npm run build
npx firebase-tools deploy --only hosting
```

---

## ⚙️ System Management (Admin)

The system is now fully dynamic. Admins can manage settings directly in the app:

### Settings Tab (ניהול הגדרות)
- **Farmers**: Add new farmers (stored in the tenant config; a farmer's Firestore records collection is created on first write).
- **Lists**: Edit Varieties (זנים), Sizes (גדלים), and Destinations (יעדים).
- **Control**: Toggle "Gidon" (גדעון) notes per farmer.
- **Sync**: Use the "Import from data.js" button to initialize the config lists from the original static code.

### Data storage
- Pallet records live in Firestore at `centers/{centerId}/farmers/{farmer}/records`, with real-time updates pushed to all clients via `centers/{centerId}/farmer_events`.
- Shipping labels are still generated as per-farmer Google Sheets.
- A one-time namespace seed (`backend/scripts/seedCenterNamespace.js`) copies existing `config`/`users` under `centers/{centerId}/`; `addTestFarmers.js` seeds test farmers.

---

## 🔒 Security Note
Backend routes are protected by the Passport.js Google OAuth strategy; access is restricted to emails in the Firestore `users` collection. All Firestore **writes** go through the backend (Admin SDK), which bypasses security rules — clients only **read** the tenant config + real-time events (see `frontend/firestore.rules`; those paths are `read: if true` because cookie sessions leave `request.auth` null client-side). Tightening to real per-tenant / per-user rules via Firebase Auth is planned (redesign task 23).
