# Naming Cleanup (task 36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend files and symbols named after Google Sheets get names that say what they do, with zero behavior change.

**Architecture:** Pure `git mv` + symbol renames + dead-code removal. The only user-visible change: the intake form's unknown-farmer error maps the real backend message (`Unknown farmer: …`) instead of a dead Sheets-era string.

**Tech Stack:** Node/Express (CommonJS), Vue 3, Vitest, Playwright.

**Spec:** the task-36 card in `docs/redesign-plan.md` (pure rename, `git mv`, zero behavior change; gate `cd backend && npm test` before and after plus an intake → weight → destination smoke; update `CLAUDE.md`, `docs/architecture.md`, `docs/api-reference.md` and the board in the same change). Open decision on the card ("`apiRoutes.js` (open decision)") is ruled: `recordRoutes.js` — every route in it is a pallet-record operation (records, shipment prep, destinations), matching `recordController.js`.

## Global Constraints
- Branch `arch-redesign`; no push, deploy, or `main`. No GitHub CI.
- Dev-facing text English; UI text Hebrew.
- No behavior change except the PalletInput error mapping below. API paths, response shapes and log semantics stay identical (log prefixes may change wording only where they contain a renamed symbol).
- Do NOT rename `backend/services/SheetsCred.env.json` (secret file provided out-of-band to Cloud Run; renaming risks a broken deploy).
- Do NOT rename `frontend/src/utils/sheetName.js` (it is about Excel sheet names — accurate).
- Historical docs (`done.md` entries, `docs/superpowers/**`, `docs/redesign-reference.md`, `docs/multi-tenant-architecture.md`) are not rewritten.
- Gates: `cd backend && npm test` (baseline 141); `cd frontend && npm test` (28) `&& npm run build && npm run e2e` (26). Sequential.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus
1. A require path missed anywhere (scripts, tests, app.js lazy requires) → server boot or a route 500s; `git grep` must be empty for old names.
2. `certificateController.js` imports `assertKnownFarmer` from the controller — must follow the rename.
3. `app.js` uses the controller both as `require(...).invalidateKnownFarmersCache()` and via a `sheetController` variable — both renamed, no duplicate requires left.
4. Intake with an unknown farmer still shows a Hebrew message (now via the `Unknown farmer` mapping).
5. Docs still pointing at old filenames → future agents look for files that do not exist.

---

### Task 1: Rename controller, routes, model; drop dead code; update docs

**Files:**
- `git mv backend/controllers/sheetController.js backend/controllers/recordController.js`
- `git mv backend/routes/sheetRoutes.js backend/routes/recordRoutes.js`
- `git mv backend/models/sheetModel.js backend/models/palletRecord.js`
- Modify: `backend/app.js`, `backend/controllers/certificateController.js`, `backend/repositories/RecordRepository.js` (comment), `frontend/src/components/PalletInput.vue`, `CLAUDE.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/redesign-plan.md`, `README.md`, `done.md` (new entry only)

- [ ] **Step 1: Baseline** — `cd backend && npm test` → 141 passing. Record it.

- [ ] **Step 2: Model.** In `backend/models/palletRecord.js`: header comment `// palletRecord.js — pallet record model: required-field validation + normalization/boolean coercion before persistence.`; `class SheetModel` → `class PalletRecord`; delete the `toArray()` method (dead: Sheets row serialization); `module.exports = PalletRecord;`.

- [ ] **Step 3: Controller.** In `backend/controllers/recordController.js`: header comment `// recordController.js`; `const SheetModel = require("../models/sheetModel");` → `const PalletRecord = require("../models/palletRecord");`; `new SheetModel(` → `new PalletRecord(`; local variable `sheetRecord` → `palletRecord` (all occurrences); `class SheetController` → `class RecordController` and the corresponding `new SheetController()` / export line. Delete the two dead catch branches `if (error.message.includes("Invalid farmer sheet")) { return res.status(400)…; } else { … }` → keep only the 500 response body that was in the `else` (unwrap it). Keep exported helper names (`assertKnownFarmer`, `invalidateKnownFarmersCache`) unchanged.

