# TsuberMango — CLAUDE.md

## Project Overview

TsuberMango is a full-stack web application for managing mango pallet records, weights, destinations, and shipping labels for farmers. The UI is in Hebrew, rendered right-to-left (`lang="he" dir="rtl"`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 + Vite 5, Vue Router 4, Tailwind CSS 3, Axios |
| Backend | Node.js + Express 5 |
| Primary DB | Firebase Firestore — pallet records, audit, config, users, sessions, real-time events (all under `centers/{centerId}/…`) |
| Legacy DB | Google Sheets API (googleapis) — now only shipping-label spreadsheets + farmer-sheet provisioning |
| Auth | Google OAuth 2.0 (passport-google-oauth20); Firestore-backed express sessions |
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
- `src/App.vue` — App shell: sidebar/layout, live `centers/{centerId}/config/global` `onSnapshot` subscription (started inside the `/api/auth/me` `.then`, once `centerId` is known), and the `provide()`s consumed by every page (see Firebase section).
- `src/components/` — All page-level components (see Routes section). `Dashboard.vue` is the admin landing page (cross-farmer season totals, recent pallets, today's-activity feed).
- `src/components/shared/` — Reusable UI primitives: `ConfirmModal.vue`, `LoadingState.vue`, `ErrorState.vue`, `EmptyState.vue`, `SpinnerButton.vue`, `ErrorToast.vue`.
- `src/composables/useFarmerEvents.js` — Real-time update composable. Subscribes to `centers/{centerId}/farmer_events/{farmer}` via `onSnapshot` (re-subscribes when either the farmer ref or `centerId` changes), applies deltas to the caller's `pallets` ref in-place, and returns a reactive `highlightedIds` Set for flash animations. See Real-Time Updates section.
- `src/composables/useCenter.js` — Module-level `centerId` ref + `setCenterId()`. Set once in `App.vue` from `/api/auth/me`; imported wherever a client Firestore path needs the tenant id (`Settings.vue`, `useFarmerEvents.js`).
- `src/composables/useNotification.js` — Corner toast notifications (`NotificationList.vue` renders them).
- `src/data/data.js` — Static fallback data: mango kinds, sizes, destinations, farmerConfigs.
- `src/data/printData.js` — Sticker PDF generation using pdfmake. **Lazy-loaded**: pdfmake and vfs_fonts are dynamically imported inside `createStickerPDF()` so they don't block initial page load.
- `fonts/vfs_fonts.js` — Custom Rubik font embedded as a VFS blob for pdfmake (~750 kB). Exports the font map directly as default; assign with `pdfMake.vfs = pdfFonts` (not `pdfFonts.vfs`).
- `vite.config.js` — Dev proxy: `/api` → `http://localhost:3000`. Credentials included.
- `tailwind.config.js` — Custom `mango` color palette (yellow→brown) and `sidebar` dark theme.

### Backend (`/backend`)

- `server.js` — Express entry: CORS, Firestore-backed sessions (`firestore-store`), Passport OAuth, dev-bypass route, Firebase Admin init, `users` collection seeding, admin/auth/backup endpoints. Auth, admin, and internal endpoints are defined directly here (not in a route file).
- `routes/sheetRoutes.js` — The `/api/*` sheet + shipping + destination endpoints (mounted under the `ensureAuthenticated` guard).
- `controllers/sheetController.js` — Pallet record CRUD logic + backup trigger/list handlers. Depends on the `RecordRepository` (via `require('../repositories')`), **not** on Sheets directly. Each write emits a fire-and-forget Firestore event after the repository write succeeds. Write endpoints validate the farmer against `config.farmers` (`assertKnownFarmer` → 400 on unknown; 5-min cached, fail-open on config-read error).
- `controllers/labelController.js` — Shipping label generation logic.
- `repositories/RecordRepository.js` — Storage-agnostic contract for pallet-record persistence (`getRecords`, `getRecordsByPallet`, `getLastPallet`, `appendRecord`, `updateRecord(s)`, `updateSentStatus`, `updateMarkStatus`, `appendAuditLog`). `repositories/index.js` exports the active implementation singleton.
- `repositories/FirestoreRepository.js` — The **live** implementation. Records at `centers/{centerId}/farmers/{farmer}/records/{autoId}`, audit at `.../audit/{autoId}`. Constructor takes an injectable `db` (lazy `admin.firestore()`); record ids are Firestore auto-ID strings.
- `config/center.js` — Exports `CENTER_ID` (`process.env.CENTER_ID || 'tsuberi'`), the single source of the current tenant id. Real per-subdomain/custom-claims resolution is deferred (see Known Deferrals).
- `services/googleSheetsService.js` — Google Sheets API wrapper. **No longer the records store** — retained only for shipping-label provisioning and the admin `create-sheet`/`delete-sheet`/`refresh-cache` + startup cache-warm paths in `server.js`.
- `services/firestoreEventService.js` — Emits real-time events to `centers/{centerId}/farmer_events/{farmer}` in Firestore. All functions are fire-and-forget (`emit().catch(logger.error)`). See Real-Time Updates section.
- `services/shippingLabelsService.js` — Per-farmer shipping label spreadsheet management (still Google Sheets — see task 20).
- `services/backupService.js` — Backs up all active-season records (now read from the Firestore repository) and records metadata in the Firestore `backups` collection. Invoked by the manual admin endpoint and by Cloud Scheduler (see `CLOUD_SCHEDULER.md`).
- `scripts/seedCenterNamespace.js` — One-time idempotent carry-over: copies top-level `config/global` + `users/*` into `centers/{centerId}/`. `scripts/addTestFarmers.js` — appends test farmers to the namespaced config.
- `models/sheetModel.js` — Pallet data model + required-field validation + boolean coercion. Controllers pass a `SheetModel` object (spread) to the repository; `toArray()` (the old Sheets row serializer) is no longer used on the write path.
- `utils/logger.js` — Winston logger (`logger.info`, `logger.error`), console transport.
- `users.json` — Seed-only email → role map. Copied into the Firestore `users` collection on first startup if that collection is empty; the live authorization source is Firestore, not this file (see Authentication Flow).

---

## Routes & Permissions

### Frontend Routes

| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/Dashboard` | Dashboard | Admin only |
| `/Intake` | PalletInput | Admin only |
| `/Weight` | Weight | Admin only |
| `/SentPallets` | SentPallets | Admin only |
| `/Settings` | Settings | Admin only |
| `/sentPalletsForMark` | sentPalletsForMark | Auth required |
| `/Destination` | Destination | Auth required |
| `/DestinationsSummary` | DestinationsSummary | Auth required |

There is no `/` route. The `beforeEach` guard in `router.js` hits `/api/auth/me` on every navigation; bare `/` and any unmatched path redirect to the role's home — admins to `/Dashboard`, everyone else to `/Destination`. A non-admin hitting an admin-only route is sent to `/Destination`; a `401` sends the user to `/login`. If the auth check fails for another reason (server down), already-matched routes are let through and only unmatched paths fall back to `/login`.

### Backend API Endpoints

All `/api/*` routes require `ensureAuthenticated`. Admin-only routes additionally require `ensureAdmin`.

| Method | Path | Controller | Notes |
|---|---|---|---|
| POST | `/api/records` | `createRecord` | Create new pallet record |
| GET | `/api/farmers/:farmer/records` | `getAllRecords` | All records for farmer |
| GET | `/api/farmers/:farmer/records/destinations` | `getAllRecordsforDestinations` | Records with `mark=true` |
| GET | `/api/farmers/:farmer/records/pallet/:palletNumber` | `getRecordsByPallet` | Records for a pallet number (404 if none) |
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
| POST | `/api/admin/refresh-cache` | — | Admin: clear the legacy Sheets caches (records are uncached — read live from Firestore) |
| GET | `/api/admin/backups` | — | Admin: list recent backups from Firestore |
| POST | `/api/admin/backup` | — | Admin: trigger manual backup |
| GET | `/api/auth/unauthorized` | — | Clears session on rejected login, redirects to `/login` |
| POST | `/api/internal/backup` | — | Cloud Scheduler backup trigger. **Not** session-auth'd — verifies a Google OIDC token (or `CRON_SECRET` in dev). Defined before the `ensureAuthenticated` block. |

---

## Authentication Flow

1. User hits `/login` → clicks "Sign in with Google".
2. Redirected to `GET /api/auth/google` (Passport initiates OAuth).
3. Google redirects to `GET /api/auth/google/callback`.
4. Backend looks up the email in the Firestore `users` collection. If the doc doesn't exist → redirected to `/api/auth/unauthorized` (session cleared). The role comes from that doc.
5. If authorized → session created `{email, role}` → redirected to frontend.
6. Frontend router guard calls `/api/auth/me` on every navigation to verify.

**Session storage**: Sessions are stored in Firestore via `firestore-store` (not in-memory), so they survive Cloud Run restarts and are shared across instances. Cookie `maxAge` is 1 day; `secure`/`sameSite=none` in production.

**Startup seeding**: On boot, `seedUsersIfEmpty()` copies `users.json` into the Firestore `users` collection **only if that collection is empty**. After first boot, add/remove users through the admin UI / `POST /api/admin/users` — editing `users.json` has no effect on an already-seeded database.

**Dev bypass**: When `NODE_ENV=development` and `DEV_BYPASS_AUTH=true`, `GET /api/auth/dev-login?role=admin&email=...` skips OAuth entirely. Never enable this in production.

---

## Database: Firestore (records) + Google Sheets (shipping labels)

Pallet **records** live in **Firestore** at `centers/{centerId}/farmers/{farmer}/records/{autoId}`, accessed through the `RecordRepository` (see Firebase section for the full tree). Records started **fresh** on Firestore for the new season — no data was migrated from Sheets; the old per-farmer sheets remain only as a cold historical archive. Google Sheets is still used for **shipping-label spreadsheets** and legacy farmer-sheet provisioning.

### Record fields

Each record is a Firestore document with the fields below. Booleans are stored as real booleans; dates as canonical ISO `yyyy-mm-dd`. The Col/Index column is the **legacy Sheets layout, kept for reference** (the field names are what live in Firestore):

| Col | Index | Field | Notes |
|---|---|---|---|
| — | — | id | Firestore doc id — opaque string (was Sheets col A auto-int) |
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

The `sent` and `mark` fields are the two bulk-update targets used most frequently (`updateSentStatus` / `updateMarkStatus` — per-field Firestore batch writes).

### Audit Log

Each farmer has an `audit` subcollection at `centers/{centerId}/farmers/{farmer}/audit/{autoId}`. The repository's `appendAuditLog()` writes: recordId, palletNumber, action (`קליטה` for create / `עדכון` for update), editedBy, editedAt. Writes are fire-and-forget (the repository logs and swallows errors) and never block the main response.

### Shipping Labels Spreadsheets (still Google Sheets — task 20)

Each farmer has a dedicated spreadsheet for shipping labels (IDs in `.env`). Labels are created by:
1. Copying the `"base"` sheet template.
2. Auto-incrementing the ID from cell D7.
3. Writing pallet data starting at row 11.
4. Setting B6 (date), B8 (destination), C24 (unique pallet count formula).

---

## Firebase

- **Firebase Hosting**: Serves the built frontend (`dist/`) with SPA rewrite (`/* → /index.html`).
- **Firebase Admin SDK** (backend): Initialized in `server.js` with `SheetsCred.env.json` service account. `const db = admin.firestore()` is available throughout the server.

### Firestore tree

All tenant data is namespaced under `centers/{centerId}` (currently the single center `tsuberi`). `sessions` stays top-level (it is infra, not tenant data).

```
centers/{centerId}/
  config (config/global doc)   kinds, sizes, destinations, farmers[], farmerConfigs
  users/{email}                { role: 'admin' | 'user' }
  farmers/{farmer}/
    records/{autoId}            pallet record fields (see Database section)
    audit/{autoId}              recordId, palletNumber, action, editedBy, editedAt
  farmer_events/{farmer}        real-time delta doc, overwritten per write
sessions/{sid}                  express session store (firestore-store) — TOP-LEVEL
backups/{autoId}                backup metadata: timestamp, filename, farmerCount, rowCount, triggeredBy
```

| Path | Purpose | Written by |
|---|---|---|
| `centers/{c}/config/global` | Dynamic lists: kinds, sizes, destinations, farmers + farmerConfigs | Admin SDK via `POST /api/admin/config` |
| `centers/{c}/users/{email}` | Role map. Seeded from `users.json` on startup only if empty; live authorization source thereafter | Admin SDK (seed + user management endpoints) |
| `centers/{c}/farmers/{f}/records/{id}` | Pallet records — the primary data store | Admin SDK via `FirestoreRepository` |
| `centers/{c}/farmers/{f}/audit/{id}` | Per-record audit trail | `FirestoreRepository.appendAuditLog` (fire-and-forget) |
| `centers/{c}/farmer_events/{f}` | Real-time pallet update events, one doc per farmer, overwritten each write — no accumulation | `firestoreEventService.js` (fire-and-forget) |
| `sessions/{sid}` | Express session store | `firestore-store` middleware |
| `backups/{id}` | Backup metadata | `backupService.js` after each run |

**Firestore security rules** (`frontend/firestore.rules`, version-controlled + deployed) — the only client (SDK) reads are the tenant config doc and the real-time events, so `centers/{centerId}/config/**` and `centers/{centerId}/farmer_events/{farmer}` allow `read: if true` (legacy top-level `config`/`farmer_events` matches are kept during cutover). Everything else is default-deny; all writes are Admin-SDK-only (which bypasses rules). This is the **interim** posture — cookie-based auth means `request.auth` is null client-side; real per-tenant/per-user `request.auth` lockdown is **deferred to task 23**.

**Frontend Firestore usage:** `App.vue` and `Settings.vue` call `onSnapshot()` on `centers/{centerId}/config/global` (config subscription starts only after `centerId` is known — from `/api/auth/me`). `App.vue` provides reactive values to all children:
- `provide('config', config)` — kinds, sizes, destinations, farmerConfigs
- `provide('selectedFarmer', selectedFarmer)` — currently selected farmer
- `provide('centerId', centerId)` — the tenant id (from `useCenter`)
- `provide('currentUserEmail', computed(() => user.value?.email || ''))` — used by `useFarmerEvents` for echo suppression

Children inject with `inject('config')`, `inject('selectedFarmer')`, `inject('centerId')`, `inject('currentUserEmail')`.

---

## SheetModel

`backend/models/sheetModel.js` — validates and normalizes pallet data before persistence.

Required fields: `harvestDate`, `palletNumber`, `boxes`, `kind`, `size`. Throws `Error` if any are missing. Coerces `sent`/`gidon`/`mark` to real booleans.

Controllers construct a `SheetModel` and pass the object (spread) to the repository, which stores it as a Firestore document (id assigned by Firestore). `toArray()` (the legacy 14-element Sheets row serializer) still exists on the model but is no longer used on the write path.

---

## Caching

**Records are read live from Firestore — there is no records cache.** The old 5-minute per-farmer records cache, request-coalescing, and per-farmer append-lock were removed with the Sheets migration (Firestore reads are fast and its writes are atomic).

`googleSheetsService.js` still holds its in-memory caches (`cachedSheetNames`, `cachedFarmerRecords`, `cachedAuditSheetExists`, `activeRecordFetches`), but these now serve **only the legacy Sheets paths** (shipping-label provisioning + the admin `create-sheet`/`delete-sheet`/`refresh-cache` and startup cache-warm). `POST /api/admin/refresh-cache` clears them and re-warms `cachedSheetNames`.

The controller's `assertKnownFarmer` write-validation keeps a small in-memory TTL (~5 min) cache of known farmer names read from `centers/{centerId}/config/global`.

---

## Real-Time Updates

After every backend write, `firestoreEventService.js` writes an event document to `centers/{centerId}/farmer_events/{farmerName}` in Firestore (fire-and-forget — never blocks the HTTP response). All connected clients hold an `onSnapshot` listener via `useFarmerEvents.js`. When the document changes, the composable applies the delta to the caller's `pallets` ref in-place and flashes affected rows yellow for 3 seconds.

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

## Known Issues / Deferrals

- **Google Sheets is not fully removed.** `googleSheetsService.js` is retained for shipping-label provisioning and the admin `create-sheet`/`delete-sheet`/`refresh-cache` + startup cache-warm paths — deleting it would break server boot. Its removal + Firestore-based farmer provisioning is **task 6**; shipping labels off Sheets is **task 20**.
- **`centerId` is the constant `'tsuberi'`.** Real per-subdomain / Firebase-Auth custom-claims resolution and the Firestore-rule lockdown (real client `request.auth`) are **task 23**. Client reads of `config`/`farmer_events` are currently open (`read: if true`).
- **Minor dead code:** a couple of `error.message.includes("Invalid farmer sheet")` catch branches remain in read-only controller handlers — harmless, since the repository no longer throws that string.

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
| `SPREADSHEET_ID` | Legacy pallet-sheets spreadsheet — now only farmer-sheet provisioning (records live in Firestore) |
| `SHIPPING_LABELS_ID_*` | Per-farmer shipping label spreadsheets |
| `CENTER_ID` | Tenant id (optional; defaults to `tsuberi`) |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth credentials |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI |
| `SESSION_SECRET` | Express session secret |
| `FRONT` | Frontend base URL for post-login/logout redirects |
| `FRONT_CORS` | Comma-separated allowed CORS origins |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `CLOUD_RUN_SERVICE_URL` | Expected audience when verifying the Cloud Scheduler OIDC token (`/api/internal/backup`) |
| `CRON_SECRET` | Dev-only shared secret accepted by `/api/internal/backup` when `NODE_ENV≠production` |

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

1. **Records go through the `RecordRepository`** (Firestore), not Sheets. Controllers depend on `require('../repositories')`, never on `googleSheetsService` directly. When adding a record field, update `SheetModel` and the record-fields table. Keep the repository interface storage-agnostic so the parked Postgres option stays a mechanical swap.
2. **Auth checks** — backend endpoints need `ensureAuthenticated`; admin ones also need `ensureAdmin`. Frontend routes use `meta: { requiresAuth, requiresAdmin }`.
3. **Tailwind only** — use Tailwind utility classes; avoid scoped vanilla CSS unless truly necessary.
4. **Logging** — add `logger.info` / `logger.error` calls in any new controller or service method.
5. **Users live in Firestore** — the `users` collection is the authorization source. Add/remove users via the admin UI or the `/api/admin/users` endpoints. `users.json` is only a first-boot seed; editing it does not change an already-seeded database.
6. **Hebrew / RTL** — the UI is Hebrew. Keep labels and messages in Hebrew where consistent with existing code.
