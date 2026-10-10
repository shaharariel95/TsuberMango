# Task 6 — Farmer registry off Google Sheets (lean)

**Status:** approved design, 2026-10-09. Board: `docs/redesign-plan.md` task 6.

## Goal
The backend runs with no Google Sheets code at all, and adding/removing a farmer before the season is a
safe Settings action with no code change. Two riders: realtime updates reach two devices signed into the
same account, and saving the farmer list can no longer clobber (or be clobbered by) other config edits.

## Owner decisions
- **Scope A (lean):** `config/global.farmers` stays the farmer registry (the client already reads it live via
  `config/**` rules). No per-farmer registry docs, no Firestore rules change. Richer `farmers/{name}` docs are
  deferred until task 8 or 24 needs them. The task card's `FARMER_SPREADSHEET_IDS` map no longer exists (it
  went with task 20).
- **Removing a farmer hides it; data is kept.** Records, audit, certificates and `certificateProfile` are
  never deleted by this flow. Re-adding the same name restores the farmer.
- **Assumed:** no rename. The farmer name is the Firestore path of their data.

## 1. Data and backend API
`config/global.farmers` entry: `{ name: string, allowGidon: boolean, archived?: boolean }` (`archived`
absent = active).

New admin endpoints in `backend/app.js` (`verifyFirebaseToken` + `ensureCenterAccess` + `ensureAdmin`,
logger calls, invalidate the known-farmers cache on success). Each runs in a Firestore **transaction** on
`config/global` (read → modify the `farmers` array → write only the `farmers` field), so concurrent edits
are never lost:

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/admin/farmers` `{name}` | Trim `name`. Invalid → 400. Active farmer with that name exists → 409. Archived one exists → clear `archived` (restore), 200 `{restored: true}`. Otherwise append `{name, allowGidon: false}`, 201. |
| DELETE | `/api/admin/farmers/:name` | Unknown → 404. Sets `archived: true`. 200. Touches no farmer data. |
| PATCH | `/api/admin/farmers/:name` `{allowGidon: boolean}` | Unknown → 404; non-boolean → 400. Sets the flag. 200. |

**Name validation** (shared helper, also used by POST): non-empty after trim, ≤ 50 chars, no `/`, not
`.` or `..`, not matching `__.*__` (Firestore reserved IDs). Error messages in Hebrew (shown in Settings).

`POST /api/admin/config` stops owning farmers: it writes with the incoming body **minus `farmers`**, using
`set(..., { merge: true })`, so a stale Settings tab can't revert a farmer change. Other fields keep today's
semantics (kinds/sizes/destinations arrays replaced wholesale).

Archived farmers still count as known (`getKnownFarmerNames` returns all names), and backup
(`backupService.js`) and season export (`GET /api/admin/export/records`) keep iterating every entry, so
archived data stays in backups and the season Excel. No change needed there beyond confirming with a test.

## 2. Google Sheets removal
Delete: `backend/services/googleSheetsService.js`, `backend/utils/sheetsGuard.js` (and its tests/usages),
`POST /api/admin/create-sheet`, `/delete-sheet`, `/refresh-cache`, the startup cache warm in `server.js`,
the `SPREADSHEET_ID` env usage, and their tests (incl. the "Sheets unreachable from the emulator stack"
block in `api.test.js`).
Keep `googleapis` in `package.json` only for `scripts/seedCertificateProfiles.js` (a one-off pre-season
script); add a comment there and a line on the board: remove `googleapis` + the script after production
seeding. If `sheetsGuard` is used by that script, inline the guard there.
Docs: `CLAUDE.md` (stack table "Legacy DB" row, Core Invariants Sheets lines, Known Issues first bullet),
`docs/architecture.md`, `docs/api-reference.md`, the `local-dev` skill note about Sheets.

## 3. Frontend
- `Settings.vue` farmer card: add → `POST /api/admin/farmers`; the gidon checkbox → `PATCH`; delete → a
  confirm dialog that says the data is kept (no "delete sheet" checkbox) → `DELETE`. Loading label drops
  "יוצר גיליון...". Settings stops sending `farmers` in `saveConfig`. After each call, the live config
  snapshot updates the list (no local array mutation needed beyond optimistic UX, if any).
- A collapsed "חקלאים מוסתרים" section lists archived farmers, each with a "שחזר" button (→ POST with that
  name). Hidden when there are none.
- `App.vue` filters `archived` farmers out of the provided `config.farmers`/`farmerConfigs`, so menus,
  Dashboard, intake and every farmer selector never show them. Settings reads the raw list (it needs the
  archived ones).

## 4. Per-tab realtime client id
- `frontend/src/utils/auth.js`: a module-level `clientId = crypto.randomUUID()` (per tab, in memory) and an
  `authHeaders()` helper returning `{ Authorization, 'X-Client-Id' }`. The axios interceptor adds
  `X-Client-Id`; every raw `fetch` that uses `getToken()` switches to `authHeaders()` (14 call sites:
  `api/certificates.js`, Dashboard, Destination, DestinationsSummary, PalletInput, PalletTable, SentPallets,
  sentPalletsForMark, Weight).
- Backend: a tiny middleware stores `req.get('X-Client-Id')` (validated: ≤ 64 chars, `[A-Za-z0-9-]`) in an
  `AsyncLocalStorage` request context; `firestoreEventService.emit` adds `updatedByClient` from it. No
  service signatures change. CORS needs nothing (the `cors` package reflects requested headers).
- `useFarmerEvents.applyEvent`: if `event.updatedByClient` is present, skip only when it equals this tab's
  `clientId`; if absent (older backend), fall back to the email check.

## Testing
- API (`api.test.js` or a new `farmers.api.test.js`): add (201), duplicate active (409), restore archived
  (200, `restored`), archive keeps records and the farmer still appears in `export/records`, PATCH
  allowGidon, invalid names (400), non-admin (403), `POST /api/admin/config` with a stale `farmers` array
  leaves farmers untouched, an emitted event carries `updatedByClient` when the header is sent.
- Frontend unit: `useFarmerEvents` suppression by client id (own id skipped; same email, other id applied;
  no id → email fallback).
- E2E: Settings add → archive → restore a farmer (the farmer disappears from / returns to the nav-driven
  farmer selector); two browser contexts signed in as the **same** account see each other's change live.
- Full gates: `cd backend && npm test`; `cd frontend && npm test && npm run build && npm run e2e`.

## Out of scope
Farmer rename; hard delete; per-farmer registry docs / `ownerEmails` (task 24); custom fields (task 8);
naming cleanup of `sheetController`/`sheetRoutes`/`SheetModel` (task 36, next).
