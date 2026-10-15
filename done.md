# TsuberMango — Completed Work
> Chronological log of shipped features and fixes.

---

## October 2026 — Pre-season push

### ✅ Task 35a — Backend dependency majors
- `firebase-admin` 13 → 14 (needs Node ≥ 22): the namespaced API (`admin.firestore()`, `admin.auth()`, `admin.apps`, `admin.credential`) is gone, so 26 files moved to `firebase-admin/app|firestore|auth` (`getFirestore`, `getAuth`, `FieldValue`, `Timestamp`, `cert`). Auth middleware tests now spy on the cached `getAuth()` instance.
- `@google-cloud/storage` 8, `dotenv` 18 (`{ quiet: true }`), express 5.3, vitest 5, firebase-tools 14.27 (15 needs JDK 21; this machine has 18). Docker image `node:20-alpine` (end of life April 2026) → `node:24-alpine`, `npm ci --omit=dev`; `engines.node >= 22`.
- Production dependencies: 1 critical + 3 high + 9 moderate advisories → 0. Gates: backend 186, e2e 36/36.

### ✅ Task 31 — Stale-pallet nudges
- Dashboard card "N משטחים ממתינים יותר מ-X ימים מהקטיף": unsent pallets whose harvest date is more than X days ago, oldest first (top 10 + "ועוד"), a mixed pallet once; a click opens shipment prep for that farmer.
- Settings → בדיקות ותזכורות: toggle (off by default) + days (default 3), stored as `config/global.stalePallets`; saved together with the weight range.
- Tests: `stalePallets.test.js` (7: settings, date formats incl. year-less, day counting, mixed pallets), e2e `stale-pallets.spec.js`.

### ✅ Task 26 — Weight sanity checks
- Saving a weight whose kg-per-box is outside the range asks first ("המשקל נראה חריג… לשמור בכל זאת?") — at intake and in the table editor (only when weight or boxes changed); cancel keeps the row in edit mode.
- Range in Settings → בדיקות משקל (`config/global.weightCheck`), default 4–9 kg/box from the 2026 season data: median 5.6, נספק boxes ~8; 4–9 would have flagged 8 of 616 pallets, 7 of them clear typos (1 kg weights, 666 kg on 3 boxes).
- Mark-for-shipment and issue-certificate confirms list selected pallets with no weight.
- Tests: `weightCheck.test.js` (7), e2e `weight-check.spec.js`; e2e intake default is now 80 boxes so existing specs' weights stay in range.
- Task 9 review follow-up (accepted): a row's unsaved edits are lost if a filter hides that row mid-edit (the draft lives in the row).

### ✅ Task 9 — PalletTable refactor
- `PalletTable.vue` 933 → 394 lines: pure row logic in `utils/palletRows.js` (11 unit tests: filters, mixed-pallet context rows, sort, grouping/collapse, colours), toolbar in `PalletTableToolbar.vue`, rows in `PalletTableRow.vue` (edit mode keeps its own draft). Raw `fetch` calls moved to `api/records.js` (`updateRecord`, `markForShipment`, `setShipmentDate`, `resetSent`).
- Same props/events for the four pages; scoped CSS replaced by Tailwind (row flash is now `animate-pallet-flash` in `@theme`). Dead code removed (`fetchLastPallet`, debug log). Columns now follow a farmer switch (was computed once).
- Verified: unit 51, e2e 30/30, before/after screenshots identical apart from test data.

### ✅ Task 34 — Frontend toolchain majors (Vite 8, Tailwind 4)
- Vite 5 → 8 (Rolldown) + plugin-vue 6; `build.rollupOptions` → `rolldownOptions`. Build time 15s → under 1s. Non-breaking audit fixes (axios, vue).
- Tailwind 3 → 4 via the official upgrade tool: CSS-first config in `src/index.css` (`@theme`, `@utility`), `@tailwindcss/vite` instead of PostCSS/autoprefixer, renamed utilities across 18 components. v3-compat base rules kept: default border colour, pointer cursor on buttons, grey-400 placeholders.
- Visual QA by before/after screenshots of every page (desktop 1600 + tablet 1280, tall viewport, row edit mode, drawer): only real change was the intake form's `space-y` + `mb-1` headers (fixed). Remaining audit: `@grpc/grpc-js` (firebase 12+, task 35) and `xlsx` (no fix).
- Builds now target browsers from ~2023 (Chrome 111+, Safari 16.4+).

### ✅ Merged to `main` — 2026-10-10 (PR #5)
- `arch-redesign` merged into `main` (merge commit `7ae224e`); production already ran it. The Sheets-era `main` (`94b2272`) is kept as branch `sheets_db_backup`. Gates at merge: backend 186, frontend unit 40, e2e 30; production verified by hand (sign-in/out, users, intake, backups, certificate preview).

