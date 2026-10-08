# TsuberMango — Active Task Board
Source of truth for agents (the old `redesign-plan.html` is a frozen human snapshot — do not edit it). Task numbers are canonical: use `#` in commits and `done.md`.
Rationale, history, shipped task cards and the platform vision: [redesign-reference.md](redesign-reference.md). Shipped work: `../done.md`.

## Working agreement
1. **One task number per session.** No "while I'm here" work on other tasks; on a real dependency, stop and report.
2. Read `CLAUDE.md` for architecture; this board's file references win where they conflict.
3. Ambiguous spec: lock it first with `superpowers:brainstorming`. Small well-specified tasks (e.g. 2): restate the spec, then proceed.
4. TDD where logic is testable. Verification = `cd backend && npm test` + `cd frontend && npm run e2e` (see the `local-dev` skill). No GitHub CI, ever (public repo — owner decision). Task 4 chunking **must** have tests.
5. UI text is Hebrew/RTL; all dev-facing text (commits, docs, comments, logs) is English.
6. Respect the layout contracts in `CLAUDE.md` (PalletTable `h-full`, pdfmake lazy-load, boolean coercion for `sent`/`gidon`/`mark`).
7. Touch only the files listed under the task unless you find a real dependency — call it out.
8. When done **and verified** (tests/app actually run), append an entry to `done.md` and remove the task from this board.

## Ranked board (open tasks; shipped 0, 0.1, 1, 15+16, 23 are in the reference doc / `done.md`)
Task 14 (session-expiry warning) is obsolete. Task 22: local half DONE 2026-10-08 (`api.test.js` + Playwright e2e); CI half DROPPED. Optional leftover: frontend unit tests for `PalletInput` / `PalletTable` filter+sort.

| # | Task | Priority | Effort | Depends on |
|---|---|---|---|---|
| 20 | ★ Shipping labels off Sheets (dynamic docs, label log, archive, bulk download) | TOP | 1–2wk | 16 done; 4, 7 soft (see blockers) |
| 4 | CR#4 Certificate >13 rows: auto-split — **built inside task 20** | P0 | (in 20) | 20 |
| 6 | Farmer registry in Firestore (kill hardcoded ID map) | P1 | 2–3d | — |
| 7 | Config-driven shipping-label template | P1 | 3–4d | 6, ideally 4 |
| 8 | Config-driven optional fields (generalize `gidon`) | P1 | 3–4d | 6 |
| 36 | Naming cleanup (Sheets-named files that no longer touch Sheets) | P2 | 0.5–1d | 6 and 20 (hard); before 9 |
| 34 | Frontend toolchain majors (Vite 8, then Tailwind 4) | P2 | 4–6d | after CRs, before 9 |
| 9 | PalletTable refactor | P2 | 2–3d | after 1/3/4 land, 36 |
| 10 | Pagination / virtual scrolling | P2 | 2–3d | 9 |
| 11 | Season management & archival | P2 | 5–7d | 6 |
| 12 | Automatic daily backup (Cloud Scheduler) | P2 | 2–3d | — |
| 13 | Mobile responsiveness audit | P2 | 2–3d | 9 |
| 24 | Farmer-scoped roles & access | P2 | 4–5d | 6 |
| 25–33 | Feature ideas (below) | P2 | 0.5–2d each | — |
| 35 | Remaining major bumps (maintenance) | P2 | 3–5d spread | anytime |
| 17–19 | Schema / forms / tenant platform layer | P3 | — | parked, see reference |
| — | Fridge layout (new feature; branch `feature/fridge-layout`, 2 unmerged commits from 2026-05-20) | last | ? | everything else; parked until then |

## Open decisions / blockers
- **CR#4 answered (2026-10-08):** >13 rows is rare; when it happens they issue two certificates (it is printed, so it cannot grow longer). Auto-split into ≤13-row certificates by pallet group; keep the single-destination guard per certificate. Low frequency → build it into task 20, not on the Sheets path.
- **Task 20 vs 4/7: decided** — build the chunking (4) and a config-driven template (7) directly into 20; task 4 is not built on Sheets.
- **Season start:** ~2 months out (≈ early Dec 2026, as of 2026-10-08). Everything needed for intake → certificate must be done and farmer-verified before then.
- **Device:** the packhouse uses one Samsung Galaxy Tab (model TBD) in landscape; may grow to more devices. Playwright runs a `tablet` project at 1280×800 alongside `desktop`.
- **Realtime echo suppression is keyed on email** (`frontend/src/composables/useFarmerEvents.js:28`): the same account on two devices won't see live updates. Fix idea: per-tab client id. Low priority (one tablet today).

## Task cards