- [ ] **Step 4: Routes.** In `backend/routes/recordRoutes.js`: header comment `// routes/recordRoutes.js — pallet-record endpoints under /api (records, shipment prep, destinations)`; `sheetController` → `recordController` (require path `../controllers/recordController`).

- [ ] **Step 5: Call sites.** `backend/app.js`: `const sheetRoutes = require("./routes/sheetRoutes");` → `const recordRoutes = require("./routes/recordRoutes");` and its use in the `/api` chain; every `require('./controllers/sheetController')` → `require('./controllers/recordController')`; the `sheetController` variable → `recordController` (all uses). `backend/controllers/certificateController.js`: `require('./sheetController')` → `require('./recordController')`. `backend/repositories/RecordRepository.js` comment: `sheetController.js` → `recordController.js`.

- [ ] **Step 6: Verify no old names remain.**
Run (repo root): `git grep -n "sheetController\|sheetRoutes\|sheetModel\|SheetModel\|SheetController\|sheetRecord\|Invalid farmer sheet" -- backend frontend/src CLAUDE.md docs/architecture.md docs/api-reference.md README.md .claude/skills`
Expected after Steps 7–8: no output.

- [ ] **Step 7: Frontend error mapping.** `frontend/src/components/PalletInput.vue`: replace `if (msg.includes('Invalid farmer sheet')) return 'שם החקלאי לא נמצא במערכת'` with `if (msg.startsWith('Unknown farmer')) return 'שם החקלאי לא נמצא במערכת'`.

- [ ] **Step 8: Docs.**
  - `CLAUDE.md`: delete the "**Minor dead code:** … `Invalid farmer sheet` …" Known-Issues bullet. Update any `sheetController`/`SheetModel` mention (Rules §1 says "When adding a record field, update `SheetModel`" → `PalletRecord` (`models/palletRecord.js`)).
  - `docs/architecture.md`: file map entries and the `### SheetModel` section → `recordRoutes.js`, `recordController.js`, `models/palletRecord.js` / `PalletRecord` (drop any `toArray` mention).
  - `docs/api-reference.md`: controller/handler column references → `recordController`.
  - `README.md`: also fix two stale auth lines found by the task-6 review: the Backend stack line listing "Passport.js Google OAuth" → "Firebase Auth (ID tokens, firebase-admin)"; the Security Note describing Passport/cookie sessions → Bearer Firebase ID tokens verified by `firebase-admin`, Firestore `users` collection for authorization. Keep it to the existing line count.
  - `docs/redesign-plan.md`: remove task 36 from "▶ Next up" (renumber), its ranked-table row, and its card; add 36 to the "shipped" list in the ranked-board heading; task 9's dependency on 36 is now satisfied (say "36 shipped" in its row/one-liner).
  - `done.md`: add at the top of "## October 2026 — Pre-season push": `### ✅ Task 36 — Naming cleanup` with 3 bullets (the renames; dead `toArray` + "Invalid farmer sheet" branches removed and PalletInput now maps `Unknown farmer`; `SheetsCred.env.json` and `utils/sheetName.js` deliberately kept, with why).

- [ ] **Step 9: Gates.** `cd backend && npm test` (141, same as baseline); `cd frontend && npm test && npm run build && npm run e2e` (28 / OK / 26 — intake → weight → destination is covered by `season-flow.spec.js`).

- [ ] **Step 10: Commit** (one commit; `git mv` keeps history):
```bash
git add -A backend frontend/src CLAUDE.md docs/architecture.md docs/api-reference.md docs/redesign-plan.md README.md done.md
git commit -m "refactor(task-36): rename Sheets-named record controller/routes/model; drop dead Sheets code"
```