### ✅ Keyless Cloud Run (code + docs; cutover pending)
- Service-account key no longer ships: `*.env.json` added to `.gcloudignore`/`.dockerignore`; `utils/gcpCredentials.js` uses the key file locally and Application Default Credentials (Cloud Run identity) otherwise; app, backup service and scripts use it.
- Cutover (grant roles, deploy, verify, rotate key) is a manual checklist in the deploy skill -> Credentials; not yet executed.

### ✅ Backups you can restore
- Nightly backup job (`tsuberi-daily-backup`) verified running since May.
- Backup payload v2 is complete and all-or-nothing: config, users, every farmer doc and certificate profile (also farmers missing from the list), deleted pallets, audit, certificates with versions. Backups refuse the real GCS bucket under emulators.
- `scripts/restoreBackup.js` + `services/backupRestore.js`: dry run by default, `--execute` needs `--center`, never overwrites records/audit/certificates (blockers abort with nothing written), ids preserved, no realtime events; scopes full / `--farmer` / `--with-config`; accepts v1 and v2 files.
- Restore drill documented in `NEW_SEASON.md` (emulator, throwaway center `drill`), to run before the April 2027 dry run.

### ✅ Task 25 — Soft-delete + restore
- Any center user can delete a pallet from the table (row edit mode → מחק → confirm), only if it is unsent and has no certificate (`cardId`); the server enforces it (409). Admins restore from Settings → משטחים שנמחקו.
- Delete sets `deleted: true` + `deletedBy`/`deletedAt` on the record; every read and bulk path ignores deleted pallets, and backups include them. `PUT` on a deleted pallet returns 404.
- Realtime: delete arrives on other clients as `bulk_update` `{id, deleted: true}` (row removed by `applyPallet`), restore as a normal `bulk_update`; both are audit-logged.
- Tests: backend `softDelete.api.test.js`; frontend `applyPallet.test.js`; e2e `delete-restore.spec.js` and a two-client live-removal case in `realtime.spec.js`.

### ✅ Pre-season ops tooling — season reset + NEW_SEASON.md
- `scripts/clearSeason.js` (via `services/seasonReset.js`) deletes all records, audit, certificates and farmer events; keeps config, users, farmer docs with `certificateProfile`, and backups.
- Guards: dry run by default, `--execute --center <CENTER_ID>` required, refuses without a backup from the last 24 h unless `--skip-backup-check`.
- `NEW_SEASON.md` rewritten for the Firestore era (end of season, reset procedure, first-time setup, deploy pointer).

### ✅ Task 36 — Naming cleanup
- Renamed `controllers/sheetController.js` → `recordController.js`, `routes/sheetRoutes.js` → `recordRoutes.js`, `models/sheetModel.js` → `models/palletRecord.js` (`SheetModel` → `PalletRecord`) with `git mv`; docs and the README stale auth lines updated.
- Removed dead code: `toArray()` (Sheets row serializer) and the two `Invalid farmer sheet` catch branches; `PalletInput.vue` now maps the real `Unknown farmer` error to the Hebrew message. No API path, response shape or log change.
- Deliberately kept: `services/SheetsCred.env.json` (secret provided out-of-band to Cloud Run) and `frontend/src/utils/sheetName.js` (builds Excel sheet names, so the name is accurate).

### ✅ Task 6 — Farmer registry off Google Sheets (lean)
- Farmers live in `config/global.farmers` as `{name, allowGidon, archived?}`. New transactional `POST` / `DELETE` / `PATCH /api/admin/farmers` endpoints (`services/farmerRegistry.js`) add, hide (archive) and toggle `allowGidon`. Hiding keeps all of the farmer's data and removes them from every menu; restoring is re-adding the same name. The config save (`POST /api/admin/config`) no longer owns the farmers list.
- Google Sheets is removed from the backend: `googleSheetsService.js`, its guard, the `create-sheet` / `delete-sheet` / `refresh-cache` admin endpoints and the startup cache warm. `googleapis` stays only for `scripts/seedCertificateProfiles.js` until seeding is done.
- Realtime echo suppression is now per tab: the frontend sends `X-Client-Id`, the backend stamps events with `updatedByClient`, so the same account on two devices sees live updates (email comparison remains as a fallback for events without it).
- Tests: backend 141, frontend Vitest 28, Playwright 26 (13 tests x desktop + tablet, new `farmers.spec.js` and a same-account realtime case).
- **Deploy notes:** backend and frontend can go in either order. Remove `SPREADSHEET_ID` from the Cloud Run service. The known-farmers cache (`sheetController`, 5-min TTL) is per Cloud Run instance, so with more than one instance a just-added farmer can be rejected by another instance for up to 5 minutes.
- Spec: `docs/superpowers/specs/2026-10-09-farmer-registry-design.md`; plan: `docs/superpowers/plans/2026-10-09-farmer-registry.md`.

