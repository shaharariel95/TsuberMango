# Architecture Reference

Detailed file-by-file map, data model, and environment variables. The behavioural rules and
non-obvious traps live in [CLAUDE.md](../CLAUDE.md) — this file is the "what is where" reference.

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
- `src/App.vue` — App shell: sidebar/layout, `onAuthStateChanged` listener that resolves the user + starts the live `centers/{centerId}/config/global` `onSnapshot` subscription (once `centerId` is known from `/api/auth/me`), logout (revokes the refresh token server-side via `POST /api/auth/logout`, then signs out locally regardless), and the `provide()`s consumed by every page.
- `src/components/` — All page-level components (see [api-reference.md](api-reference.md)). `Dashboard.vue` is the admin landing page (cross-farmer season totals, recent pallets, today's-activity feed).
- `src/components/shared/` — Reusable UI primitives: `ConfirmModal.vue`, `LoadingState.vue`, `ErrorState.vue`, `EmptyState.vue`, `SpinnerButton.vue`, `ErrorToast.vue`. See `frontend/SHARED_COMPONENTS.md`.
- `src/composables/useFarmerEvents.js` — Real-time update composable. Subscribes to `centers/{centerId}/farmer_events/{farmer}` via `onSnapshot` (re-subscribes when either the farmer ref or `centerId` changes), applies deltas to the caller's `pallets` ref in-place, and returns a reactive `highlightedIds` Set for flash animations. See [realtime.md](realtime.md).
- `src/composables/useCenter.js` — Module-level `centerId` ref + `setCenterId()`. Set once in `App.vue` from `/api/auth/me`; imported wherever a client Firestore path needs the tenant id (`Settings.vue`, `useFarmerEvents.js`).
- `src/composables/useNotification.js` — Corner toast notifications (`NotificationList.vue` renders them).
- `src/data/data.js` — Static fallback data: mango kinds, sizes, destinations, farmerConfigs.
- `src/data/printData.js` — Sticker PDF generation using pdfmake. **Lazy-loaded**: pdfmake and vfs_fonts are dynamically imported inside `createStickerPDF()` so they don't block initial page load.
- `fonts/vfs_fonts.js` — Custom Rubik font embedded as a VFS blob for pdfmake (~750 kB). Exports the font map directly as default; assign with `pdfMake.vfs = pdfFonts` (not `pdfFonts.vfs`).
- `vite.config.js` — Dev proxy: `/api` → `http://localhost:3000`. Credentials included.
- `tailwind.config.js` — Custom `mango` color palette (yellow→brown) and `sidebar` dark theme.

### Backend (`/backend`)

- `server.js` — Process entry point: `users` collection seeding (from `users.json` if empty), `listen()`, and the startup Sheets cache warm (skipped in emulator mode). Requires the app from `app.js`.
- `app.js` — The Express app, exported without `listen()` so the API tests can import it: CORS (`credentials: false` — Bearer tokens, not cookies), Firebase Admin init (skipped if already initialized), `FRONT_CORS` required at load, `/api/*` guarded by `verifyFirebaseToken` + `ensureCenterAccess` (admin-only routes additionally by `ensureAdmin`), `/api/auth/me` and `/api/auth/logout`, admin/backup endpoints. No Passport, no express-session, no dev-bypass route. Auth, admin, and internal endpoints are defined directly here (not in a route file).
- `middleware/auth.js` — `verifyFirebaseToken` (verifies the `Authorization: Bearer <idToken>` header via `admin.auth().verifyIdToken`, sets `req.user = {email, uid, centers}`), `ensureCenterAccess` (403 unless `CENTER_ID` is in the token's `centers` claim), `ensureAdmin` (reads the role **live** from Firestore `centers/{CENTER_ID}/users/{email}` — not from the claim, so role changes take effect immediately), `syncUserClaims(email)` (computes the set of centers a user belongs to via a `users` collection-group scan and stamps a minimal `{centers}` custom claim; returns whether it changed).
- `routes/sheetRoutes.js` — The `/api/*` sheet + destination endpoints (mounted under the `verifyFirebaseToken` + `ensureCenterAccess` guard).
- `controllers/sheetController.js` — Pallet record CRUD logic + backup trigger/list handlers. Depends on the `RecordRepository` (via `require('../repositories')`), **not** on Sheets directly. Each write emits a fire-and-forget Firestore event after the repository write succeeds. Write endpoints validate the farmer against `config.farmers` (`assertKnownFarmer` → 400 on unknown; 5-min cached, invalidated by `POST /api/admin/config`, fail-open on config-read error).
- `repositories/RecordRepository.js` — Storage-agnostic contract for pallet-record persistence (`getRecords`, `getRecord`, `getRecordsByPallet`, `getLastPallet`, `appendRecord`, `updateRecord(s)`, `updateSentStatus`, `updateMarkStatus`, `appendAuditLog`). `repositories/index.js` exports the active implementation singleton.
- `repositories/FirestoreRepository.js` — The **live** implementation. Records at `centers/{centerId}/farmers/{farmer}/records/{autoId}`, audit at `.../audit/{autoId}`. Constructor takes an injectable `db` (lazy `admin.firestore()`); record ids are Firestore auto-ID strings.
- `config/center.js` — Exports `CENTER_ID` (`process.env.CENTER_ID || 'tsuberi'`), the single source of the current tenant id. Real per-subdomain resolution is deferred.
- `services/googleSheetsService.js` — Google Sheets API wrapper. **No longer the records store** — retained only for farmer-sheet provisioning via the admin `create-sheet`/`delete-sheet`/`refresh-cache` + startup cache-warm paths in `server.js`/`app.js`.
- `utils/sheetsGuard.js` — `assertRealSheetsAllowed()` is called by both Sheets services' `initialize()`: any Google Sheets call throws while the Firebase emulators are active (`FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` set) unless `ALLOW_REAL_SHEETS=true`. Keeps local/test runs out of the production spreadsheets.
- `services/firestoreEventService.js` — Emits real-time events to `centers/{centerId}/farmer_events/{farmer}` in Firestore. All functions are fire-and-forget (`emit().catch(logger.error)`). See [realtime.md](realtime.md).
- `services/certificateCore.js` — Pure certificate logic (no I/O): chunking pallets into certificates, snapshot building, selection validation, and `planIssue`, which preview and issue share so they can never disagree.
- `repositories/FirestoreCertificateRepository.js` — Certificates + per-farmer profile (`certificateProfile`). Atomic issue/reprint/remove-pallet transactions, immutable versions, `CertificateError(status, code, details)`. Dedupes `recordIds`; reconciles `recordIds` drift against the pallet cardIds with a warn log. Exposed as `require('../repositories').certificates`.
- `services/certificateService.js` — Orchestrates certificate operations: validation, repository transaction, then the side effects every write owes (audit entries + a `bulk_update` realtime event). `toHttpError` maps `CertificateError` to Hebrew messages.
- `controllers/certificateController.js` — Thin HTTP layer over the service (farmer validated with `assertKnownFarmer`).
- `routes/certificateRoutes.js` — `/api/certificates/*`. Mounted in `app.js` **above** the global `/api` chain with its own `verifyFirebaseToken` + `ensureCenterAccess`. The admin profile and season-export endpoints are defined directly in `app.js`.
- `services/backupService.js` — Backs up all active-season records (read from the Firestore repository) **and certificates** and records metadata in the Firestore `backups` collection. Invoked by the manual admin endpoint and by Cloud Scheduler (see `backend/CLOUD_SCHEDULER.md`).
- `models/sheetModel.js` — Pallet data model + required-field validation + boolean coercion (see SheetModel below).
- `utils/logger.js` — Winston logger (`logger.info`, `logger.error`), console transport.
- `users.json` — Seed-only email → role map. Copied into the Firestore `users` collection on first startup if that collection is empty; the live authorization source is Firestore, not this file.

### Backend scripts

- `scripts/seedCertificateProfiles.js` — One-time seed of each farmer's `certificateProfile` (header lines, driver, next number) from the old shipping-label spreadsheets. Supports `--dry-run`. Farmers whose sheets aren't shared with the service account are entered manually in Settings.

- `scripts/seedCenterNamespace.js` — One-time idempotent carry-over: copies top-level `config/global` + `users/*` into `centers/{centerId}/`.
- `scripts/addTestFarmers.js` — Appends test farmers to the namespaced config.
- `scripts/seedTestCenter.js` — Idempotent: stands up `centers/test` (config, one admin user, one fake farmer + record) for local emulator smoke-testing. Run: `node scripts/seedTestCenter.js <admin-email>`.
- `scripts/backfillAuthClaims.js` — Scans the `users` collection group and calls `syncUserClaims(email)` on each. **Effectively a no-op and no longer needed** — it can only stamp users that already exist in Firebase Auth, and a Firebase Auth user is created on first `signInWithPopup`, so at the 2026-07-26 cutover it found zero. Claims self-heal at first login instead. Retained for the multi-center future.

---

## Data Model

### Record fields

Each record is a Firestore document at `centers/{centerId}/farmers/{farmer}/records/{autoId}`.
Booleans are stored as real booleans; dates as canonical ISO `yyyy-mm-dd`. The Col/Index columns
are the **legacy Sheets layout, kept for reference** (the field names are what live in Firestore):

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

`sent` and `mark` are the two bulk-update targets used most frequently
(`updateSentStatus` / `updateMarkStatus` — per-field Firestore batch writes).

Records started **fresh** on Firestore for the new season — no data was migrated from Sheets; the
old per-farmer sheets remain only as a cold historical archive.

### SheetModel

`backend/models/sheetModel.js` validates and normalizes pallet data before persistence.

Required fields: `harvestDate`, `palletNumber`, `boxes`, `kind`, `size`. Throws `Error` if any are
missing. Coerces `sent`/`gidon`/`mark` to real booleans.

Controllers construct a `SheetModel` and pass the object (spread) to the repository, which stores it
as a Firestore document (id assigned by Firestore). `toArray()` (the legacy 14-element Sheets row
serializer) still exists on the model but is no longer used on the write path.

### Audit Log

Each farmer has an `audit` subcollection at `centers/{centerId}/farmers/{farmer}/audit/{autoId}`.
`appendAuditLog()` writes: recordId, palletNumber, action (`קליטה` for create / `עדכון` for update),
editedBy, editedAt. Writes are fire-and-forget (the repository logs and swallows errors) and never
block the main response.

### Shipping certificates

Certificates live in Firestore (the old per-farmer Google Sheets label spreadsheets and the
`SHIPPING_LABELS_ID_*` env vars are gone). Issuing is an atomic transaction: it allocates the next
number from the farmer's `certificateProfile`, writes the certificate + an immutable version-1
snapshot, and stamps `cardId` + `sent` on the pallets. A pallet belongs to at most one live
certificate; removing it cancels the certificate when it was the last one and writes a new version.
The PDF is built in the browser (`frontend/src/data/certificatePdf.js`, pdfmake with `bidi-js`
visual ordering).

---

## Firestore

- **Firebase Hosting**: Serves the built frontend (`dist/`) with SPA rewrite (`/* → /index.html`).
- **Firebase Admin SDK** (backend): Initialized in `app.js` with `SheetsCred.env.json` service account. `const db = admin.firestore()` is available throughout the server.

### Tree

All tenant data is namespaced under `centers/{centerId}` (currently the single center `tsuberi`;
`test` also exists for emulator smoke-testing). There is no server-side session store — Firebase
Auth ID tokens replaced it, so nothing app-specific lives top-level except `backups`.

```
centers/{centerId}/
  config (config/global doc)   kinds, sizes, destinations, farmers[], farmerConfigs
  users/{email}                { role: 'admin' | 'user' }
  farmers/{farmer}/
    records/{autoId}            pallet record fields (see Data Model above)
    audit/{autoId}              recordId, palletNumber, action, editedBy, editedAt
  farmers/{name}.certificateProfile   { headerLines[5], driverName, nextNumber }  (fields on the farmer doc)
  certificates/{farmer}__{number}     certificate doc: farmer, number, status, shipmentDate, destination, recordIds, current snapshot
    versions/{n}                      immutable snapshots, one per issue/reprint/removal
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
| `centers/{c}/farmers/{f}` `.certificateProfile` | Header lines, driver, next certificate number | Admin SDK via `PUT /api/admin/farmers/:farmer/certificate-profile` (and the seed script) |
| `centers/{c}/certificates/{farmer}__{n}` (+ `versions/{n}`) | Shipping certificates; versions are immutable | Admin SDK via `FirestoreCertificateRepository` (transactions) |
| `backups/{id}` | Backup metadata | `backupService.js` after each run |

### Security rules

`frontend/firestore.rules` (version-controlled). The only client (SDK) reads are the tenant config
doc and the real-time events: `centers/{centerId}/config/**` and
`centers/{centerId}/farmer_events/{farmer}` require
`request.auth != null && centerId in request.auth.token.centers` — an authed Firebase user whose
`centers` custom claim includes the tenant being read. The legacy top-level `config`/`farmer_events`
matches have been removed. Everything else is default-deny; all writes stay Admin-SDK-only
(bypasses rules).

**Live in production since 2026-07-26** (ruleset released `2026-07-26T20:54:44Z`, verified
byte-identical to the repo file). Deploying rules is covered by the `deploy` skill.

### Frontend Firestore usage

`App.vue` and `Settings.vue` call `onSnapshot()` on `centers/{centerId}/config/global` (the config
subscription starts only after `centerId` is known — from `/api/auth/me`). `App.vue` provides
reactive values to all children:

- `provide('config', config)` — kinds, sizes, destinations, farmerConfigs
- `provide('selectedFarmer', selectedFarmer)` — currently selected farmer
- `provide('centerId', centerId)` — the tenant id (from `useCenter`)
- `provide('currentUserEmail', computed(() => user.value?.email || ''))` — used by `useFarmerEvents` for echo suppression

Children inject with `inject('config')`, `inject('selectedFarmer')`, `inject('centerId')`,
`inject('currentUserEmail')`.

---

## Caching

**Records are read live from Firestore — there is no records cache.** The old 5-minute per-farmer
records cache, request-coalescing, and per-farmer append-lock were removed with the Sheets migration
(Firestore reads are fast and its writes are atomic).

`googleSheetsService.js` still holds its in-memory caches (`cachedSheetNames`, `cachedFarmerRecords`,
`cachedAuditSheetExists`, `activeRecordFetches`), but these now serve **only the legacy Sheets paths**
(farmer-sheet provisioning + the admin `create-sheet`/`delete-sheet`/`refresh-cache` and startup
cache-warm). `POST /api/admin/refresh-cache` clears them and re-warms `cachedSheetNames`.

The controller's `assertKnownFarmer` write-validation keeps a small in-memory TTL (~5 min) cache of
known farmer names read from `centers/{centerId}/config/global`.

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
| `CENTER_ID` | Tenant id (optional; defaults to `tsuberi`) — drives which Firestore `centers/{id}` tree the backend reads/writes and which id `ensureCenterAccess` checks against the token's `centers` claim |
| `FRONT` | Frontend base URL for post-login/logout redirects |
| `FRONT_CORS` | Comma-separated allowed CORS origins |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `CLOUD_RUN_SERVICE_URL` | Expected audience when verifying the Cloud Scheduler OIDC token (`/api/internal/backup`) |
| `GCS_BACKUP_BUCKET` | GCS bucket backups are written to (`tsuberi-mangos-backups`). `backupService.js` throws if unset |
| `CRON_SECRET` | Dev-only shared secret accepted by `/api/internal/backup` when `NODE_ENV≠production` |

**Removed by the Firebase Auth migration (task 23) — no longer read anywhere in the codebase:**
`SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`,
`DEV_BYPASS_AUTH`. Safe to delete from `.env`/Cloud Run config. As of the 2026-07-26 cutover they
are **still set on the production Cloud Run service** but read by nothing — retiring them is
cosmetic cleanup, not a blocking step.
