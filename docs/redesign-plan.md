# TsuberMango — Redesign & Task Board (agent extract)

Season maintenance window. Prioritized plan combining customer change-requests (CRs), open backlog, and the multi-tenant modularity refactor. Task numbers are **canonical** — reference tasks by `#` in commits, `done.md`, and follow-ups.

> **What this file is.** The agent-facing extract of `redesign-plan.html`. The HTML is the human-maintained **source of truth** (styling, rationale, the paste-in kickoff prompt); this file is the same plan stripped to what an agent needs to execute a task in one read. **If the two ever disagree, the HTML wins — update it and regenerate this file.** Do not add human-only prose here.

Also: this plan's file references and line numbers win over `CLAUDE.md` (which was stale until task 0 refreshed it).

## Working agreement (applies to every task)

1. **One task number per session.** Don't start, prepare for, or "while I'm here" any other task, even an adjacent one. If you hit a real dependency on another task, stop and report it.
2. Read `CLAUDE.md` for architecture, but trust this plan's file/line references over it where they conflict.
3. Before writing code on a task with design ambiguity, use `superpowers:brainstorming` to lock the spec with the user first. For small, well-specified tasks (e.g. task 2) proceed after restating the spec back. Task 14 needs re-scoping before starting — **likely fully obsolete**: task 23 (Firebase Auth) now lands early (see the priority decision below), and 14 exists only to patch a session-expiry gap that 23 removes.
4. Use test-driven-development where logic is testable. If no harness exists, prefer doing task 22 (bootstrap Vitest once) over ad hoc scaffolding. Chunking (task 4) **must** have tests. (The task-16 import/normalization script that used to be listed here is gone — fresh-start means no import to test; the date helper is a trivial formatter.)
5. UI text stays Hebrew/RTL. All dev-facing content (commits, docs, comments, logs) stays English.
6. Respect the layout contracts in `CLAUDE.md` (PalletTable `h-full` chain, pdfmake lazy-load, boolean coercion for `sent`/`gidon`/`mark`).
7. Touch only the files listed under the task unless you discover a real dependency — call it out if so.
8. After a task is done **and verified** (app/tests actually run — never claim done without that), append a short entry to `done.md` and remove the item from the board below.

## Core problem this plan solves alongside the CRs

The app is welded to one customer. A new farmer today needs a code edit (`FARMER_SPREADSHEET_IDS` map), a new `.env` variable, and a hand-built label spreadsheet whose cell layout is hardcoded in the backend. The label writer assumes every customer's template is byte-identical. One customer-specific flag (`gidon`) is baked into the core sheet schema. Until this is data-driven, "expand to more customers" means "re-deploy per customer."

**Recommended sequence (superseded 2026-07-13 — see the priority decision below):** ~~ship the 5 customer CRs first (cheap, this-season-urgent) → land the P1 modularity foundation → resume P2 backlog.~~ Getting fully off Google Sheets (15 → 16 → 20) now comes first; the CRs and modularity work follow.

Stale items from `todoNow.md` already resolved and dropped from this board: Firestore session storage (commit `ec233ca`), Dashboard "פעילות היום" fix (see `done.md`). Verify before re-opening either.

---

## Priority decision — 2026-07-13: getting off Google Sheets is now the top priority

Made during an off-season planning session (the app is idle right now, no live pallet data to protect). Full reasoning, quoted from that session:

> Off-season collapses the migration from a "project" to a "cutover." Task 16's whole cost and risk in the original plan came from doing it *live* — dual-write to both stores, compare for a week, flip reads farmer-by-farmer behind a feature flag. That ceremony exists only to protect *active season data*. With the data frozen: export every sheet once, import to Firestore, flip the reads, keep the sheets as a cold backup. If the import is wrong, re-run it — nothing is live to corrupt. Off-season the cutover is **~1–1.5 weeks and low-risk**, not the original "6–10 weeks, front-loaded risk" estimate.

**Refinement — 2026-07-13 (fresh-start decision): there is no data to migrate.** The coming season starts *fresh* on Firestore — last year's sheets are not exported, imported, or normalized; they're left in place as a read-only historical archive. That collapses task 16 one more step: from "one-time import cutover" to simply *standing up `FirestoreRepository` and opening the new season on it*. The import/export/normalize script disappears entirely, and with it the risk (there is no data to corrupt) and most of the effort (**~1–1.5wk → ~3–5d**).

This adds exactly one constraint, and it is **comfortably met**: 15 + 16 must land *before* the new season's first intake — once farmers start entering pallets, that store is the store for the year. But the off-season runway is roughly a **full year against a ≤20-week total** for the entire redesign, so the whole top-priority spine, the CRs, and P1 all fit before the season with wide margin. The deadline is real, not tight.

**Priority order is unchanged — reinforced.** Fresh-start makes 15/16 cheaper and lower-risk *and* hands them the one hard deadline on the board, so they belong first even more clearly than before.

**Decided sequence** (supersedes the old "CRs first" recommendation):

1. **15 — Repository layer.** Still comes first regardless of season — without it every controller gets rewritten against Sheets, then rewritten *again* against Firestore. Cheap (~2–3d), makes the cutover mechanical.
2. **16 — Stand up the Firestore records store (fresh-start).** No import, no dual-write, no normalization pass — the new season opens directly on Firestore and last year's sheets stay as a cold archive. **Ex-task 21 (date-format standardization) shrinks to almost nothing** — write ISO from the first record; the only leftover work is the `Dashboard.vue` "פעילות היום" `dd/mm` comparison fix. Task 21 no longer exists as a standalone item.
3. **23 — Firebase Auth + Firestore rules — pulled in alongside 16** (decision: **do not leave parked**). Rationale: moving records to Firestore leaves the existing open-rules leak (`config`/`farmer_events` are `read: if true`) exactly as-is — not worse, but not fixed either. Since 16 already means being deep in the auth/Firestore layer, closing that leak in the same window is cheaper than coming back for it later.
4. **20 — Shipping labels off Sheets.** Records (16) alone don't get you off Sheets — the label spreadsheets are the bigger, more painful tentacle (brittle copied-tabs, hardcoded cells). "Off Sheets" = 16 **and** 20.
5. **CRs 2 / 3 / 4 / 5** — now come after the above. Built directly against the Firestore-backed repository = **zero throwaway work** (no rewriting Sheets-era code paths a second time).
6. Everything else (6–14, 22, 24–35) keeps its existing relative order, resuming after the CRs.
7. **17 / 18 / 19 (the schema/workflow/tenant platform layer) — pushed down / deprioritized.** No driver reaches them yet; they stay parked behind a confirmed second customer, same as before, just explicitly de-emphasized now that 15/16/20/23 have moved up.