### ✅ Task 20 (+4) — Shipping certificates off Google Sheets
- Certificates now live in Firestore: `centers/{c}/certificates/{farmer}__{number}` with immutable `versions/{n}`, and `farmers/{name}.certificateProfile {headerLines[5], driverName, nextNumber}`. Issuing is one atomic transaction (number allocation, certificate + v1 snapshot, `cardId`/`sent` stamped on the pallets), which fixes the old `D7` numbering race and the orphan-certificate problem.
- Task 4 absorbed: selections over 13 rows auto-split into ≤13-row certificates, grouped by pallet number (a pallet never straddles two certificates); the single-destination guard is kept. Preview and issue share one `planIssue`, so they cannot disagree.
- Backend: `certificateCore.js`, `FirestoreCertificateRepository.js`, `certificateService.js`, `certificateController.js`, `certificateRoutes.js` (mounted above the global `/api` chain with its own auth), admin profile + season-export endpoints in `app.js`, `scripts/seedCertificateProfiles.js` (`--dry-run`). Backup includes certificates; certificate writes emit `bulk_update` events (one event per request). `resetPallets` routes a certified pallet through remove-pallet only when a certificate doc exists (legacy cardIds get a plain reset that also clears the stale cardId); `updateRecord` preserves `cardId`/`sent` of a certified pallet.
- Frontend: PDF built in the browser (`certificatePdf.js`, pdfmake + `bidi-js` real bidi ordering), issue flow with split preview in `PalletTable.vue` (cardId links to the certificate), new תעודות screen (history, reprint, remove pallet, merged PDF, Excel export), per-farmer "פרטי תעודה" editor + season Excel export in Settings, `utils/sheetName.js`.
- Deleted: `shippingLabelsService.js`, `labelController.js`, `POST /api/shipping/newlabel`, and the `SHIPPING_LABELS_ID_*` env-var usage. Google Sheets is now only the admin create/delete-sheet path.
- Tests: backend 107 (new `certificateCore`, `certificates.repo`, `certificates.api`), frontend Vitest 18 (new, `npm test`), Playwright 18 across desktop + tablet (new `certificates.spec.js`; `navTo()` now waits for the route to commit).
- Seeding numbers (profile `nextNumber` from the old sheets): Tsuberi 51466, Pesach 90048, Shahak 507, Meltzer 3. Avner, Idan and Kopler are entered manually in Settings because their sheets aren't shared with the service account.
- **Rollout checklist:**
  1. Deploy backend, then frontend (no Firestore rules change needed; certificates are backend-only).
  2. Clear production test data FIRST (before seeding): records/audit of the test farmers **and `centers/tsuberi/certificates/**`** (certificates and their versions). Do NOT delete `farmers/{name}` docs after seeding — they hold `certificateProfile`.
  3. `cd backend && node scripts/seedCertificateProfiles.js --dry-run`, review, then run it for real against production.
  4. Enter the Avner / Idan / Kopler profiles in Settings → פרטי תעודה, then check all 7 farmers in Settings (the farmer names must match the config exactly).
  5. Printer check: use Settings → פרטי תעודה → תצוגה מקדימה on the packhouse printer and compare it with the 51219 sample. Do NOT issue a real certificate for this — it consumes a real number.
  6. Remove the `SHIPPING_LABELS_ID_*` env vars from the Cloud Run service.
- Follow-ups (2026-10-09): the Settings preview uses `printWithRetap` + `preloadPdf` (a stale tablet tap now asks for a fresh one instead of showing SHARE_NEEDS_TAP); `resetSentStatus` emits its realtime event in `finally`, so changes committed before a failing step still reach other clients; the legacy-cardId reset is a partial update (`repo.clearCardIds`), not read-then-overwrite. The intermittent e2e `signIn` failure was fixed in `ce70f30`.

### ✅ Task 5 — CR#3 Edit destination & weight after a certificate was issued
- Clicking "ערוך" on a row that is `sent === true` or has a non-empty certificate number now opens a confirmation first ("המשטח כבר יצא — הונפקה לו תעודה — לשנות בכל זאת?"); cancel leaves the row read-only. Rows that have not left are unaffected.
- Saving goes through the existing `PUT /records/:id` (already stamps `editedBy`/`editedAt` and audits). Frontend only (`PalletTable.vue`).
- Deliberately not done: rewriting or flagging the printed certificate; certificates are being rebuilt in task 20.
- Test: new `e2e/edit-sent.spec.js` (no prompt before sent; prompt on a sent row; cancel keeps it read-only; confirm allows editing and persists).

### ✅ Task 3 — CR#1 Shipment prep: pick the date once + "החל על הכל"
- Selection toolbar in `PalletTable.vue` got a date input + "החל על הכל" button (enabled when ≥1 pallet is selected). It asks for confirmation with the pallet count, then stamps the date on every selected row.
- New narrow endpoint `PUT /api/farmers/:farmer/records/shipmentDate` (`{palletIds, shipmentDate}`), backed by a new `updateShipmentDate` on the `RecordRepository` contract and `FirestoreRepository`. It touches only `shipmentDate` + `editedBy`/`editedAt`, so it works on unweighed pallets and cannot clobber concurrent edits (unlike `updatemany`). Audited as `עדכון תאריך משלוח`; emits a new `shipment_date` realtime event that `useFarmerEvents.js` applies in place. Docs updated (`api-reference.md`, `realtime.md`).
- Tests: +3 backend (repository + 2 API cases; 57 total), new `e2e/shipment-date.spec.js` (two clients, live update + reload).

