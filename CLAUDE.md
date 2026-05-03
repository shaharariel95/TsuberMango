# TsuberMango — CLAUDE.md

## Project Overview

TsuberMango is a full-stack web application for managing mango pallet records, weights, destinations, and shipping labels for farmers. The UI is in Hebrew, rendered right-to-left (`lang="he" dir="rtl"`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 + Vite 5, Vue Router 4, Tailwind CSS 3, Axios |
| Backend | Node.js + Express 5 |
| Primary DB | Google Sheets API (googleapis) |
| Config DB | Firebase Firestore |
| Auth | Google OAuth 2.0 (passport-google-oauth20), session-based |
| PDF | pdfmake |
| Logging | winston |
| Hosting | Firebase Hosting (frontend), Google Cloud Run (backend) |

---

## Repository Structure

```
/
├── frontend/          # Vue 3 app
└── backend/           # Express server
```

### Frontend (`/frontend`)

- `src/main.js` — App entry point; initializes Vue, Router, Axios (`withCredentials: true`), and Firebase.
- `src/router.js` — All routes + `beforeEach` guard (calls `/api/auth/me` to verify session).
- `src/components/` — All page-level components (see Routes section).
- `src/data/data.js` — Static fallback data: mango kinds, sizes, destinations, farmerConfigs.
- `src/data/printData.js` — Sticker PDF generation using pdfmake. **Lazy-loaded**: pdfmake and vfs_fonts are dynamically imported inside `createStickerPDF()` so they don't block initial page load.
- `fonts/vfs_fonts.js` — Custom Rubik font embedded as a VFS blob for pdfmake (~750 kB). Exports the font map directly as default; assign with `pdfMake.vfs = pdfFonts` (not `pdfFonts.vfs`).
- `vite.config.js` — Dev proxy: `/api` → `http://localhost:3000`. Credentials included.
- `tailwind.config.js` — Custom `mango` color palette (yellow→brown) and `sidebar` dark theme.

### Backend (`/backend`)

- `server.js` — Express entry: CORS, sessions, Passport OAuth, dev-bypass route, Firebase Admin init.
- `routes/sheetRoutes.js` — All `/api/*` sheet endpoints.
- `controllers/sheetController.js` — Pallet record CRUD logic.
- `controllers/labelController.js` — Shipping label generation logic.
- `services/googleSheetsService.js` — Google Sheets API wrapper (primary data store).
- `services/shippingLabelsService.js` — Per-farmer shipping label spreadsheet management.
- `models/sheetModel.js` — Pallet data model + validation + `toArray()` for Sheets.
- `utils/logger.js` — Winston logger (`logger.info`, `logger.error`), console transport.
- `users.json` — Hardcoded email → role mapping for authorization.

---

## Routes & Permissions

### Frontend Routes

| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/` | PalletInput | Admin only |
| `/Weight` | Weight | Admin only |
| `/SentPallets` | SentPallets | Admin only |
| `/Settings` | Settings | Admin only |
| `/sentPalletsForMark` | sentPalletsForMark | Auth required |
| `/Destination` | Destination | Auth required |
| `/DestinationsSummary` | DestinationsSummary | Auth required |

The `beforeEach` guard in `router.js` hits `/api/auth/me` on every navigation. Non-admins are redirected to `/Destination`. Unauthenticated users go to `/login`.

### Backend API Endpoints

All `/api/*` routes require `ensureAuthenticated`. Admin-only routes additionally require `ensureAdmin`.

| Method | Path | Controller | Notes |
|---|---|---|---|
| POST | `/api/records` | `createRecord` | Create new pallet record |
| GET | `/api/farmers/:farmer/records` | `getAllRecords` | All records for farmer |
| GET | `/api/farmers/:farmer/records/destinations` | `getAllRecordsforDestinations` | Records with `mark=true` |
| GET | `/api/farmers/:farmer/records/pallet/:palletNumber` | `getRecordsByPallet` | ⚠ Service method missing |
| GET | `/api/farmers/:farmer/records/lastPallet` | `getLastPallet` | Highest pallet number |
| PUT | `/api/farmers/:farmer/records/resetPallets` | `resetSentStatus` | Bulk reset sent=false |
| PUT | `/api/farmers/:farmer/records/updatemany` | `updateMultipleRecords` | Batch update records |
| PUT | `/api/farmers/:farmer/records/:id` | `updateRecord` | Single record update |
| POST | `/api/shipping/newlabel/` | `createNewShippingLabel` | Create shipping label sheet |
| POST | `/api/farmers/:farmer/destinations/toSend` | `sendToDestination` | Set mark=true |
| POST | `/api/farmers/:farmer/destinations/Sent` | `removeFromDestination` | Set mark=false |
| GET | `/api/auth/google` | — | OAuth initiation |
| GET | `/api/auth/google/callback` | — | OAuth callback |
| GET | `/api/auth/me` | — | Current user info |
| GET | `/api/auth/logout` | — | Logout |
| POST | `/api/admin/create-sheet` | — | Admin: create farmer sheet |
| POST | `/api/admin/delete-sheet` | — | Admin: delete farmer sheet |
| POST | `/api/admin/config` | — | Admin: save config to Firestore |

---

## Authentication Flow

1. User hits `/login` → clicks "Sign in with Google".
2. Redirected to `GET /api/auth/google` (Passport initiates OAuth).
3. Google redirects to `GET /api/auth/google/callback`.
4. Backend checks email against `users.json`. If not found → redirected to `/api/auth/unauthorized` (session cleared).
5. If authorized → session created `{email, role}` → redirected to frontend.
6. Frontend router guard calls `/api/auth/me` on every navigation to verify.

**Dev bypass**: When `DEV_BYPASS_AUTH=true`, `GET /api/auth/dev-login?role=admin&email=...` skips OAuth entirely. Never enable this in production.

---

## Database: Google Sheets

All pallet data lives in Google Sheets. There is **no SQL/NoSQL DB**. One sheet per farmer inside the main spreadsheet.

### Main Spreadsheet Columns (A–M)

| Col | Index | Field | Notes |
|---|---|---|---|
| A | 0 | ID | Auto-incremented |
| B | 1 | תאריך משלוח | Shipment date |
| C | 2 | מספר תעודה | Card ID |
| D | 3 | תאריך קטיף | Harvest date |
| E | 4 | מספר משטח | Pallet number |
| F | 5 | זן | Kind/variety |
| G | 6 | גודל | Size |
| H | 7 | ארגזים | Boxes |
| I | 8 | משקל | Weight |
| J | 9 | יעד | Destination |
| K | 10 | נשלח | Sent (boolean) |
| L | 11 | גדעון | Gidon flag (boolean) |
| M | 12 | סימון | Mark (boolean) |

Columns 10 (`sent`) and 12 (`mark`) are the two bulk-update targets used most frequently.

### Shipping Labels Spreadsheets

Each farmer has a dedicated spreadsheet for shipping labels (IDs in `.env`). Labels are created by:
1. Copying the `"base"` sheet template.
2. Auto-incrementing the ID from cell D7.
3. Writing pallet data starting at row 11.
4. Setting B6 (date), B8 (destination), C24 (unique pallet count formula).

---

## Firebase

- **Firestore** (frontend + backend): Stores dynamic config — lists of kinds, sizes, destinations, and farmer settings. Admin settings UI writes here.
- **Firebase Hosting**: Serves the built frontend (`dist/`) with SPA rewrite (`/* → /index.html`).
- **Firebase Admin SDK** (backend): Initialized with `SheetsCred.env.json` service account.

---

## SheetModel

`backend/models/sheetModel.js` — validates and serializes pallet data before writing to Sheets.

Required fields: `harvestDate`, `palletNumber`, `boxes`, `kind`, `size`. Throws `Error` if any are missing.

`toArray()` returns a 12-element array (columns B–M; ID in column A is auto-assigned by the service).

---

## PalletTable Layout Contract

`PalletTable.vue` uses `h-full flex flex-col` with an internal `overflow-auto` table wrapper so the toolbar, search bar, and `<thead>` all stay sticky while rows scroll. **Any page component that renders `<PalletTable>` must add `h-full` to its own root `<div>`**, otherwise the height chain breaks and scrolling stops working. Current pages that do this: `Destination.vue`, `Weight.vue`, `SentPallets.vue`, `sentPalletsForMark.vue`.

---

## Known Issues

- `sheetsService.getRowsByPallet()` is called in `sheetController.getRecordsByPallet()` but is **not implemented** in `googleSheetsService.js`. That endpoint is broken.

---

## Environment Variables

### Frontend (`.env.development` / `.env.production`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (`http://localhost:3000` / `https://api.tsuberi.com`) |
| `VITE_DEV_MODE` | Enables dev-specific UI behavior |
| `VITE_FIREBASE_*` | Firebase SDK config (API key, project ID, etc.) |

### Backend (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Express port (3000) |
| `NODE_ENV` | `development` / `production` |
| `DEV_BYPASS_AUTH` | `true` enables dev login bypass — never in production |
| `SPREADSHEET_ID` | Main pallet data spreadsheet |
| `SHIPPING_LABELS_ID_*` | Per-farmer shipping label spreadsheets |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth credentials |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI |
| `SESSION_SECRET` | Express session secret |
| `FRONT_CORS` | Comma-separated allowed CORS origins |
| `FIREBASE_PROJECT_ID` | Firebase project |

---

## Running Locally

```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend (port 5173)
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3000`, so no CORS issues in dev.

---

## Rules to Follow

1. **No traditional DB** — all persistence goes through `googleSheetsService.js`. When adding fields, update `SheetModel`, the column mapping table, and the service.
2. **Auth checks** — backend endpoints need `ensureAuthenticated`; admin ones also need `ensureAdmin`. Frontend routes use `meta: { requiresAuth, requiresAdmin }`.
3. **Tailwind only** — use Tailwind utility classes; avoid scoped vanilla CSS unless truly necessary.
4. **Logging** — add `logger.info` / `logger.error` calls in any new controller or service method.
5. **users.json** — user authorization is static. Adding a user requires editing this file manually.
6. **Hebrew / RTL** — the UI is Hebrew. Keep labels and messages in Hebrew where consistent with existing code.