**⚠ Open dependency tension worth flagging, not yet resolved:** task 20's original spec depends on task 4 (CR#4's chunking logic — "paginate records across N label documents" reuses the >13-row split) and task 7 (config-driven label template). Under this new order, both 4 and 7 now run *after* 20. Whoever picks up task 20 needs to either (a) build the chunking/config logic directly into 20 rather than reusing 4/7, or (b) accept that 20 gets a follow-up patch once 4 and 7 land later. Not decided yet — flag it back before starting 20.

---

## Ranked board

| # | Task | Priority | Effort | Depends on |
|---|---|---|---|---|
| 0 | ~~Refresh CLAUDE.md — it was stale~~ | P0 | ~0.5d | **DONE** |
| 0.1 | ~~Safe dependency refresh — `npm update` (in-major only; incl. axios security patch)~~ | P0 | ~0.5d | **DONE** (smoke test owed) |
| 1 | ~~CR#5 — Centered "problem" modals (blocking alerts)~~ | P0 | ~0.5d | **DONE** |
| 15+16 | ~~**★ Firestore records layer** — interface + `FirestoreRepository` + full Phase 1 namespacing (merged; no SheetsRepository; auto-string IDs)~~ | ★ TOP (was P3) | ~1–1.5wk | **DONE** (see `done.md`) |
| 23 | ~~**★ Firebase Auth migration + lock down Firestore rules** (pulled in alongside 16, not parked)~~ | ★ TOP (was P1) | ~3–4d | **CODE-COMPLETE on branch `arch-redesign`, CUTOVER PENDING** (see `done.md`) |
| 20 | **★ Shipping labels off Sheets** — dynamic docs, log, archive & bulk download | ★ TOP (was P3) | ~1–2wk | 16, 7 (soft — see flag above), 4 (soft — see flag above) |
| 2 | CR#2 — Intake: drop shipment date, enforce harvest date | P0 | ~0.5d | 1 (soft) |
| 3 | CR#1 — Shipment prep: pick date once + "apply to all" | P0 | ~1d | 1; date format already canonical (via 16) |
| 4 | CR#4 — Certificate >13 rows: auto-split into N certificates | P0 | ~1.5–2d | 1 |
| 5 | CR#3 — Edit destination & weight after certificate issued | P0 | ~1–1.5d | 1 |
| 6 | Farmer registry in Firestore (kill hardcoded ID map) | P1 | ~2–3d | — |
| 7 | Config-driven shipping-label template (cells in config) | P1 | ~3–4d | 6, ideally 4 |
| 8 | Config-driven optional fields (generalize `gidon`) | P1 | ~3–4d | 6 |
| 9 | M8 — PalletTable refactor (composable + sub-components) | P2 | ~2–3d | do before more table features |
| 10 | C3 — Pagination / virtual scrolling | P2 | ~2–3d | 9 |
| 11 | C1 — Season management & archival | P2 | ~5–7d | 6 |
| 12 | C4 — Automatic daily backup (Cloud Scheduler) | P2 | ~2–3d | — |
| 13 | H8 — Mobile responsiveness audit | P2 | ~2–3d | 9 |
| 14 | M1 — Session expiry warning *(very likely obsolete — see rule 3 above)* | P2 | ~0.5d | — |
| 22 | Automated test harness — bootstrap Vitest + CI (L1) | P2 | ~2–3d | — |
| 24 | Farmer-scoped roles & access (H7) | P2 | ~4–5d | 6, 23 |
| 25 | Soft-delete a record + restore (audit-logged) | P2 | ~1–2d | — |
| 26 | Weight sanity checks (per-box range / missing-on-send) | P2 | ~0.5–1d | 1 |
| 27 | QR code on pallet sticker → opens record (covers L3) | P2 | ~1–2d | — |
| 28 | Pallet timeline view (surfaces the audit trail; H3 base) | P2 | ~1–2d | — |
| 29 | Global pallet / certificate search across all farmers | P2 | ~1d | — |
| 30 | Batch sticker printing + preview (covers M2) | P2 | ~1d | — |
| 31 | Stale-pallet nudges on Dashboard | P2 | ~1d | — |
| 32 | Undo last bulk action (30s revert toast) | P2 | ~1–2d | 1 |
| 33 | Driver manifest PDF (per destination/truck) | P2 | ~1–2d | — |
| 34 | Frontend toolchain majors — Vite 8 / plugin-vue 6, then Tailwind 4 (two PRs) | P2 | ~4–6d | after CRs, before 9 |
| 35 | Remaining major bumps — pdfmake 0.3 · vue-router 5 · firebase 12/admin 14 · googleapis · dotenv 17 | P2 | ~3–5d spread | anytime (maint.) |
| 17 | Schema-as-data — record types & field definitions | P3 — **parked/deprioritized** | ~1–2wk | 16, builds on 6–8 |
| 18 | Schema-driven forms & tables (config-rendered UI) | P3 — **parked/deprioritized** | ~1–2wk | 17, 9 |
| 19 | Center (tenant) model + workflow engine + document templating | P3 — **parked/deprioritized** | ~2–3wk | 17 |

*Note on 15/16/23/20's "★ TOP (was P#)" tag: the P-tag in parentheses is their original **category** (P3 = platform-shaped work, P1 = auth/security), not urgency — **row order above is the actual priority**, per the 2026-07-13 decision. They sit at the top of the table on purpose.*

---

## P0★ — Top priority: get off Google Sheets (decided 2026-07-13)

See the "Priority decision" section above for the full rationale. This block executes **before** the customer CRs below.

> **✅ DONE 2026-07-13 — cutover verified live on Firestore.** See `done.md` for the shipped summary. Records, audit, config, users, and farmer_events all live under `centers/tsuberi/…`; write-path farmer validation added; interim Firestore rules deployed (`frontend/firestore.rules`). **Residuals still on Sheets (by design):** `googleSheetsService.js` is retained for farmer provisioning (`create-sheet`/`delete-sheet`), `refresh-cache`, and startup cache-warming → **task 6** removes it; shipping labels → **task 20**. Real centerId resolution + Firestore-rule lockdown → **task 23**. The rest of this block is kept as historical detail.
>
> **★ 15 + 16 are now executed as ONE merged workstream** (brainstormed 2026-07-13 → spec: `docs/superpowers/specs/2026-07-13-firestore-records-layer-design.md`). Task numbers stay canonical for cross-references, but there is **no separate `SheetsRepository`** — fresh-start means Firestore is the first and only implementation, so the interface (15) and `FirestoreRepository` (16) land together. Locked decisions: **full Phase 1 namespacing** (records + audit **and** config, users, farmer_events all move under `centers/tsuberi/…`), **auto-string record IDs** (no counter; `id` becomes opaque), **records cache dropped**, centerId a constant via `/api/auth/me` (real resolution → 23), farmer provisioning → task 6, a minimal Vitest+emulator test down-payment. **Combined effort ~1–1.5wk.** The 15 and 16 cards below are kept for history; the spec supersedes them where they differ.