### ✅ Task 2 — CR#2 Intake: shipment date removed, mandatory fields enforced
- The shipment-date input, its `formData` init/reset, label-map entry and the "last submitted" summary row are gone from `PalletInput.vue`. Nothing downstream needed intake to set a shipment date (the model defaults it to `''`; it is set later on the data table / shipment prep).
- Harvest date, pallet number, boxes, kind and size are now validated client-side before submit (`novalidate` form + one Hebrew `requestAlert()` listing everything missing). Before, kind/size were only checked server-side because the radios are visually hidden.
- E2E: new `e2e/intake.spec.js` (no shipment-date field; empty harvest date + no kind/size shows the alert).


### ✅ Task 22 (local half) — Automated test harness: API suite + Playwright E2E
No CI by owner decision (public repo, nothing but code connected to it). Everything runs locally:
- **`cd backend && npm test`** (53 tests, ~10s, auth + Firestore emulators). New `tests/api.test.js` (25 cases) drives the real Express app with supertest and real auth-emulator ID tokens. It covers the auth gates, claim self-heal on `/api/auth/me`, intake → weigh → mark/unmark → certificate stamp via `updatemany` → reset, audit and realtime events, admin users/config, and Sheets isolation. To make the app importable, `server.js` was split into `app.js` (Express app, no side effects) and `server.js` (seeding, listen, cache warm).
- **`cd frontend && npm run e2e`** (Playwright, local Chrome, ~25s including stack startup). `e2e/season-flow.spec.js` runs the full flow through the UI. `e2e/realtime.spec.js` checks that an edit reaches a second signed-in client live. `PalletTable` cells now carry `data-col` for stable selectors.
- `backend/scripts/freePorts.js` runs before and after `npm test` and before `local:test`. On Windows, `emulators:exec` left the Firestore java process running every time, so the next run failed with "port taken".

**Bugs found and fixed while building it:**
- A farmer added in Settings was rejected as "Unknown farmer" for up to 5 minutes (stale known-farmers cache). `POST /api/admin/config` now invalidates it. The fix is per Cloud Run instance; other instances catch up within the TTL.
- Shipping labels: an unknown farmer silently fell back to **Tsuberi's** label spreadsheet. `getSpreadsheetIdByFarmer` now throws.
- The local emulator stack could write test certificates into the **production** label spreadsheet. `utils/sheetsGuard.js` now blocks every Sheets call under the emulators (override `ALLOW_REAL_SHEETS=true`). The startup Sheets cache warm is skipped in emulator mode.
- After editing a row, an empty certificate number (and weight/boxes) showed as "0" until reload (`Number('')`).
- A missing `FRONT_CORS` crashed boot with a TypeError. It now fails with a clear message.

**Found, not fixed:**
- Realtime echo suppression is keyed on email (`useFarmerEvents.js:28`), so two devices signed into the **same account** don't see each other's changes live. That matters if packhouse workers share a login.
- (Retracted.) "The mobile drawer covers the Dashboard at 1280×720" was a test artifact. At ≤1366px the nav links sit inside a drawer that starts closed, so the test couldn't click them. The app renders fine; checked with screenshots.
- `sendToDestination`/`removeFromDestination`/`resetSentStatus` skip `assertKnownFarmer`.

## July 2026 — Season maintenance

### ✅ Task 23 — Firebase Auth migration + Firestore rules lockdown — SHIPPED 2026-07-26

**STATUS: live in production.** Backend, frontend, and the locked-down Firestore rules are all deployed and verified. Built across 9 tasks on branch `arch-redesign` (backend middleware → server rewire → backfill/seed scripts → Firestore rules → frontend interceptor → Login → router guard → App.vue → docs), then cut over to production on 2026-07-26 — see the cutover log below.

