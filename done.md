# TsuberMango — Completed Work
> Chronological log of shipped features and fixes.

---

## July 2026 — Season maintenance

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