### 15 — Repository layer — abstract data access

Define a `RecordRepository` interface (`getRecords`, `appendRecord`, `updateRecord(s)`, `bulkUpdateStatus`, …). Reshape today's `googleSheetsService.js` to implement it as `SheetsRepository` without changing behavior. Controllers depend on the interface, not on Sheets directly. **This is the unlock** — task 16 swaps in `FirestoreRepository`, and a parked Postgres option (see DB decision in the old P3 section below) stays a mechanical swap if its trigger ever fires.

Files: new `backend/repositories/RecordRepository.js` (contract) + `SheetsRepository.js` (wrap existing service); `controllers/sheetController.js` injected with the repo.

### 16 — Migrate records Sheets → Firestore (one-time off-season cutover)

Implement `FirestoreRepository` against the interface from task 15, with all data under `centers/{centerId}` (tree detailed in the old P3 section below). Because the coming season starts **fresh** (2026-07-13 decision — no data to migrate), this is a **standup, not a migration**: there is no export/import/normalize step at all.

- **Phase 1 — center-aware namespacing:** move `config/global`, `users`, and `farmer_events` under `centers/tsuberi/…`; frontend gets `centerId` from `/api/auth/me`. **Coordinate with task 6** (the `farmers` subcollection IS that registry — build it namespaced from day one) **and task 23** (center resolution via Firebase Auth custom claims, not a passport-session flow).
- **Fresh records store:** `farmers/{name}/records` and the `audit` subcollections start **empty** and fill up as the new season runs. Last year's sheets are left untouched as a read-only historical archive — not imported.
- **Canonical dates from day one:** write ISO `yyyy-mm-dd` from the first record — no legacy `dd/mm` vs `dd/mm/yyyy` inconsistency to normalize (that was ex-task 21; with no import it shrinks to a formatting choice). **Still update `Dashboard.vue`'s "פעילות היום" comparison** — it compares `dd/mm` today, so an ISO store silently re-breaks that feed unless Dashboard is updated too. This one-line fix is the only survivor of ex-task 21.
- **Cutover = flip writes.** Point the app at Firestore before the season's first intake. Nothing to re-run or roll back — there's no data yet.

**Google Sheets has two tentacles.** This task removes the *records* dependency only. The shipping-label spreadsheets are separate (task 20) — "fully off Sheets" needs both 16 and 20. Once records live in Firestore, point the nightly backup (task 12) at Firestore instead of Sheets.

Files: `backend/repositories/FirestoreRepository.js`, `middleware/resolveCenterId` (custom-claims based), `frontend/src/utils/dates.js` (ISO formatting helper); `useFarmerEvents.js` + `App.vue` path updates; `Dashboard.vue`.

### 23 — Firebase Auth migration + lock down Firestore rules

> **🟡 CODE-COMPLETE on branch `arch-redesign`, CUTOVER PENDING — not yet deployed to production.** See `done.md` for the full shipped summary and the outstanding cutover checklist (Console config, `backfillAuthClaims.js`, rules deploy, backend+frontend deploy, live E2E). Client reads of `config`/`farmer_events` are now authed + center-matched (`request.auth != null && centerId in request.auth.token.centers`), replacing the old `read: if true`. **One deviation from the original spec below:** `centerId` stays env-resolved (`CENTER_ID`, constant `'tsuberi'`) rather than derived from the subdomain — the `centers` custom claim gates which centers a user *may* read/access (claim-guarded), but it does not perform hostname→tenant resolution. Subdomain resolution remains open/deferred. The rest of this card is kept as the original spec for history.

**Pulled in alongside 16** (2026-07-13 decision — not left parked). Firestore rules leave `config` and `farmer_events` `read: if true` — world-readable. Fine for one customer, a real leak the moment there's a second tenant. Cookie-based sessions are why `request.auth` is null client-side today, which forced the open rules.

Execute the Firebase Auth migration already designed in `firebaseSession.html` (Passport/express-session → Firebase ID tokens, `verifyFirebaseToken` middleware, `onAuthStateChanged` router guard). With real `request.auth`, tighten Firestore rules to per-tenant/per-user reads. Resolve the center from the subdomain at login and stamp it as a Firebase Auth custom claim; middleware and Firestore rules both read the claim.

Files: per `firebaseSession.html` — `server.js`, auth middleware, `Login.vue`, router guard, `App.vue`, `firestore.rules`.

### 20 — Shipping labels off Sheets — dynamic docs + label log + archive & bulk download

A shipping label today *is* a Google Sheet — a copied `base` tab, number in cell D7, data written cell-by-cell. No queryable history, no independent backup, no bulk pull.

- **Dynamic generation:** render each label server-side (HTML→PDF or `pdfmake`, already wired for stickers) from a config template — no spreadsheet involved.
- **DB-issued numbering:** a Firestore transactional counter (`centers/{id}/counters`) per farmer, replacing the fragile D7 cell increment.
- **Persistent label log:** every generated label writes a `documents` doc (number, farmer, buyer, shipment date, record ids, generated_by, timestamp, status, artifact path).
- **Artifact storage + backup:** rendered PDFs in a GCS bucket; extend the nightly backup (task 12) to cover it.
- **Archive & bulk download UI:** admin "תעודות" screen — filters, multi-select → ZIP/merged PDF, re-download any one.

Files: new `backend/services/labelService.js` + `documentService.js`, GCS client, `documents` collection; new `frontend/src/components/Labels.vue`; retire `shippingLabelsService.js` and all `SHIPPING_LABELS_ID_*` env vars.

**⚠ See the open dependency-tension flag in the priority-decision section above** before starting — this task's original spec assumed tasks 4 and 7 already existed.

---

## P0 — Customer change requests

*(Now runs after the top-priority Sheets migration above — see 2026-07-13 decision.)*