**What shipped (code):**
- **Backend**: `backend/middleware/auth.js` — `verifyFirebaseToken` (verifies the `Authorization: Bearer <idToken>` header, sets `req.user = {email, uid, centers}`), `ensureCenterAccess` (403 unless `CENTER_ID ∈ token.centers`), `ensureAdmin` (reads role **live** from Firestore `centers/{CENTER_ID}/users/{email}` — never from the claim), `syncUserClaims(email)` (recomputes + stamps a minimal `{centers}` custom claim via a `users` collection-group scan; returns whether it changed). `backend/server.js`: Passport, `express-session`, `firestore-store`, and the `DEV_BYPASS_AUTH` dev-login route are all **removed**; `/api/*` now guarded by `verifyFirebaseToken` + `ensureCenterAccess` (+ `ensureAdmin` on admin routes); `GET /api/auth/me` returns `{email, role, centerId, refreshToken}` (role live from Firestore, `refreshToken` tells the client a claim changed and a token refresh is needed); `POST /api/auth/logout` revokes the user's Firebase refresh tokens (was `GET`); CORS switched to `credentials: false` (Bearer tokens, not cookies); `/api/auth/google`, `/api/auth/google/callback`, and `/api/auth/unauthorized` are gone. `/api/internal/backup` (Cloud Scheduler OIDC) is unchanged.
- **Frontend**: `main.js` initializes `getAuth()`, wires a global Axios request interceptor that attaches the Bearer token to every request, and connects to the Firebase Auth/Firestore emulators when `VITE_USE_EMULATORS=true`. `Login.vue` uses `signInWithPopup` (still Google as the identity provider, no server-side OAuth redirect dance) then calls `/api/auth/me` to authorize, force-refreshing the ID token if a claim just changed. `router.js`'s `beforeEach` guard keys off Firebase's own auth state (`onAuthStateChanged`/`auth.currentUser`) for the signed-in gate, calling `/api/auth/me` only for the admin-gate/role-home redirect. `App.vue` drives everything off `onAuthStateChanged`, and logout calls `POST /api/auth/logout` then signs out locally regardless of the server call's outcome. Every remaining raw `fetch()` data call now attaches the Bearer token via the new `utils/auth.js` `getToken()` helper (the interceptor only covers axios).
- **Firestore rules** (`frontend/firestore.rules`): `config` and `farmer_events` reads now require `request.auth != null && centerId in request.auth.token.centers` (was `read: if true`); the legacy top-level `config`/`farmer_events` matches kept during the earlier cutover are removed. Everything else stays default-deny; writes remain Admin-SDK-only.
- **New scripts**: `backend/scripts/backfillAuthClaims.js` (one-time, idempotent — stamps/corrects the `centers` claim for every user found via a `users` collection-group scan; must run **before** the rules deploy) and `backend/scripts/seedTestCenter.js` (stands up `centers/test` — config, one admin user, one fake farmer + record — for emulator smoke-testing).
- **Claim model**: deliberately minimal — the custom claim is `{centers: [...]}` only. Role is **never** in the claim; it's always read live from Firestore (`ensureAdmin`, `/api/auth/me`), so an admin demotion/promotion takes effect immediately instead of waiting for a token refresh. The active center is still `CENTER_ID` from the environment (`config/center.js`, constant `'tsuberi'`) — **not** resolved from the subdomain; that piece stays deferred.

**Files touched**: `backend/middleware/auth.js` (new), `backend/server.js`, `backend/scripts/backfillAuthClaims.js` (new), `backend/scripts/seedTestCenter.js` (new), `frontend/src/main.js`, `frontend/src/utils/auth.js` (new), `frontend/src/components/Login.vue`, `frontend/src/router.js`, `frontend/src/App.vue`, `frontend/firestore.rules`.

**Production cutover log — 2026-07-26:**
1. Local `npm test` (28 tests: repository + `auth.middleware` + `firestore.rules`) and the emulator E2E passed first.
2. Google sign-in provider enabled in the Firebase Console (`tsuberi-mangos-7e449`).
3. `node scripts/backfillAuthClaims.js` ran against production and was a **structural no-op** — see the finding below.
4. Backend deployed to Cloud Run, then frontend to Firebase Hosting, then Firestore rules **last**. Rules released `2026-07-26T20:54:44Z`, verified byte-identical to `frontend/firestore.rules` via the Firebase Rules API.
5. Verified live: sign-in succeeded and `syncUserClaims` stamped `centers: ["tsuberi"]` on the first `/api/auth/me` call.

**Key finding — the backfill script was never going to do anything, and the original cutover order was wrong.** Production Firebase Auth had **zero user records** before cutover: under Passport the Google OAuth dance was server-side, so Firebase Auth was never the identity store and a Firebase Auth user only comes into existence on the first `signInWithPopup`. `syncUserClaims` needs an existing Auth user (`getUserByEmail`), so it logged "no auth user" for all 6 emails and stamped nothing.

That doesn't matter, because **claims self-heal at first login**: `GET /api/auth/me` is mounted at `server.js:62` with only `verifyFirebaseToken`, *above* the `app.use("/api", verifyFirebaseToken, ensureCenterAccess)` block — so a brand-new claimless token still reaches the handler, which authorizes off the Firestore user doc, stamps the claim, and returns `refreshToken: true`; the client then force-refreshes before `App.vue` opens the config `onSnapshot`. That mounting position is the linchpin of the whole design — **do not move `/api/auth/me` under the `ensureCenterAccess` guard.**

Consequence: the checklist's "deploy rules **after** the backfill" ordering was built on a safety that never existed. The correct order is **backend → frontend → rules last**, because the new frontend works fine against the old permissive rules (`read: if true` is strictly more permissive than the claim gate, and the backend is Admin SDK, which bypasses rules entirely). That keeps the break window to just the backend→frontend gap and makes the rules flip an independently reversible final step.

