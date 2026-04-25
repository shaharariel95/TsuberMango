# TsuberMango 🥭

A specialized agricultural management platform for mango shipping and pallet sorting. High-performance Vue.js frontend with an Express backend using Google Sheets as a primary database and Firebase for dynamic configuration.

## 🚀 Architecture Overview
- **Frontend**: Vue 3 (Vite, TailwindCSS)
- **Backend**: Node.js (Express, Passport.js Google OAuth)
- **Primary Database**: Google Sheets (Pallet records)
- **Dynamic Config**: Firebase Firestore (Kinds, Sizes, Destinations, Farmer settings)
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
- **Farmers**: Add new farmers. This automatically creates a corresponding tab in the Google Spreadsheet with headers.
- **Lists**: Edit Varieties (זנים), Sizes (גדלים), and Destinations (יעדים).
- **Control**: Toggle "Gidon" (גדעון) notes per farmer.
- **Sync**: Use the "Import from data.js" button to initialize the database from the original static code.

### Google Sheets Integration
- All pallet records are stored in real-time in the Google Spreadsheet.
- Deleting a farmer from the Settings tab provides an option to also permanently delete their Sheet tab.

---

## 🔒 Security Note
Backend routes are protected by Passport.js Google Strategy. Access is restricted to emails defined in the system. Dynamic configuration is stored in Firestore and is currently managed via client-side writes (Firestore Security Rules must allow this for Admins).
