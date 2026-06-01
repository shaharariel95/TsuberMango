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

- `src/main.js` — App entry point; initializes Vue, Router, Axios (`withCredentials: true`), and Firebase. Exports `db` (Firestore instance).
- `src/router.js` — All routes + `beforeEach` guard (calls `/api/auth/me` to verify session).
- `src/components/` — All page-level components (see Routes section).
- `src/composables/useFarmerEvents.js` — Real-time update composable. Subscribes to `farmer_events/{farmer}` via `onSnapshot`, applies deltas to the caller's `pallets` ref in-place, and returns a reactive `highlightedIds` Set for flash animations. See Real-Time Updates section.
- `src/data/data.js` — Static fallback data: mango kinds, sizes, destinations, farmerConfigs.
- `src/data/printData.js` — Sticker PDF generation using pdfmake. **Lazy-loaded**: pdfmake and vfs_fonts are dynamically imported inside `createStickerPDF()` so they don't block initial page load.
- `fonts/vfs_fonts.js` — Custom Rubik font embedded as a VFS blob for pdfmake (~750 kB). Exports the font map directly as default; assign with `pdfMake.vfs = pdfFonts` (not `pdfFonts.vfs`).
- `vite.config.js` — Dev proxy: `/api` → `http://localhost:3000`. Credentials included.
- `tailwind.config.js` — Custom `mango` color palette (yellow→brown) and `sidebar` dark theme.

### Backend (`/backend`)

- `server.js` — Express entry: CORS, sessions, Passport OAuth, dev-bypass route, Firebase Admin init.
- `routes/sheetRoutes.js` — All `/api/*` sheet endpoints.
- `controllers/sheetController.js` — Pallet record CRUD logic. Each write emits a fire-and-forget Firestore event after the Sheets write succeeds.
- `controllers/labelController.js` — Shipping label generation logic.
- `services/googleSheetsService.js` — Google Sheets API wrapper (primary data store).
- `services/firestoreEventService.js` — Emits real-time events to `farmer_events/{farmer}` in Firestore. All functions are fire-and-forget (`emit().catch(logger.error)`). See Real-Time Updates section.
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
| GET | `/api/admin/users` | — | Admin: list all users |
| POST | `/api/admin/users` | — | Admin: add user |
| DELETE | `/api/admin/users/:email` | — | Admin: remove user |
| POST | `/api/admin/refresh-cache` | — | Admin: clear all in-memory caches |
| GET | `/api/admin/backups` | — | Admin: list recent backups from Firestore |
| POST | `/api/admin/backup` | — | Admin: trigger manual backup |

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

### Main Spreadsheet Columns (A–O)

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
| N | 13 | editedBy | Last editor (user email) |
| O | 14 | editedAt | Last edit timestamp (ISO string) |

Columns 10 (`sent`) and 12 (`mark`) are the two bulk-update targets used most frequently.

### Audit Log Sheets

Each farmer has a companion sheet named `{farmerName}_audit`. `appendAuditLog()` in `googleSheetsService.js` auto-creates it on first use. Fields: ID, recordId, palletNumber, action (`קליטה` for create / `עדכון` for update), editedBy, editedAt. All writes are fire-and-forget and do not block the main response.

### Shipping Labels Spreadsheets

Each farmer has a dedicated spreadsheet for shipping labels (IDs in `.env`). Labels are created by:
1. Copying the `"base"` sheet template.
2. Auto-incrementing the ID from cell D7.
3. Writing pallet data starting at row 11.
4. Setting B6 (date), B8 (destination), C24 (unique pallet count formula).

---

## Firebase

- **Firebase Hosting**: Serves the built frontend (`dist/`) with SPA rewrite (`/* → /index.html`).
- **Firebase Admin SDK** (backend): Initialized in `server.js` with `SheetsCred.env.json` service account. `const db = admin.firestore()` is available throughout the server.

### Firestore Collections

| Collection | Doc ID | Purpose | Written by |
|---|---|---|---|
| `config` | `global` | Dynamic lists: kinds, sizes, destinations, farmers + farmerConfigs | Admin SDK via `POST /api/admin/config` |
| `users` | user email | Role map (`{ role: 'admin' \| 'user' }`). Seeded from `users.json` on startup if empty | Admin SDK (seed + user management endpoints) |
| `backups` | auto-id | Backup metadata: timestamp, filename, farmerCount, rowCount, triggeredBy | `backupService.js` after each backup run |
| `farmer_events` | farmer name | Real-time pallet update events. One document per farmer, overwritten on each write — no accumulation | `firestoreEventService.js` (Admin SDK, fire-and-forget) |

**Firestore security rules** — `config` and `farmer_events` allow `read: if true` (cookie-based auth means `request.auth` is null for all client reads; Admin SDK writes bypass rules entirely). All other writes are `if false`.