**Deployment facts discovered during cutover (were not written down anywhere):**
- The Cloud Run service is **`backend-service`** in GCP project **`tsuberi-mangos`**, region `europe-west1` — *not* `tsuberi-backend`, which is the (wrong) name in `backend/CLOUD_SCHEDULER.md`. Deploying to that name created a new empty service that crash-looped on missing `FRONT_CORS`; it was deleted. A stale `backend-service` also exists in `me-west1`, unused since 2025-04-26.
- The Firebase project (`tsuberi-mangos-7e449`) is **not** the same GCP project as Cloud Run (`tsuberi-mangos`); the backend bridges them via the `SheetsCred.env.json` service account + `FIREBASE_PROJECT_ID`.
- Cloud Run traffic was **pinned** to a specific revision, so `gcloud run deploy` created a new revision without promoting it. Fixed with `gcloud run services update-traffic backend-service --to-latest`. Deployed revision: `backend-service-00041-hln`.
- Custom claims are **not visible anywhere in the Firebase Console** — verifying them requires an Admin SDK query (`admin.auth().getUserByEmail(email).customClaims`).

**Still open after cutover (none blocking):**
- Post-rules smoke test not yet observed — the rules landed at 20:54, after the last sign-in at 20:40. Confirm the config dropdowns populate and a pallet edit still flashes; those are the only two client-SDK reads the rules gate.
- 5 of 6 users have no claim yet (never signed in). No action needed — each self-heals on first login.
- Branch `arch-redesign` is ~40 commits ahead of `main`; production is running code that is not on the main branch.
- Dead env vars still set on the Cloud Run service: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`. Unread by the new code — cosmetic.
- Legacy top-level `users/{email}` docs still exist from the 15/16 migration. They grant nothing (the rules matches are gone and `syncUserClaims` filters them out via the `parent.parent` check) but show up in any audit.

**Latent issues found while debugging the cutover (not fixed):**
- `server.js:53` does `process.env.FRONT_CORS.split(",")` with no guard, so any missing env var becomes an unstartable container with a stack trace instead of a clear message. Same on `main` — not a regression.
- `backend/CLOUD_SCHEDULER.md` names the Cloud Run service `tsuberi-backend` in its setup commands; re-running them as written would fail or wire the scheduler to a nonexistent service.
- `DELETE /api/admin/users/:email` recomputes the claim to `[]` but does not revoke refresh tokens, so a removed user keeps center access for up to an hour until their ID token expires. Admin *role* revocation is immediate (`ensureAdmin` reads Firestore live); center *membership* revocation lags. One-line fix: `admin.auth().revokeRefreshTokens(uid)`, same as logout already does.

### ✅ Tasks 15 + 16 (merged) — Records off Google Sheets → Firestore, full center namespacing
Moved all pallet **records** off Google Sheets onto Firestore behind a storage-agnostic `RecordRepository` interface (`backend/repositories/RecordRepository.js`) with a single `FirestoreRepository` implementation selected in `repositories/index.js`. Tasks 15 (interface) and 16 (Firestore store) ran as one workstream because the fresh-start decision (no data migration) removed the need for a throwaway `SheetsRepository`. All tenant data is now namespaced under `centers/{centerId}/…`: records at `centers/tsuberi/farmers/{farmer}/records/{autoId}`, audit at `.../audit/{autoId}`, plus `config/global`, `users/{email}`, and `farmer_events/{farmer}` moved under `centers/tsuberi/`. Record IDs are now opaque Firestore auto-ID strings (no more sequential ints; `id` treated as opaque end-to-end including real-time event matching); booleans stored as real booleans; dates written as canonical ISO `yyyy-mm-dd` (intake stopped converting to `dd/mm`). The in-memory records cache + per-farmer append-lock were dropped (Firestore is fast and atomic). Consumers rewired: `sheetController` + `backupService` → repo; `firestoreEventService` → namespaced events path; `server.js` users/config lookups namespaced and `/api/auth/me` now returns `centerId`; frontend `App.vue`/`Settings.vue`/`useFarmerEvents.js` read namespaced paths via a shared `composables/useCenter.js` module (centerId from `/api/auth/me`), and `PalletInput` sends ISO dates. Added **write-path farmer validation** (`assertKnownFarmer` — unknown farmer → 400). `centerId` is currently the constant `'tsuberi'`; real per-subdomain / custom-claims resolution + Firestore-rule lockdown remain **task 23**. Interim Firestore rules re-grant client read on the namespaced `config`/`farmer_events` (`frontend/firestore.rules`, deployed). New scripts: `seedCenterNamespace.js` (one-time config+users carry-over, idempotent) and `addTestFarmers.js`. Test harness bootstrapped: Vitest + Firebase Firestore emulator, 10 repository tests (reads / writes / bulk-status / audit) — `firebase-tools` pinned to `14.18.0` (JDK-11 compatible). **Still on Sheets (deferred):** farmer provisioning (`create-sheet`/`delete-sheet`), `refresh-cache`, and startup cache-warming still use `googleSheetsService.js`, which is therefore **retained** → **task 6** removes it; shipping labels → **task 20**. Executed subagent-driven (fresh implementer + spec/quality review per task, plus a whole-feature review); verified live on Firestore (created pallets persist, real-time flash works, edits/bulk toggles + audit land under `centers/tsuberi/…`). Spec: `docs/superpowers/specs/2026-07-13-firestore-records-layer-design.md`; plan: `docs/superpowers/plans/2026-07-13-firestore-records-layer.md`.

### ✅ Task 1 (CR#5) — Centered "problem" blocking dialogs
Promoted confirm/alert out of `PalletTable` into an app-level shared mechanism so any page can raise a blocking, center-screen, backdrop-blur dialog that must be acknowledged (distinct from the easy-to-miss corner toasts). New `composables/useDialogs.js` — a module-level singleton exposing promise-based `requestAlert({title,message,details,variant})` and `requestConfirm({...})` (one dialog at a time; a new request dismisses the previous). New `shared/AlertModal.vue` (single "הבנתי" button; `error`/`warning`/`info` variants) styled as a twin of the existing `ConfirmModal.vue`. New `shared/DialogHost.vue` mounted once in `App.vue` renders whichever modal the singleton needs and resolves the pending promise; backdrop-click and `Escape` both dismiss (alert→ack, confirm→false). Conversions: PalletTable's inline bulk-destination `ConfirmModal` + local `confirmModal` state + `requestConfirm` method replaced by a `confirmBulkAction` calling the shared `requestConfirm` (emerald/amber preserved); label-creation failure and validation blockers (`שדות חסרים`, mixed-destination) in `sendSelectedPallets` now route through `requestAlert` (warning for validation, error otherwise) instead of the 5 s `ErrorToast`; PalletInput's server submit error routes through `requestAlert`. Success toasts and the other `ErrorToast` paths untouched. Frontend prod build passes; verified live by driving the real `useDialogs`/`DialogHost`/modals in an isolated harness (centered render, blur, RTL, variant colors, button + backdrop + Escape resolution for both confirm outcomes) — no automated tests yet (deferred to task 22). Design spec: `docs/superpowers/specs/2026-07-13-blocking-dialogs-design.md`.

### ✅ Task 0.1 — Safe dependency refresh (in-major)
`npm update` on both `frontend/` and `backend/` within existing `^` ranges — lockfile-only, no source changes, one commit per side (branch `chore/dep-refresh-0.1`). Landed the targeted security patch **axios 1.8.4 → 1.18.1** (redirect credential leakage, SSRF, ReDoS), plus firebase 11.6→11.10, vue 3.5.12→3.5.39, vue-router 4.0→4.6, vite 5.4.11→5.4.21, plugin-vue 5.1→5.2, tailwind 3.4.14→3.4.19, pdfmake 0.2.18→0.2.23, express 5.1→5.2, express-session 1.18→1.19, firebase-admin 13.8→13.10, @google-cloud/storage 7.19→7.21, winston 3.17→3.19, nodemon + cors/dotenv patches. Frontend prod build passes; all backend deps load and syntax-check clean. Remaining `npm audit` findings are out of in-major scope (esbuild→vite 8 = task 34; xlsx has no npm fix; backend 10 moderate all trace to transitive `uuid<11.1.1`, only fixable via googleapis@173 = task 35). **Manual smoke test (login/Sheets/real-time/sticker/label) still owed before merge to `main` — no automated test net until task 22.**

---

## May 2026 — Sprint 3

### ✅ M6 — Offline / Poor Connectivity Indicator
`navigator.onLine` + `online`/`offline` event listeners added to `App.vue`. When offline: persistent amber top banner "אין חיבור לאינטרנט — שינויים לא יישמרו". When back online: green "החיבור חזר" toast auto-dismisses after 3 s. Listeners cleaned up in `onBeforeUnmount`.

### ✅ H5 — Bulk Action Confirmation Modal (Destination Page)
"העבר למשלוח" and "הורד ממשלוח" buttons in `PalletTable.vue` now route through `requestConfirm()` before executing. Confirmation modal shows: affected pallet count, destination list, and action type. Hebrew "אשר" / "ביטול" buttons. Click-outside-to-dismiss supported.

### ✅ C2a — Duplicate Pallet Warning Converted to Modal
Replaced the inline yellow banner in `PalletInput.vue` with a centered overlay modal (backdrop blur). Same "כן המשך" / "לא תקן" actions. Submit button remains disabled while modal is open.

### ✅ C2b — Mix-Pallet Row Coloring Reworked
Removed the alternating background tint that painted half the table. Now only rows whose pallet number appears more than once receive a 4 px colored right border. Each distinct mixed pallet number gets a deterministic color from an 8-color palette (`palletNumber % 8`). Non-mix rows are plain white. Color derived from `mixPalletColorMap` computed property (replaces old `palletGroupIndex`).

### ✅ Dashboard "פעילות היום" Fix
`todayRecords` was comparing `shipmentDate` (often empty) against a full `dd/mm/yyyy` string — nothing ever matched. Fixed to compare `harvestDate` (stored as `dd/mm`) against `getTodayShort()`. Records entered today now appear in the activity feed.

### ✅ Firebase Auth Migration Plan
Detailed migration document written to `firebaseSession.html`. Covers 10 steps: removing Passport + express-session, new `verifyFirebaseToken` middleware, updated `/api/auth/me` and logout endpoints, `Login.vue` rewrite with `signInWithPopup`, `auth.js` helper with auto-refresh token, router guard via Firebase Auth state, `onAuthStateChanged` in `App.vue`, CORS update, and DEV_BYPASS_AUTH removal. `users.json` role logic preserved.

### ✅ Shared UI Component Extraction
Decoupled repeated UI patterns from page-level components into `src/components/shared/`: `ConfirmModal.vue`, `EmptyState.vue`, `ErrorState.vue`, `ErrorToast.vue`, `LoadingState.vue`, `SpinnerButton.vue`. All table pages (`Weight`, `SentPallets`, `sentPalletsForMark`, `Destination`) and `PalletTable` now import from these shared components, removing ~250 lines of duplicated template code across 8 files.

---

## May 2026 — Sprint 2

### ✅ H1 — Dashboard (Season At-a-Glance)
New `/Dashboard` route (admin default landing page). Per-farmer cards showing total pallets, boxes, weight, unweighed count, and pallets pending destination. Global summary row across all farmers. "Today's activity" feed (last 5 records with today's shipment date). Quick-action buttons "עבור לקליטה" / "הצג חסרי משקל" per farmer card. `/` now redirects admins to `/Dashboard`; PalletInput moved to `/Intake`.

### ✅ H4 — Missing Weight Highlight + Filter Toggle
"X משטחים ללא משקל" counter badge in Weight page (green when 0, amber when >0). "סנן חסרי משקל" toggle button pre-filters the table to unweighed rows only. All rows missing a weight value get an amber right-border tint (`bg-amber-50 border-r-4 border-amber-300`) in PalletTable via new `highlightMissingWeight` + `filterMissingWeight` props.

### ✅ H6 — Quick Batch Entry Mode (מצב מהיר) in קליטה
"מצב מהיר" toggle button in the intake form header. When active: harvest date, kind, and size fields persist across submissions; pallet number and boxes reset. Auto-focus returns to pallet number input after each successful submission. Animated session tally bar: "נקלטו X משטחים בסשן הזה" — resets when fast mode is toggled off.

---

## May 2026 — Sprint 1

### ✅ Fix the Broken `getRowsByPallet` Endpoint
Implemented `getRowsByPallet` in `googleSheetsService.js`. Filters records by pallet number with string coercion, returns proper 404 on no match.

### ✅ User Management via Firestore
Users moved from `users.json` to Firestore `users` collection. Seeded on startup. Passport strategy checks Firestore. Three new admin endpoints (GET/POST/DELETE `/api/admin/users`). "ניהול משתמשים" section added to Settings.vue.

### ✅ Empty / Error / Loading States for All Table Pages
Weight, SentPallets, and sentPalletsForMark now show: animated skeleton loading, empty-state icon + "אין נתונים להצגה", red error card with "נסה שוב" retry button.

### ✅ Global Persistent Notification System
`useNotification.js` composable with module-level singleton state. `NotificationList.vue` overlay component. Errors stay until dismissed; successes auto-dismiss after 3 s. Wired into App.vue globally.

### ✅ Activity Log / Audit Trail
`sheetModel.js` extended with `editedBy` + `editedAt` columns (N, O). `appendAuditLog()` in service creates `{farmer}_audit` sheet on first write. `updateRecord`, `updateMultipleRecords`, and `createRecord` (קליטה) all stamp editor email + timestamp. PalletTable shows `ⓘ` hover tooltip with editor info.

### ✅ Destinations Summary — Excel Export
"ייצוא לאקסל" button in DestinationsSummary. Lazily imports SheetJS, builds RTL worksheet with Hebrew headers, downloads as `סיכום-יעדים-YYYY-MM-DD.xlsx`.

### ✅ Router Session Stability Fix
Router guard no longer kicks users to login on network errors (server down). Only explicit 401 responses trigger redirect. Logout returns JSON instead of redirect, eliminating the "Failed to logout" CORS error.

### ✅ Server Error Messages Translated to Hebrew in קליטה
`translateServerError()` maps backend field names to Hebrew. "Missing required fields: kind" → "שדות חובה חסרים: זן". Fallback to generic Hebrew message for unknown errors.

### ✅ Sticky Table Header
`<thead>` in PalletTable stays fixed while rows scroll. `h-full flex flex-col` pattern established — page components wrapping PalletTable must set `h-full` on their root div.

### ✅ PDF Performance Fix
pdfmake and vfs_fonts are now dynamically imported inside `createStickerPDF()` so they don't block initial page load. vfs assignment uses `pdfMake.vfs = pdfFonts` (not `pdfFonts.vfs`).

### ✅ Tablet-Compatible Redesign
Full responsive redesign — tablet-compatible layout with collapsible sidebar, mobile drawer, and RTL-aware spacing throughout.
