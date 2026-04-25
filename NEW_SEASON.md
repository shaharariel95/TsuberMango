# TsuberMango - New Season Setup & Deployment Guide

This document explains how the project works, how to set up the system for a new season, and how to deploy updates to both the frontend and the backend.

## 1. How The Project Works
- **Frontend (Firebase)**: A Vue 3 + Vite Single Page Application styled with TailwindCSS.
- **Backend (Google Cloud)**: A Node.js Express server that exposes an API for the frontend and enforces Admin/User roles (roles are statically defined in `backend/users.json`).
- **Database (Google Sheets)**: The system doesn't use a traditional database. Instead, the backend uses the Google Sheets API to read and write directly to Google Sheets, effectively using them as database tables. 

---

## 2. Setting Up New Sheets for the New Season
To transition to the new season, you need to point the backend to brand-new Google Sheets. Follow these steps carefully:

1. **Duplicate the Old Sheets**
   Go into your Google Drive and make a copy of last year's sheets. This is highly important as it ensures you keep the exact column structure and headers that the backend API expects.

2. **Retrieve the New IDs**
   Open the new Google Sheets and copy the **Spreadsheet ID** from the URL. 
   *(Example: `https://docs.google.com/spreadsheets/d/`<THE_NEW_ID>`/edit`)*

3. **Update Local Environment**
   Open `backend/.env` and replace the old IDs with the new ones.
   ```env
   SPREADSHEET_ID=<NEW_ID>
   SHIPPING_LABELS_ID_TSUBERI=<NEW_ID>
   SHIPPING_LABELS_ID_AVNER=<NEW_ID>
   SHIPPING_LABELS_ID_IDAN=<NEW_ID>
   SHIPPING_LABELS_ID_PESAH=<NEW_ID>
   SHIPPING_LABELS_ID_KOPLER=<NEW_ID>
   SHIPPING_LABELS_ID_SHAHAK=<NEW_ID>
   ```

4. **Update Production Environment**
   Because the backend runs on Google Cloud, updating the local `.env` won't affect the live production server. 
   - Log into the Google Cloud Console.
   - Navigate to your service's settings (Cloud Run).
   - Edit your deployment / revision and update the Environment Variables there with the new IDs.
   - Deploy the new revision.

---

## 3. How to Deploy (Pushing Updates)

### Deploying the Frontend (Firebase Hosting)
Whenever you make changes to the Vue components in the `frontend/` directory, you need to build and deploy to Firebase.

Open your terminal and run the following commands:
```bash
cd frontend
npm run build
npx firebase-tools deploy --only hosting
```
*(If you have `firebase-tools` installed globally, you can omit the `npx firebase-tools` prefix and just use `firebase deploy`)*

### Deploying the Backend (Google Cloud)
Thanks to the `Dockerfile` in the backend, the server is containerized and most likely runs on Google Cloud Run. Whenever you update Express routes, logic, or add dependencies, you must push to GCP.

Open your terminal and run:
```bash
cd backend
gcloud run deploy --source .
```
*Note: The gcloud CLI might prompt you for the Service Name and Region. Be sure to provide whatever name you picked previously for this server (e.g., `tsuberi-mango-backend`).*