### 20 — Shipping labels off Sheets
**What:** a label today is a Google Sheet (copied `base` tab, number in `D7`, cell-by-cell writes). Replace with:
- Server-side rendering (pdfmake, already wired for stickers) from a config template.
- Firestore transactional counter `centers/{id}/counters` per farmer, replacing the `D7` increment.
- Persistent `documents` log (number, farmer, buyer, shipment date, record ids, generated_by, timestamp, status, artifact path).
- PDFs in a GCS bucket; extend the nightly backup (task 12) to cover it.
- Admin "תעודות" screen: filters, multi-select to ZIP/merged PDF, re-download.

**Files:** new `backend/services/labelService.js` + `documentService.js`, GCS client, `documents` collection; new `frontend/src/components/Labels.vue`; retire `shippingLabelsService.js` and all `SHIPPING_LABELS_ID_*` env vars. Resolve the 20-vs-4/7 blocker first.

### 4 — CR#4 Certificate >13 rows: auto-split
> הפקת תעודת משלוח למעל 13 שורות — אפשרות פיצול ל-2 תעודות אוטומטית.

**What:** template holds 13 rows (11–23); chunk into certificates of ≤13 rows each instead of hard-blocking.
**How:**
- Remove the `> 13` disable in `isCreateLabelAllowed` (`PalletTable.vue:346-348`).
- **⚠ Chunk by pallet-number GROUP, not raw row.** The wooden-pallet count (`C24` `COUNTA(UNIQUE(...))`, and the "1" in column C on a pallet's first row) breaks if one pallet's rows straddle two chunks. Group by `palletNumber`, then bin whole groups into ≤13 rows.
- Backend: chunk in `createNewShippingLabel` (`backend/services/shippingLabelsService.js`); run base-copy + write per chunk; return an array of certificate names/ids. Keep the single-destination guard per chunk.
- **Make it atomic:** today the frontend creates the label then calls `updatemany` to stamp `cardId`/`sent`; a failure leaves an orphan certificate, multiplied by N chunks. Stamp `cardId` per chunk in the backend flow.
- **⚠ Fix the numbering race:** the number is a read-increment-write on cell `D7`; concurrent creations can mint duplicates. The old append-lock is gone with the records cache, so serialize the increment explicitly (or use task 20's Firestore counter).
- Frontend: map each returned number to its own chunk's pallets (today one `res.result.name` goes to all); confirm modal shows the split ("ייווצרו 2 תעודות: 13 + 4"); success shows "נוצרו N תעודות" with a link to each sheet tab.
- Emit a fire-and-forget Firestore label-log doc per certificate (number, farmer, pallet ids, date, creator) so task 20's archive starts with history.
Files: `backend/controllers/labelController.js`, `shippingLabelsService.js`, `firestoreEventService.js`, `PalletTable.vue`. Tests required.

### 6 — Farmer registry in Firestore
**Problem:** `FARMER_SPREADSHEET_IDS` + per-farmer `SHIPPING_LABELS_ID_*` env vars in `backend/services/shippingLabelsService.js:6-14` mean a new farmer = code edit + env var + redeploy.
**What:** `centers/tsuberi/farmers/{name}` docs holding `displayName`, `sheetName`, `shippingLabelsSpreadsheetId`, feature flags, and a nullable `ownerEmails` (reserved for task 24). `getSpreadsheetIdByFarmer()` reads the registry (cached, invalidated on admin write); keep env vars as a one-release fallback. New `GET/POST/PUT /api/admin/farmers` in `backend/app.js` mirroring the users endpoints; "ניהול חקלאים" section in `Settings.vue`. The task also deletes `googleSheetsService.js` and the `create-sheet`/`delete-sheet`/`refresh-cache` endpoints in `app.js` plus startup cache-warm in `server.js`.
**Already fixed 2026-10-08:** the silent fallback to Tsuberi's spreadsheet — `getSpreadsheetIdByFarmer` now throws for an unknown farmer or unset env var (covered in `api.test.js`). Keep that fail-loud behavior when moving to the registry.
Files: `shippingLabelsService.js`, `googleSheetsService.js`, `app.js`, `server.js`, `routes/sheetRoutes.js`, `Settings.vue`.

### 7 — Config-driven shipping-label template
**Problem:** `writeShippingDataToSheet` hardcodes cells (date B6, destination B8, count C24, data from row 11, id D7) and column order.
**How:** per-farmer/template `labelTemplate` config `{ idCell, dateCell, destinationCell, countCell, dataStartRow, rowsPerCert, columnMap }`; writer reads it; current values are the default template (identical behavior). Best done with/after task 4. Files: `shippingLabelsService.js`, template config in Firestore.

### 8 — Config-driven optional fields (generalize `gidon`)
**Problem:** `gidon` (column L) is a single-customer flag in `SheetModel` and `farmerConfigs: { "גבי צוברי": { allowGidon: true } }`.
**How:** `customFields: [{ key, label, type, column }]` on the farmer registry (task 6); table, intake form and model read the list. Incremental: keep `gidon` working, add the generic path, then migrate `gidon` onto it. Only do when a second customer needs a distinct field.
Files: `backend/models/sheetModel.js`, `googleSheetsService.js`, `frontend/src/data/data.js`, `PalletInput.vue`, `PalletTable.vue`.

### 36 — Naming cleanup
Pure rename, zero behavior change, `git mv`. Hard-gated on 6 and 20 (their deletions remove the accurately-named `create-sheet`/`delete-sheet` code); do before 9.

| Now | Proposed |
|---|---|
| `controllers/sheetController.js` (619 lines) | `recordController.js` |
| `routes/sheetRoutes.js` (records + shipping + destinations) | `apiRoutes.js` (open decision) |
| `models/sheetModel.js` / `SheetModel` | `models/palletRecord.js` / `PalletRecord`; drop dead `toArray()` |
| `services/googleSheetsService.js` | deleted by task 6 |

Gate: `cd backend && npm test` before and after, plus a manual intake → weight → destination smoke. Update `CLAUDE.md`, `docs/architecture.md`, `docs/api-reference.md` and this board in the same commit. Files: `backend/controllers|routes|models/`, `backend/app.js` requires, `docs/*.md`, `CLAUDE.md`.

## P2 backlog (one-liners)
- **9 PalletTable refactor** (~860 lines): extract `usePalletTableState` + `PalletTableToolbar.vue` + `PalletTableRow.vue`; start only after CRs 1/3/4 and 36 to avoid churn.
- **10 Pagination / virtual scroll:** server-side pagination or `useVirtualList`; counter "מציג 50 מתוך 347".
- **11 Season management:** Firestore `seasons`, close-season archive, season selector; replaces the manual `NEW_SEASON.md` ritual.
- **12 Daily backup:** Cloud Scheduler nightly export, now sourced from Firestore records; endpoints scaffolded (`/api/internal/backup`, see `backend/CLOUD_SCHEDULER.md`); admin "גיבויים" list.
- **13 Mobile audit:** 390px / 768px, collapse low-priority columns, ≥44px tap targets; add a Playwright project at the packhouse tablet's resolution (≤1366px uses the drawer layout, so tests must open the ☰ menu first).
- **24 Farmer-scoped roles:** `farmer` role linked to a farmer; `ensureOwnFarmerOrAdmin`; uses the task-6 `ownerEmails` link.
- **25 Soft-delete + restore** (audit-logged, admin "שחזר") — likely the biggest real gap. **26 Weight sanity checks** (per-box range / missing on send, via modal). **27 QR on pallet sticker** (pallet id; covers L3). **28 Pallet timeline view** from the audit trail (H3 base). **29 Global pallet/certificate search.** **30 Batch sticker printing + preview** (covers M2). **31 Stale-pallet nudges on Dashboard.** **32 Undo last bulk action** (30s toast). **33 Driver manifest PDF** per destination/truck.
- **17–19 platform layer:** parked until a confirmed second customer — see the reference doc.

### 34 — Frontend toolchain majors (before 9/10/13, after the CRs; not mid-season)
Two separate PRs, visual QA over every page. Files: `frontend/package.json` + lockfile, `vite.config.js`, `tailwind.config.js` → CSS `@theme`, PostCSS config.

| Upgrade | Risk | Notes |
|---|---|---|
| `vite` 5→8 + plugin-vue 6 (first) | Med-High | Node floors, browser targets, config changes; test `build` + `preview` |
| `tailwindcss` 3→4 | High | CSS-first config, `@import "tailwindcss"`, `@tailwindcss/postcss`, custom `mango`/`sidebar` palette must be re-expressed |

### 35 — Remaining major bumps (one PR each, anytime)
| Upgrade | Risk | Notes |
|---|---|---|
| `pdfmake` 0.2→0.3 | Med | vfs/build changes threaten the lazy-load `pdfMake.vfs = pdfFonts` pattern; QA sticker PDF |
| `vue-router` 4→5 | Med | Rewrite the `beforeEach` guard, test every redirect |
| `firebase` 11→12 · `firebase-admin` 13→14 | Low-Med | Check Cloud Run Node version first |
| `googleapis` 148→173 | Low-Med | Test the Sheets read/write path; also clears backend `uuid` audit findings |
| `dotenv` 16→17 | Low | Trivial |