### 0 — DONE: Pre-flight refresh of CLAUDE.md

Reconciled `CLAUDE.md` against the codebase (each claim verified against source, not just `done.md`): fixed the routes table (`/Dashboard`, `/Intake`, no `/` route), removed the stale "Known Issues" entry (`getRowsByPallet` is implemented), rewrote the auth section (Firestore `users` collection is the live authorization source, `users.json` is first-boot seed only), verified caching/real-time/endpoint tables, added missing `/api/auth/unauthorized` and `/api/internal/backup` endpoints. Left intentionally as-is: `config`/`farmer_events` are still `read: if true` in Firestore rules — that's the leak task 23 closes, not stale drift. Files: `CLAUDE.md`.

### 0.1 — DONE: Safe dependency refresh (in-major only)

`npm update` ran on both sides within existing `^` ranges — lockfile-only, no source changes (branch `chore/dep-refresh-0.1`, one commit per side). **axios 1.8.4 → 1.18.1** (the targeted security patch: redirect credential leakage, SSRF, ReDoS) is closed. Frontend also: `firebase 11.6→11.10`, `vue 3.5.12→3.5.39`, `vue-router 4.0→4.6`, `vite 5.4.11→5.4.21`, `@vitejs/plugin-vue 5.1→5.2`, `tailwindcss 3.4.14→3.4.19`, `pdfmake 0.2.18→0.2.23` (prod `vite build` passes). Backend also: `express 5.1→5.2`, `express-session 1.18→1.19`, `firebase-admin 13.8→13.10`, `@google-cloud/storage 7.19→7.21`, `winston 3.17→3.19`, `nodemon 3.1.9→3.1.14` (all deps load, syntax clean).

**Remaining `npm audit` findings are out of in-major scope, not regressions:** frontend `esbuild` (moderate, dev-server only → vite 8 = task 34) and `xlsx` (high ×2, no npm fix); backend 10 moderate all rooted in transitive `uuid<11.1.1` in the Google client stack, only fixable via `googleapis@173` (breaking = task 35). Force-fixing any breaks the in-major boundary.

**⚠ Still owed before merge to `main`:** the manual smoke test (no test net until task 22) — login/session (`withCredentials`), one Sheets read+write, real-time flash, one sticker PDF, one shipping label. Build + dep-load verified programmatically only. Files: `frontend/package-lock.json`, `backend/package-lock.json` (manifests unchanged).

### 1 — DONE: CR#5: Centered "problem" modals (blocking alert dialogs)

> חלונות קופצים באמצע המסך שנראה אם יש בעיה.

Shipped: shared `useDialogs` composable (`requestAlert()` / `requestConfirm()`), `AlertModal.vue`, confirm/alert promoted out of `PalletTable.vue` into an app-level mechanism wired in `App.vue`. This is the standard error surface tasks 3, 4, and 5 lean on.

Files: `frontend/src/components/shared/AlertModal.vue`; `useDialogs` composable; `App.vue`; adopted in `PalletTable.vue` + `PalletInput.vue`.

### 2 — CR#2: Intake — remove shipment date, enforce harvest date

> קליטת משטחים — להשאיר בלי תאריך (משלוח) ולהוסיף חיוב הוספת תאריך קטיף.

**What:** on the intake (קליטה) form, shipment date is set later at shipment prep, not at intake. Harvest date must be mandatory.

**How:** remove the shipment-date field (`frontend/src/components/PalletInput.vue:137-140`) and its reset/format lines (`formData.shipmentDate` at 344/388/405-406). Harvest date input already carries `required` (line 59), which blocks submit natively — so the dependency on task 1 is **soft**: ship with native validation since 1 is done, route the guard through `requestAlert()`.

Files: `frontend/src/components/PalletInput.vue` only. Mostly a subtraction — verify no downstream report assumes intake writes a shipment date.

### 3 — CR#1: Shipment prep — pick date once + "apply to all"

> בהכנה למשלוח — בחירת תאריך פעם אחת + לחצן "החל על הכל" כך שכל המשטחים יהיו על אותו תאריך.

**What:** in the shipment-prep view (where pallets are selected for a certificate), one date picker + a "החל על הכל" button stamps the chosen shipment date onto every selected pallet in one action.

**How:** add a small bulk-date toolbar to the selection UI in `frontend/src/components/PalletTable.vue` (near the label/toolbar block). On click: set `shipmentDate` on all `selectedPallets` locally, then persist. Confirm the count through task 1's modal first.

**⚠ Do NOT reuse `PUT /records/updatemany` naively.** That controller validates the whole row and **rejects pallets with missing/zero weight or boxes** — if a user sets the shipment date *before* weighing (the normal order), "apply to all" 400s. It also overwrites the entire row, risking clobbering concurrent edits (worse once task 5 lands). **Recommended:** add a narrow `updateShipmentDateForPallets` endpoint that touches only that column — mirror the existing `updateSentStatusForPallets` / `updateSendToDestinationPallets` pattern (partial-column update, its own append-lock, its own Firestore event).

**Date format:** already settled by the time this task runs — task 16 makes canonical ISO `yyyy-mm-dd` the store's native format from day one (fresh-start, no legacy dates), ahead of the CRs in the new sequencing, so no separate decision needed here.

Files: `frontend/src/components/PalletTable.vue`; new `updateShipmentDateForPallets` in the repository/service + `sheetController.js` + a route.

### 4 — CR#4: Certificate >13 rows — auto-split into multiple certificates

> הפקת תעודת משלוח למעל 13 שורות — אפשרות פיצול ל-2 תעודות אוטומטית.

**What:** the label template holds 13 rows (rows 11–23). Today >13 pallets is a hard block. Instead, chunk into groups of 13 and emit one certificate per chunk automatically.