**Frontend Firestore usage:** `App.vue` and `Settings.vue` call `onSnapshot()` on `config/global` to keep dynamic config live. `App.vue` provides reactive values to all children:
- `provide('config', config)` — kinds, sizes, destinations, farmerConfigs
- `provide('selectedFarmer', selectedFarmer)` — currently selected farmer
- `provide('currentUserEmail', computed(() => user.value?.email || ''))` — used by `useFarmerEvents` for echo suppression

Children inject with `inject('config')`, `inject('selectedFarmer')`, `inject('currentUserEmail')`.

---

## SheetModel

`backend/models/sheetModel.js` — validates and serializes pallet data before writing to Sheets.

Required fields: `harvestDate`, `palletNumber`, `boxes`, `kind`, `size`. Throws `Error` if any are missing.

`toArray()` returns a 14-element array (columns B–O; ID in column A is auto-assigned by the service).

---

## Caching

`googleSheetsService.js` maintains four in-memory caches (reset on process restart):

| Cache | Type | TTL | Purpose |
|---|---|---|---|
| `cachedSheetNames` | `Array` | None (manual) | Validated farmer sheet names — avoids metadata API call on every request |
| `cachedFarmerRecords` | `Map<name, {records, timestamp}>` | 5 minutes | Per-farmer pallet records — primary read cache |
| `cachedAuditSheetExists` | `Set<name>` | None (manual) | Tracks which audit sheets have been verified to exist |
| `activeRecordFetches` | `Map<name, Promise>` | Per-request | Request coalescing — concurrent fetches for the same farmer share one in-flight Promise |

`invalidateFarmerCache(farmerName)` clears `cachedFarmerRecords` for that farmer and is called by every write method (`appendRow`, `updateRowById`, `updateRowsByIds`, `updateSentStatusForPallets`, `updateSendToDestinationPallets`). `POST /api/admin/refresh-cache` clears all four caches and re-warms `cachedSheetNames`.

---

## Real-Time Updates

After every backend write, `firestoreEventService.js` writes an event document to `farmer_events/{farmerName}` in Firestore (fire-and-forget — never blocks the HTTP response). All connected clients hold an `onSnapshot` listener via `useFarmerEvents.js`. When the document changes, the composable applies the delta to the caller's `pallets` ref in-place and flashes affected rows yellow for 3 seconds.

**Why Firestore instead of WebSockets:** Cloud Run scales to 0. Open WebSocket connections keep the instance alive and billed. Firestore's SDK manages all connection infrastructure externally — Cloud Run is only woken by actual HTTP requests.

### Event Types

| type | payload | What the composable does |
|---|---|---|
| `create` | `pallet` | Append to bottom if passes filter |
| `update` | `pallet` | Update in-place if passes filter; remove if no longer qualifies |
| `bulk_update` | `pallets[]` | Per-row: update in-place / remove / ignore |
| `reset_sent` | `palletIds[]` | Set `sent: false` in-place; remove if view filters on sent |
| `mark_destination` | `pallets[]`, `newValue` | Only updates `mark` field on existing rows; appends if view filters on mark |

### `useFarmerEvents(farmer, pallets, options)` Composable

- `farmer` — `Ref<string>` — reactive farmer name; composable re-subscribes automatically on change
- `pallets` — `Ref<Array>` — the page's data array; mutated in-place (new rows appended, existing rows patched, removed rows spliced)
- `options.currentUserEmail` — `Ref<string>` — echo suppression: events where `updatedBy === currentUserEmail` are skipped
- `options.filter` — `(pallet) => boolean` — which rows belong in this view

Returns `{ highlightedIds }` — a `ref(new Set())` of pallet IDs currently flashing.

**Key implementation details:**
- First `onSnapshot` fire is skipped (`isFirstSnapshot` guard) — prevents replaying a stale event from before the session opened
- The snapshot callback wraps `applyEvent` in try-catch — a malformed event logs to console and exits without corrupting the array
- `mark_destination` only updates the `mark` field on existing rows (other fields are not overwritten with potentially stale req.body data)

### Per-View Filter

| Component | pallets ref | filter |
|---|---|---|
| `Weight.vue` | `message` | none (all pallets) |
| `SentPallets.vue` | `pallets` | `p => p.sent === true` |
| `sentPalletsForMark.vue` | `pallets` | `p => p.sent === true` |
| `Destination.vue` | `pallets` | `p => p.mark === true` |

### PalletTable Flash Prop

`PalletTable.vue` accepts a `highlightedIds` prop (type `Object`, default `new Set()`). Pass `highlightedIds` (not `highlightedIds.value`) — Vue auto-unwraps refs from `setup()` in templates. The `<tr>` receives class `pallet-flash` when `highlightedIds.has(pallet.id)` is true. The `@keyframes palletFlash` animation runs 3s ease-out and ends at `background-color: inherit` so missing-weight rows (amber-50) restore correctly.

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
