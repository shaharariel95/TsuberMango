# TsuberMango — CLAUDE.md

## Project Overview

TsuberMango is a full-stack web application for managing mango pallet records, weights, destinations, and shipping labels for farmers. The UI is in Hebrew, rendered right-to-left (`lang="he" dir="rtl"`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 + Vite 5, Vue Router 4, Tailwind CSS 3, Axios |
| Backend | Node.js + Express 5 |
| Primary DB | Firebase Firestore — pallet records, audit, config, users, real-time events (all under `centers/{centerId}/…`) |
| Legacy DB | Google Sheets API (googleapis) — now only shipping-label spreadsheets + farmer-sheet provisioning |
| Auth | Firebase Auth (Google provider) — ID tokens; Firestore `users` collection for authorization |
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

- `src/main.js` — App entry point; initializes Vue, Router, Firebase (`getAuth` + `getFirestore`, emulator wiring behind `VITE_USE_EMULATORS`), and a global Axios request interceptor that attaches `Authorization: Bearer <idToken>` from the current Firebase user to every request. Exports `db` (Firestore instance) and `auth` (Firebase Auth instance).
- `src/router.js` — All routes + `beforeEach` guard keyed off Firebase auth state (`onAuthStateChanged`/`auth.currentUser`), calling `/api/auth/me` only for the admin-gate/role-home checks.
- `src/utils/auth.js` — `getToken()` — awaits a valid (auto-refreshed) Firebase ID token for callers that don't go through the axios interceptor (raw `fetch()` calls).
- `src/App.vue` — App shell: sidebar/layout, `onAuthStateChanged` listener that resolves the user + starts the live `centers/{centerId}/config/global` `onSnapshot` subscription (once `centerId` is known from `/api/auth/me`), logout (revokes the refresh token server-side via `POST /api/auth/logout`, then signs out locally regardless), and the `provide()`s consumed by every page (see Firebase section).
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

- `server.js` — Express entry: CORS (`credentials: false` — Bearer tokens, not cookies), Firebase Admin init, `users` collection seeding, `/api/*` guarded by `verifyFirebaseToken` + `ensureCenterAccess` (admin-only routes additionally by `ensureAdmin`), `/api/auth/me` and `/api/auth/logout`, admin/backup endpoints. No Passport, no express-session, no dev-bypass route. Auth, admin, and internal endpoints are defined directly here (not in a route file).
- `middleware/auth.js` — `verifyFirebaseToken` (verifies the `Authorization: Bearer <idToken>` header via `admin.auth().verifyIdToken`, sets `req.user = {email, uid, centers}`), `ensureCenterAccess` (403 unless `CENTER_ID` is in the token's `centers` claim), `ensureAdmin` (reads the role **live** from Firestore `centers/{CENTER_ID}/users/{email}` — not from the claim, so role changes take effect immediately), `syncUserClaims(email)` (computes the set of centers a user belongs to via a `users` collection-group scan and stamps a minimal `{centers}` custom claim; returns whether it changed).
- `routes/sheetRoutes.js` — The `/api/*` sheet + shipping + destination endpoints (mounted under the `verifyFirebaseToken` + `ensureCenterAccess` guard).
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
- `scripts/backfillAuthClaims.js` — One-time, idempotent: scans the `users` collection group for every distinct email and calls `syncUserClaims(email)` on each, stamping/correcting the `centers` custom claim. **Must run before `firestore.rules` is deployed** (the new rules require the claim to be present). Run: `node scripts/backfillAuthClaims.js`.
- `scripts/seedTestCenter.js` — Idempotent: stands up `centers/test` (config, one admin user, one fake farmer + record) for local emulator smoke-testing. Run: `node scripts/seedTestCenter.js <admin-email>`.
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

There is no `/` route. The `beforeEach` guard in `router.js` first resolves Firebase's current auth state (`auth.currentUser`, or one `onAuthStateChanged` tick if it hasn't hydrated yet) — no Firebase user means an immediate redirect to `/login`, no network round-trip needed. It hits `/api/auth/me` only for the admin gate and bare/unmatched-path role-home redirect: admins to `/Dashboard`, everyone else to `/Destination`. A non-admin hitting an admin-only route is sent to `/Destination`; a `401` from that call sends the user to `/login`. If the call fails for another reason (server down), already-matched routes are let through and only unmatched paths fall back to `/login`.

### Backend API Endpoints

All `/api/*` routes require `verifyFirebaseToken` + `ensureCenterAccess`. Admin-only routes additionally require `ensureAdmin`.

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
| GET | `/api/auth/me` | — | Current user info — `{email, role, centerId, refreshToken}`; role read live from Firestore |
| POST | `/api/auth/logout` | — | Logout — revokes the user's Firebase refresh tokens server-side |
| POST | `/api/admin/create-sheet` | — | Admin: create farmer sheet |
| POST | `/api/admin/delete-sheet` | — | Admin: delete farmer sheet |
| POST | `/api/admin/config` | — | Admin: save config to Firestore |
| GET | `/api/admin/users` | — | Admin: list all users |
| POST | `/api/admin/users` | — | Admin: add user |
| DELETE | `/api/admin/users/:email` | — | Admin: remove user |
| POST | `/api/admin/refresh-cache` | — | Admin: clear the legacy Sheets caches (records are uncached — read live from Firestore) |
| GET | `/api/admin/backups` | — | Admin: list recent backups from Firestore |
| POST | `/api/admin/backup` | — | Admin: trigger manual backup |
| POST | `/api/internal/backup` | — | Cloud Scheduler backup trigger. **Not** token-auth'd — verifies a Google OIDC token (or `CRON_SECRET` in dev). Defined before the `verifyFirebaseToken`/`ensureCenterAccess` block. |

---

## Authentication Flow

Auth is Firebase Auth ID tokens over a Bearer header — there is no server-side session, cookie, or Passport strategy.

1. User hits `/login` → clicks "Sign in with Google" → `Login.vue` calls `signInWithPopup(auth, new GoogleAuthProvider())` (Firebase client SDK — still Google as the identity provider, just no server-side OAuth dance).
2. On success, the frontend calls `GET /api/auth/me` to authorize. A global Axios request interceptor (`main.js`) attaches `Authorization: Bearer <idToken>` (from `auth.currentUser.getIdToken()`) to every outgoing request automatically; raw `fetch()` calls use `utils/auth.js`'s `getToken()` instead.
3. Backend: `verifyFirebaseToken` middleware verifies the token via `admin.auth().verifyIdToken()` and sets `req.user = {email, uid, centers}` (`centers` comes from the token's custom claims). `ensureCenterAccess` then 403s unless `CENTER_ID` is in `req.user.centers`. The `/api/auth/me` handler looks up `centers/{CENTER_ID}/users/{email}` in Firestore — if the doc doesn't exist, 403 ("User not authorized"); otherwise it returns `{email, role, centerId, refreshToken}`, with **role read live from Firestore** (not from the token) so a role change takes effect on the next call, no re-login needed.
4. `/api/auth/me` also calls `syncUserClaims(email)` on every hit, which recomputes the user's `centers` claim from a live `users` collection-group scan and re-stamps it if it changed. `refreshToken: true` in the response tells the client a freshly-minted claim needs a token refresh before Firestore client reads (which check the claim in `firestore.rules`) will pass — `Login.vue` calls `auth.currentUser.getIdToken(true)` in that case.
5. `ensureAdmin` (used on admin-only routes) does its own live Firestore role lookup rather than trusting a claim — same live-role guarantee as `/api/auth/me`.
6. Frontend router guard (`router.js`) keys off Firebase's own auth state (`onAuthStateChanged`) for the signed-in/signed-out gate, and calls `/api/auth/me` only for the admin gate / role-home redirect (see Frontend Routes above).

**Claim model — deliberately minimal**: the only custom claim is `{centers: [...]}`, used solely so `ensureCenterAccess` (backend) and `firestore.rules` (client reads) can gate on tenant membership without a Firestore round-trip. **Role is never in the claim** — it's always read live from Firestore (`ensureAdmin`, `/api/auth/me`), so revoking admin access takes effect immediately rather than waiting for a token refresh. `syncUserClaims(email)` is what stamps the claim: on `/api/auth/me` (self-heal), on `POST/DELETE /api/admin/users` (immediately after a user is added/removed), and via the one-time `scripts/backfillAuthClaims.js` for cutover.

**Logout**: `App.vue`'s `logout()` calls `POST /api/auth/logout`, which revokes the user's Firebase refresh tokens server-side (`admin.auth().revokeRefreshTokens(uid)`) so the session can't be silently resumed even if a stale ID token is replayed; the client then calls `signOut(auth)` and clears local state regardless of whether the revoke call succeeded.

**Startup seeding**: On boot, `seedUsersIfEmpty()` copies `users.json` into the Firestore `users` collection **only if that collection is empty**. After first boot, add/remove users through the admin UI / `POST /api/admin/users` — editing `users.json` has no effect on an already-seeded database. Adding/removing a user there also calls `syncUserClaims(email)` to keep the claim in sync.

**Emulators**: `VITE_USE_EMULATORS=true` (frontend `.env.development`) wires `main.js` to `connectAuthEmulator`/`connectFirestoreEmulator` against `localhost:9099`/`8080` for local development against `scripts/seedTestCenter.js`'s `centers/test` tenant, without touching the production Firebase project.

**Removed with this migration**: Passport (`passport-google-oauth20`), `express-session` + `firestore-store`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/unauthorized`, and the `DEV_BYPASS_AUTH`/`GET /api/auth/dev-login` dev bypass. None of these exist in the codebase anymore.

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

All tenant data is namespaced under `centers/{centerId}` (currently the single center `tsuberi`; `test` also exists for emulator smoke-testing via `scripts/seedTestCenter.js`). There is no server-side session store — Firebase Auth ID tokens replaced it, so nothing app-specific lives top-level except `backups`.

```
centers/{centerId}/
  config (config/global doc)   kinds, sizes, destinations, farmers[], farmerConfigs
  users/{email}                { role: 'admin' | 'user' }
  farmers/{farmer}/
    records/{autoId}            pallet record fields (see Database section)
    audit/{autoId}              recordId, palletNumber, action, editedBy, editedAt
  farmer_events/{farmer}        real-time delta doc, overwritten per write
backups/{autoId}                backup metadata: timestamp, filename, farmerCount, rowCount, triggeredBy
```

| Path | Purpose | Written by |
|---|---|---|
| `centers/{c}/config/global` | Dynamic lists: kinds, sizes, destinations, farmers + farmerConfigs | Admin SDK via `POST /api/admin/config` |
| `centers/{c}/users/{email}` | Role map. Seeded from `users.json` on startup only if empty; live authorization source thereafter | Admin SDK (seed + user management endpoints) |
| `centers/{c}/farmers/{f}/records/{id}` | Pallet records — the primary data store | Admin SDK via `FirestoreRepository` |
| `centers/{c}/farmers/{f}/audit/{id}` | Per-record audit trail | `FirestoreRepository.appendAuditLog` (fire-and-forget) |
| `centers/{c}/farmer_events/{f}` | Real-time pallet update events, one doc per farmer, overwritten each write — no accumulation | `firestoreEventService.js` (fire-and-forget) |
| `backups/{id}` | Backup metadata | `backupService.js` after each run |

**Firestore security rules** (`frontend/firestore.rules`, version-controlled) — the only client (SDK) reads are the tenant config doc and the real-time events: `centers/{centerId}/config/**` and `centers/{centerId}/farmer_events/{farmer}` now require `request.auth != null && centerId in request.auth.token.centers` — an authed Firebase user whose `centers` custom claim includes the tenant being read. The legacy top-level `config`/`farmer_events` matches (kept "during cutover" in the old open-rules posture) have been removed. Everything else remains default-deny; all writes stay Admin-SDK-only (bypasses rules). **This closes the interim open-read posture** — real per-tenant `request.auth` lockdown, previously deferred to task 23, is now implemented in code. **Not yet deployed to production**: the rules file must be pushed with `firebase deploy --only firestore:rules` **after** `scripts/backfillAuthClaims.js` has run (a user with no `centers` claim yet would otherwise fail these rules) — see Known Issues/Deferrals.

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
- **`centerId` is still the constant `'tsuberi'`** (env-resolved via `config/center.js`, not per-subdomain). Task 23 shipped the Firebase-Auth/claim side of the story — client reads of `config`/`farmer_events` are now authed + center-matched via `request.auth.token.centers` (no longer `read: if true`), and `ensureCenterAccess` gates every backend request the same way — but real per-subdomain center *resolution* (mapping a hostname to a `centerId` instead of reading an env var) is still not implemented; that remains open. **Task 23 status: code-complete on branch `arch-redesign`, production cutover pending** — see `done.md` for the full cutover checklist (Firebase Console Google provider + authorized domains, run `backfillAuthClaims.js`, deploy `firestore.rules` *after* the backfill, deploy backend + frontend, live E2E, retire the now-dead auth env vars). **Deliberately deferred, not oversights:** putting `role` in the custom claim (role stays live-read from Firestore instead — see Authentication Flow) and running staging on a separate Firebase project (still the same project as production for now).
- **Minor dead code:** a couple of `error.message.includes("Invalid farmer sheet")` catch branches remain in read-only controller handlers — harmless, since the repository no longer throws that string.

---

## Environment Variables

### Frontend (`.env.development` / `.env.production`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (`http://localhost:3000` / `https://api.tsuberi.com`) |
| `VITE_DEV_MODE` | Enables dev-specific UI behavior |
| `VITE_FIREBASE_*` | Firebase SDK config (API key, project ID, etc.) |
| `VITE_USE_EMULATORS` | `true` connects the Firebase Auth + Firestore clients to local emulators (`localhost:9099`/`8080`) instead of the real project — local dev against `centers/test` only, never set in production |

### Backend (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Express port (3000) |
| `NODE_ENV` | `development` / `production` |
| `SPREADSHEET_ID` | Legacy pallet-sheets spreadsheet — now only farmer-sheet provisioning (records live in Firestore) |
| `SHIPPING_LABELS_ID_*` | Per-farmer shipping label spreadsheets |
| `CENTER_ID` | Tenant id (optional; defaults to `tsuberi`) — drives which Firestore `centers/{id}` tree the backend reads/writes and which id `ensureCenterAccess` checks against the token's `centers` claim. Still env-resolved, not subdomain-derived (see Known Issues/Deferrals) |
| `FRONT` | Frontend base URL for post-login/logout redirects |
| `FRONT_CORS` | Comma-separated allowed CORS origins |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `CLOUD_RUN_SERVICE_URL` | Expected audience when verifying the Cloud Scheduler OIDC token (`/api/internal/backup`) |
| `CRON_SECRET` | Dev-only shared secret accepted by `/api/internal/backup` when `NODE_ENV≠production` |

**Removed by the Firebase Auth migration (task 23) — no longer read anywhere in the codebase:** `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `DEV_BYPASS_AUTH`. Safe to delete from `.env`/Cloud Run config, but that retirement is one of the still-open cutover steps (see Known Issues/Deferrals and `done.md`) — they may still be present in the deployed production environment until cutover happens.

---

## Running Locally

```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend (port 5173)
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3000`, so no CORS issues in dev.

### Local E2E against the emulators

`cd backend && npm run local:test` spins up the whole local stack in one command: the Firebase **auth + firestore emulators**, seeds `centers/test` (via `scripts/seedTestCenter.js`), then runs the backend (`CENTER_ID=test`, pointed at the emulators) and the frontend (`VITE_USE_EMULATORS=true`) concurrently. Sign in through the auth-emulator popup with the seeded admin email. Ctrl-C tears the whole stack down. Requires the local (gitignored) `frontend/firebase.json` emulators block; emulator data is not persisted between runs. Note: shipping-label creation still calls the real Google Sheets API (task 20), so that one flow won't complete under the emulators.

---

## Rules to Follow

1. **Records go through the `RecordRepository`** (Firestore), not Sheets. Controllers depend on `require('../repositories')`, never on `googleSheetsService` directly. When adding a record field, update `SheetModel` and the record-fields table. Keep the repository interface storage-agnostic so the parked Postgres option stays a mechanical swap.
2. **Auth checks** — backend endpoints need `verifyFirebaseToken` + `ensureCenterAccess`; admin ones also need `ensureAdmin`. Frontend routes use `meta: { requiresAuth, requiresAdmin }`.
3. **Tailwind only** — use Tailwind utility classes; avoid scoped vanilla CSS unless truly necessary.
4. **Logging** — add `logger.info` / `logger.error` calls in any new controller or service method.
5. **Users live in Firestore** — the `users` collection is the authorization source. Add/remove users via the admin UI or the `/api/admin/users` endpoints. `users.json` is only a first-boot seed; editing it does not change an already-seeded database.
6. **Hebrew / RTL** — the UI is Hebrew. Keep labels and messages in Hebrew where consistent with existing code.