**How:**
- Remove the >13 disable in `isCreateLabelAllowed` (`PalletTable.vue:374`); allow any count > 0.
- **Chunk by pallet-number GROUP, not by raw row.** The label sheet counts unique wooden pallets (the `C24` `=COUNTA(UNIQUE(...))` formula and the "1" written in column C for the first row of each pallet). If two rows sharing a pallet number land in different chunks, the wooden-pallet count is wrong on both certificates. Group rows by `palletNumber` first, then bin whole groups into certificates of ≤13 rows.
- Backend: chunk in `createNewShippingLabel`; for each chunk run the base-copy + write flow, returning an array of created certificate names/ids. Keep the single-destination guard per chunk.
- **Make it atomic — move the record update into the backend.** Today the frontend creates the label then separately calls `updatemany` to stamp `cardId`/`sent`; if that second call fails you get an *orphan certificate*. With N chunks this multiplies. Have the backend flow write the label AND stamp the records' `cardId` per chunk in one transaction-ish path, returning the final state.
- **Fix the numbering race.** The certificate number is a read-increment-write on cell `D7` — two concurrent creations can mint the same number. Reuse the per-farmer append-lock pattern already built for Sheets writes (commit `94b2272`) around the increment.
- Frontend: map each returned certificate number back to the correct chunk's pallets (currently one `res.result.name` is assigned to all).
- Surface a split preview in the confirm modal before creating: "ייווצרו 2 תעודות: 13 + 4".
- On success, show "נוצרו N תעודות" and a "פתח תעודה" link straight to each created sheet tab (free win until task 20's archive replaces it).
- **Write the Firestore label log now.** Emit one fire-and-forget doc per created certificate (number, farmer, pallet ids, date, creator) — same style as the audit events. Gives "log of all labels ever" from day one, so task 20's archive UI opens with history instead of empty.

**⚠ ASK THE CUSTOMER before building:** with auto-split, should mixed destinations still hard-fail, or auto-split by destination too (one certificate per destination)? Cheap to ask now, changes the chunking rule.

**⚠ Sequencing note (new, 2026-07-13):** task 20 (shipping labels off Sheets) is now scheduled *before* this task, and 20's original spec assumed this task's chunking logic already existed. See the open dependency-tension flag in the priority-decision section above.

**Why:** a real operational blocker — large shipments currently can't produce a certificate at all.

Files: `backend/controllers/labelController.js`, `backend/services/shippingLabelsService.js`, `firestoreEventService.js` (label-log emit), `frontend/src/components/PalletTable.vue`.

### 5 — CR#3: Edit destination & weight after certificate issued

> אפשרות לשנות יעד ומשקל גם אחרי הנפקת תעודה (שינויי מיקום ומשקל שקורים כשהמשטח כבר יצא).

**What:** after a pallet is marked sent / a certificate is issued, weight and destination can still change in reality. Allow editing both post-issuance, safely and auditably.

**How:**
- **Already verified — nothing locks sent rows today.** The edit button renders for every non-context row wherever `isEditable` is true (Weight, SentPallets), so post-issuance editing already works mechanically. Do not re-investigate. The task is just: (a) gate edits on sent rows behind a warning modal (task 1): "המשטח כבר יצא — לשנות בכל זאת?", and (b) the certificate-resync decision below.
- Persist via the existing single-record `PUT /records/:id` (already stamps `editedBy`/`editedAt` → audit trail covers the change).
- Decide certificate resync policy: the label spreadsheet was already written from a snapshot. Options — (a) leave the printed certificate as-is and only correct the source record, or (b) offer "עדכן תעודה" to rewrite the matching row on the label sheet. Recommend (a) for v1 with a visible "התעודה הופקה לפני השינוי" indicator; (b) as a follow-up.

**Why:** largest CR — real-world weight/location corrections happen after dispatch; today the record is effectively frozen at issuance.

Files: `frontend/src/components/PalletTable.vue`; `backend/controllers/sheetController.js` (already supports update). Label rewrite (option b) → `shippingLabelsService.js`.

---

## P1 — Modularity & multi-tenant foundation

Turn the three hardcoded single-customer couplings into data-driven config so a new farmer is an admin action, not a deploy. *(Task 23, formerly listed here, has moved up to the top-priority Sheets-migration block above.)*

### 6 — Farmer registry in Firestore (kill the hardcoded ID map)

**Problem:** `FARMER_SPREADSHEET_IDS` (`shippingLabelsService.js:5-13`) and per-farmer `SHIPPING_LABELS_ID_*` env vars mean adding a farmer = edit code + add env var + redeploy.

**What:** a `farmers` collection (or extend `config/global.farmerConfigs`) holding per-farmer: `displayName`, `sheetName`, `shippingLabelsSpreadsheetId`, feature flags. `getSpreadsheetIdByFarmer()` reads from this (cached), not from the env map. Admin "ניהול חקלאים" section in `Settings.vue` to add/edit farmers.

**How:** load registry at startup + cache like `cachedSheetNames`; invalidate on the admin write; keep env vars as a migration fallback for one release. New admin endpoints `GET/POST/PUT /api/admin/farmers` mirroring the existing users endpoints.

**⚠ Fix the silent fallback.** `getSpreadsheetIdByFarmer()` currently returns Tsuberi's spreadsheet for any unknown farmer — a new/misspelled farmer's certificates get written into another customer's file. Make it **fail loudly** (throw / 400) instead of defaulting. This is a data-leak-shaped bug that gets worse the moment there's a second customer.

**Design note (for task 24):** shape the farmer record with "users linked to a farmer" in mind — a nullable `ownerEmails` / `accountId` field — even though task 24 ships later. Cheap to reserve, painful to retrofit.

**DB decision ripple:** this registry IS the `farmers` subcollection from the adopted Firestore architecture (see P3 section). Build it as `centers/tsuberi/farmers/{name}` from day one (or trivially movable to that path) — coordinate with task 16, which builds this same namespacing.

Files: `backend/services/shippingLabelsService.js`, `backend/services/googleSheetsService.js`, `routes/sheetRoutes.js`, `frontend/src/components/Settings.vue`, Firestore.

### 7 — Config-driven shipping-label template

**Problem:** `writeShippingDataToSheet` hardcodes cell coordinates (date→B6, destination→B8, count→C24, data→row 11, id→D7) and column order. Any customer whose template differs breaks silently.

**What:** a per-farmer (or per-template) `labelTemplate` config: `{ idCell, dateCell, destinationCell, countCell, dataStartRow, rowsPerCert, columnMap }`. The writer reads coordinates from config instead of literals.

**How:** refactor the batch-update builder to iterate `columnMap` and use configured cells; keep the current values as the default template so behavior is identical for the existing customer. Best done right after task 4 so the chunking + config land together and the label code is only reworked once.

Files: `backend/services/shippingLabelsService.js`, template config in Firestore.

### 8 — Config-driven optional fields (generalize `gidon`)

**Problem:** `gidon` (column L) is a single-customer flag hardwired into the core schema, `SheetModel`, and `farmerConfigs: { "גבי צוברי": { allowGidon: true } }`. Any customer-specific field today means schema surgery.

**What:** represent customer-specific booleans/fields as declarative config (`customFields: [{ key, label, type, column }]`) driven off the farmer registry (task 6). The table, intake form, and model read the list rather than naming `gidon` directly.

**How:** incremental — keep `gidon` working, add the generic path alongside, then express `gidon` through it as the first migrated field. Column A–O layout stays; custom fields map to reserved columns per template.

**Note:** lower urgency than 6/7 — do only when a second customer actually needs a distinct field.

Files: `backend/models/sheetModel.js`, `googleSheetsService.js`, `frontend/src/data/data.js`, `PalletInput.vue`, `PalletTable.vue`.

---

## P2 — Backlog high-value (resume after P0/P1)

### 9 — PalletTable refactor (M8)

`PalletTable.vue` is ~880 lines and growing, owning inline edit, sort, search, bulk-select, filtering, label creation, and toolbars. Extract `usePalletTableState` composable + `PalletTableToolbar.vue` + `PalletTableRow.vue`; main file becomes a thin orchestrator. Do this before 10/13 — but CRs 1/3/4 also touch this file, so extract only after those land to avoid churn.

### 10 — Pagination / virtual scrolling (C3)

Server-side pagination on `GET /records` or `useVirtualList` in the table; Hebrew row counter "מציג 50 מתוך 347". Depends on task 9.

### 11 — Season management & archival (C1)

Firestore `seasons` concept, "close season" that archives tabs (`{farmer}_2025`) and opens fresh ones, season selector, auto summary on close. Pairs with the farmer registry (task 6) and replaces the manual `NEW_SEASON.md` ritual.

### 12 — Automatic daily backup (C4)

Cloud Scheduler nightly export of all active-season sheets → JSON in GCS; admin "גיבויים" list. Endpoints already scaffolded (`/api/admin/backup`, `/api/admin/backups`) per `CLAUDE.md` — see `backend/CLOUD_SCHEDULER.md`. After task 16, the export source becomes the Firestore `records` subcollections instead of Sheets.

### 13 — Mobile responsiveness audit (H8)

Audit at 390px / 768px; collapse low-priority table columns, ≥44px tap targets, stack bulk toolbar. Depends on task 9.

### 14 — Session expiry warning (M1)

On 401, set `sessionExpired` in `sessionStorage` and show a Hebrew banner on Login. Re-scope first — Firestore session storage already landed; confirm what expiry behavior remains. **Very likely to skip entirely:** task 23 (Firebase Auth) now ships early in the new sequencing — ID tokens auto-refresh, so "session expiry" mostly stops existing as a concept by the time this task would start.

### 22 — Automated test harness (L1)

Bootstrap this once, deliberately — not ad hoc per task. Vitest for backend (`sheetModel` validation, the new chunking/date utils, controller error paths) + Vitest/Vue Test Utils for `PalletInput` and `PalletTable` filter/sort. GitHub Actions CI on push. The chunking (task 4) is exactly the kind of thing that must have tests. (The task-16 migration/normalization script that used to be the other flagship test target no longer exists — fresh-start dropped the import.)

### 34 — Frontend toolchain majors (do before the frontend refactors)

**Why early, not gated on tests:** blast radius grows with the code you write. Every component the P2 cluster adds or restyles — the PalletTable refactor (9), virtual scroll (10), mobile audit (13) — is more surface a later Tailwind migration has to redo. Land the toolchain first and that work is written once, on the new versions. Unit tests (task 22) are the wrong net here — they don't catch a broken `mango` palette; CSS regressions need visual QA.

**Sequencing:** not mid-season — ship the P0 CRs first (their Tailwind footprint is small and cheap to re-migrate). Then, in the quiet window before task 9, do **two separate contained PRs** (keep each isolated so a regression is obvious):

| Upgrade | Risk | What breaks / why |
|---|---|---|
| `vite` 5→8 (+ plugin-vue 6) | Med-High | Three majors compounded — Node-version floors, default browser targets, Environment API, config changes across 6/7/8. Move `@vitejs/plugin-vue` to 6 in lockstep. Test `build` + `preview`, not just `dev`. Do this one first. |
| `tailwindcss` 3→4 | High | Ground-up rewrite: CSS-first config replaces most of `tailwind.config.js`, `@tailwind`→`@import "tailwindcss"`, PostCSS plugin moves to `@tailwindcss/postcss`, default palette changed, deprecated utilities removed. With the custom `mango`/`sidebar` palette and Tailwind-only styling, this is a migration project. (Works on Vite 5+, so Vite 8 isn't a hard prereq — but doing them in one window means one build re-verification.) |

Files: `frontend/package.json` + lockfile, `vite.config.js`, `tailwind.config.js` → CSS entry / `@theme`, PostCSS config; visual pass over every page.

### 35 — Remaining major bumps (maintenance, anytime)

The opposite of task 34: these are config/environment-level, so their cost doesn't grow with app code — waiting is free. Don't batch them — one PR each so a regression is traceable. The router/service ones benefit from task 22's JS tests; the rest are pure manual smoke test.

| Upgrade | Risk | What breaks / why |
|---|---|---|
| `pdfmake` 0.2→0.3 | Med | 0.x → a minor is breaking. Changed vfs/build handling directly threatens the custom `vfs_fonts` + lazy-load `pdfMake.vfs = pdfFonts` pattern. Sticker-PDF only — but load-bearing; careful QA. |
| `vue-router` 4→5 | Med | Navigation-guard API changes affect the `beforeEach`/`next()` guard. Router is ~100 lines, so contained — rewrite the guard, test every redirect. |
| `firebase` 11→12 · `firebase-admin` 13→14 | Low-Med | Modular API is stable, so app code likely fine — risk is environment/peer (min Node/browser floors). Check Cloud Run's Node version before admin 14. |
| `googleapis` 148→173 | Low-Med | 25 majors, but this package auto-bumps major on every regeneration; Sheets v4 usage is narrow and stable. Test the read/write path. |
| `dotenv` 16→17 | Low | Trivial; v17 mainly added a startup log line. Safe whenever. |

Files: both `package.json`s + lockfiles; per-upgrade touchpoints (`router.js`, `printData.js`/`vfs_fonts.js`, `googleSheetsService.js`).

### 24 — Farmer-scoped roles & access (H7)

A `farmer` role linked to a specific farmer; router + backend `ensureOwnFarmerOrAdmin` so Farmer A can't see Farmer B's data. Overlaps task 6 (registry stores the user↔farmer link) and depends on task 23 (real `request.auth` for enforceable rules — now available early, per the new sequencing). Ship after the registry.

### Feature ideas (mostly cheap, high day-to-day value)

**25 — Soft-delete a record + restore.** Probably the most-hit real gap. There is no way to delete a mistaken row from the UI — it requires opening Google Sheets by hand. Add a delete that marks the row (or moves it to a trash sheet) with an admin "שחזר" restore, audit-logged.

**26 — Weight sanity checks.** Warn (via task 1's modal) when weight÷boxes falls outside a normal per-box range, or weight is missing/zero on a pallet being sent. Catches typos (485 vs 48.5) before they reach a certificate.

**27 — QR code on the pallet sticker (covers L3).** The sticker PDF already exists — embed a QR encoding the pallet ID. Scanning from a phone opens that record (or pre-fills the weight form). Delivers the backlog's barcode-scan story with no new hardware.

**28 — Pallet timeline view (H3 base).** Click a pallet → side panel with its full story: intake, weighing, destination mark, certificate number, every edit from the audit sheet. The audit data is already collected — today only the ⓘ tooltip exposes any of it. A "print PDF" on this panel is the traceability doc (H3).

**29 — Global pallet / certificate search.** One search box (Dashboard or header) that finds a pallet number / certificate number across all farmers and jumps to it. Today you must pick the right farmer first and search inside that table.

**30 — Batch sticker printing + preview (covers M2).** Multi-select pallets → one PDF with all stickers, with a preview before print. Currently exactly one sticker per click.

**31 — Stale-pallet nudges on Dashboard.** Cards for the fall-throughs: "unweighed for 3+ days", "marked for destination but never sent", "sent without certificate". The data exists; nobody is checking for these gaps.

**32 — Undo last bulk action.** After "העבר למשלוח" on 30 pallets or a bulk reset, a 30-second "בטל" toast that reverts it. Complements the confirmation modals (task 1) — mistakes still happen after clicking אשר. The audit trail already captures the before-state to revert to.

**33 — Driver manifest PDF.** From `DestinationsSummary`, print a per-destination/per-truck page: pallets, boxes, total weight, farmer. Today that summary lives only on screen or as Excel; drivers get screenshots.

### Backlog items consciously parked (not dropped silently)

- **H2 — PWA + offline entry queue** (`pwaRequirements.md`): big bet, real value for spotty packhouse WiFi. Parked until after the DB move — the Firestore decision *strengthens* it: the Firestore SDK's built-in offline persistence + queued writes replaces most of the hand-rolled IndexedDB queue that doc specs. Re-scope down after task 16.
- **H3 — Traceability PDF:** absorbed into task 28 (timeline view → print).
- **M2 — Sticker preview:** absorbed into task 30.
- **L3 — Barcode scan intake:** absorbed into task 27 (QR).
- **M7 — `shippedAt` timestamp:** small; fold into task 4's label log (`generated_at`) / task 20 rather than a standalone column.
- **M3 WhatsApp summary, M5 analytics, L2 scale integration, L4 buyer portal, L5 i18n:** still valid, still long-term — revisit once there's a second customer and the DB is real.

---

## P3 — Platform vision: from mango-sorting app to configurable record platform (17–19 parked/deprioritized)

**Goal:** the app tracks one thing (mango pallets) for one business; the vision is to track *anything* for *anyone* — different products, fields, workflows — on a real database instead of Google Sheets. **Reframe:** stop hardcoding the domain. A pallet is just a *record* with typed fields moving through *stages*, owned by an *account*, belonging to a *tenant*. When the domain (fields, stages, lists, documents) becomes data instead of code, one engine runs a mango packhouse, a citrus co-op, or a warehouse. P1 tasks 6–8 already start this; P3 finishes it.

> **Note (2026-07-13):** tasks 15, 16, and 20 — originally introduced in this section as "the migration strategy" — have been **promoted to the top-priority block** near the start of this document. The rationale, decisions, and reference material below (DB decision, data model, architecture) still apply and are kept here for context. Only tasks **17, 18, and 19** remain in scope for this section, and they are explicitly **parked/deprioritized** — no driver reaches them until a confirmed second customer exists.

### Decided product direction (read before touching the DB schema)

No confirmed second customer yet, and money/settlement is "maybe later." Strategy: **reserve the seams, don't build the features, don't over-abstract.** The failure mode is gold-plating a platform for customers who don't exist — not under-abstracting.

**DO** (cheap now, expensive to retrofit later — and with fresh-start there's no second import to sneak them in during, so bake them into task 16's schema from the first record):
- Model **buyers/destinations as an entity** (a `buyers` table), even while the UI still uses a string dropdown. Keeps orders/invoicing/settlement possible with no future migration.
- **Reserve money fields** (price, grade, amount) as nullable columns — present, unused, absent from the UI.
- Use **generic naming** at the data layer (record/lot, not "pallet").

**DON'T** (until a real second customer forces it): rich workflow engine early (task 19 stays late), self-serve tenant creation, no-code field builder, settlement/invoicing UI, infinitely-generic fields. Keep it produce-shaped — one seeded tenant, one "pallet" record type. Prove the mango tenant runs cleanly on the new DB first, onboard a real second customer, then let their needs drive 17–19. *Validate before you generalize.*

### DB DECISION (binding) — Firestore, not PostgreSQL

Supersedes any earlier Postgres framing of tasks 15–20 and adopts `docs/multi-tenant-architecture.md` **with amendments** (that doc's status header lists them; this plan is canonical wherever they disagree).

**Why Firestore:**
- **Cost asymmetry:** Cloud SQL never scales to zero (~$10–30/mo idle, forever) — abandoning the scale-to-zero economics this app was built around. The entire dataset is ~1,500 tiny documents; if Firestore turns out wrong, re-migrating to Postgres is a script, not a project.
- **Reuses infra already in production:** config, users, and the real-time `farmer_events` layer are already Firestore. One DB, one SDK, free tier at target scale (3 centers × ~5 farmers).
- **The concrete next customer is another sorting center** doing mango-shaped work — not a new domain.

**Postgres is parked behind explicit triggers, not dead.** Revisit the moment the first arrives: (a) settlement/invoicing (real transactions), (b) cross-center reporting/analytics needing joins/aggregations Firestore can't do, (c) a non-produce domain. Task 15's repository interface exists precisely so that swap stays mechanical. **Do NOT provision Cloud SQL / Prisma.**

### The generalization map

| Today (mango-specific, hardcoded) | Generalized concept (config-driven) |
|---|---|
| Farmer | **Account** — a record owner within a tenant |
| Pallet record (fixed columns A–O) | **Record** of a **Record Type**, with typed field definitions |
| kind / size / boxes / weight / `gidon` | Fields declared in the record type's schema (typed, optional, per-tenant) |
| Intake → Weight → Destination → Sent | **Stages** in a configurable **workflow** |
| Shipping label / certificate | **Document** produced by a **template** (any format, not just a Sheet) |
| Season | **Period / cycle** — a generic time bucket |
| kinds / sizes / destinations lists | **Lookup lists** — named reference options per tenant |
| One Google Sheet per farmer | Firestore docs under `centers/{centerId}/farmers/{farmer}/records` |
| Single business | **Center** (tenant) — top-level isolation boundary, resolved per subdomain |

### Layered architecture

Controllers depend on a `RecordRepository` **interface** (task 15), not on Sheets directly. Implementations are swappable: `SheetsRepository` (today, legacy) → `FirestoreRepository` (target, task 16) → `PostgresRepository` (parked, trigger-based). Above the interface sit the domain services (validation, workflow/stage transitions, document generation, audit) and the schema-driven Vue UI. Below it, everything lives in Firestore under `centers/{centerId}`. Config (record types, fields, stages, lists, templates) lives in the DB and is read at runtime.

### Data model — Firestore tree

Merges `docs/multi-tenant-architecture.md` with the reserved seams. Everything namespaced under `centers/{centerId}` — the tenant boundary. Keep documents flat and typed; the reserved seams (buyers as entity, money fields, generic naming) apply to document shapes exactly as they would to columns. Promote a hot field to a composite index only when a view needs to filter/sort on it.

```
centers/{centerId}                          -- tenant boundary, resolved per subdomain
  config (doc)          kinds, sizes, destinations, farmerConfigs
  users/{email}         role, farmerId?     -- farmerId → farmer-scoped users (task 24)
  buyers/{buyerId}      name, contact, terms     -- "destination" as an ENTITY
                                            -- reserve NOW even while UI keeps a string dropdown
  record_types/{id}     fields[], stages[]  -- schema-as-data (task 17)
  farmers/{farmerName}  name, shippingLabelsSpreadsheetId, customFields   -- = task 6 registry
    records/{recordId}  ...today's columns B–O as fields..., buyerId?, stage,
                        price?, grade?, amount?    -- reserved money seam: present, unused
    audit/{auditId}     recordId, action, editedBy, editedAt   -- replaces {farmer}_audit sheet
  farmer_events/{farmerName}   -- real-time delta, overwritten per write (pattern unchanged)
  documents/{docId}     number, farmerName, buyerId?, recordIds[], status, generatedAt, path
  periods/{periodId}    name, status, startedAt, endedAt       -- "season"
  counters/{name}       value   -- transactional certificate numbering (replaces the D7 cell)
```

The current mango app becomes exactly one seeded tree: one center (`tsuberi`), N farmer docs, one `record_type` "pallet" whose `fields` = today's columns A–O, whose `stages` = today's flow, and one label template. **Known trade-off:** Firestore is weak at ad-hoc aggregation — summaries (DestinationsSummary, dashboards) compute over a farmer's record set in the backend, which is fine at this scale; if that stops being fine, that's a Postgres trigger (see decision above).

### Migration strategy — now a one-time cutover, not strangler-fig

*(Superseded 2026-07-13: the section below described a live dual-write strangler-fig migration. Off-season it became a one-time cutover; the **fresh-start decision removes even that** — there is no migration at all, task 16 just stands up an empty Firestore store for the new season (see the priority decision at the top of this document). Tasks 15, 16, and 20 have moved there; this note stays for historical context.)*

### 17 — Schema-as-data — record types & field definitions *(parked/deprioritized)*

Introduce `record_types` with typed `fields` + `stages`. Validation and serialization read the field list instead of the hardcoded `SheetModel`. Migrate the mango pallet into a seeded record type. Direct continuation of P1 task 8 (config-driven fields) — do 8 first as the small proof, then generalize here. Files: replace `models/sheetModel.js` with a generic `RecordSchema` validator; record-type CRUD endpoints; admin "סוגי רשומות" UI.

### 18 — Schema-driven forms & tables *(parked/deprioritized)*

Render `PalletInput` and `PalletTable` from field definitions — a `FieldRenderer` maps each field `type` (text/number/date/select/boolean) to an input and a cell. The mango table stops being bespoke; it's the generic table fed the pallet record type. Depends on the PalletTable refactor (task 9), which is why 9 is worth doing regardless. Files: new `frontend/src/components/schema/` (FieldRenderer, DynamicForm, DynamicTable); refactor `PalletInput.vue`/`PalletTable.vue` to consume them.

### 19 — Center (tenant) model + workflow engine + document templating *(parked/deprioritized)*

The final generalization layer:
- **Centers:** largely delivered by task 16's namespacing — all data under `centers/{centerId}`, middleware resolves the center from the subdomain/auth claims, onboarding a center = create its Firestore tree + DNS CNAME + Hosting domain. This task finishes the edges: center-scoped admin UI, per-center feature flags. The mango business is center #1.
- **Workflow engine:** stages + allowed transitions as config; the "sent/mark/weight" buttons become generic stage-advance actions.
- **Document templating:** generalize the now-DB-backed label engine (task 20) into a template engine for any document type — delivery notes, certificates, reports — targeting pdfmake or HTML per template.

Files: tenant middleware in `server.js`; `workflowService.js`; `documentService.js` abstracting `shippingLabelsService.js`.

### Sequencing & guardrails

1. Do **not** start 17–19 mid-season — it's infrastructure, best done in a quiet window, and stays parked/deprioritized until a confirmed second customer exists.
2. P1 (6–8) is the rehearsal for 17–19: it externalizes farmers, label layout, and fields into config on the current stack. Land it after the CRs — it de-risks a future platform push and is useful even if 17–19 slip indefinitely.
3. Tasks 15 → 16 → 20 are now the top-priority spine (see the decision at the top of this document) — they no longer wait on P1/P0.
4. Resist EAV and premature "no-code builder" ambitions. Ship the mango tenant on the generic engine first; onboard a second real domain before building self-serve tenant creation.

**Open question worth deciding before task 17:** how different are the "more" use cases? If they're all pack/ship/track logistics (other crops, warehouses), a fixed workflow with configurable fields is enough. If they diverge structurally (e.g. non-logistics domains), the workflow engine (task 19) needs to come earlier and be richer. This changes how generic tasks 17–19 must be. Not urgent — 17–19 are parked.
