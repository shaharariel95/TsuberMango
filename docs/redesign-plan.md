# TsuberMango — Active Task Board
Source of truth for agents (the old `redesign-plan.html` is a frozen human snapshot — do not edit it). Task numbers are canonical: use `#` in commits and `done.md`.
Rationale, history, shipped task cards and the platform vision: [redesign-reference.md](redesign-reference.md). Shipped work: `../done.md`.

## Working agreement
1. **One task number per session.** No "while I'm here" work on other tasks; on a real dependency, stop and report.
2. Read `CLAUDE.md` for architecture; this board's file references win where they conflict.
3. Ambiguous spec: lock it first with `superpowers:brainstorming`. Small well-specified tasks (e.g. 2): restate the spec, then proceed.
4. TDD where logic is testable. Verification = `cd backend && npm test` + `cd frontend && npm run e2e` (see the `local-dev` skill). No GitHub CI, ever (public repo — owner decision).
5. UI text is Hebrew/RTL; all dev-facing text (commits, docs, comments, logs) is English.
6. Respect the layout contracts in `CLAUDE.md` (PalletTable `h-full`, pdfmake lazy-load, boolean coercion for `sent`/`gidon`/`mark`).
7. Touch only the files listed under the task unless you find a real dependency — call it out.
8. When done **and verified** (tests/app actually run), append an entry to `done.md` and remove the task from this board.

## ▶ Next up after task 20 (owner-confirmed order, 2026-10-09) — pre-season, season ≈ early Dec 2026
1. **Pre-season ops:** verify the nightly backup actually runs (task 12 scope check), follow `NEW_SEASON.md`, clear pre-season test data with `scripts/clearSeason.js` (see `NEW_SEASON.md` §4) (**including `centers/tsuberi/certificates/**`, and BEFORE seeding** — never delete `farmers/{name}` docs afterwards, they hold `certificateProfile`), run `seedCertificateProfiles.js` + enter Avner/Idan/Kopler profiles, then check all 7 farmers in Settings (names must match config exactly); remove `SPREADSHEET_ID` from Cloud Run; after seeding, delete `scripts/seedCertificateProfiles.js` and the `googleapis` dependency. Printer check = Settings → פרטי תעודה → תצוגה מקדימה, NOT a real issue (it consumes a real number).
2. **Deploy → farmer verification → merge `arch-redesign` to `main`.**
3. Then P2 nice-to-haves (25 soft-delete shipped), and the fridge layout last.

## Ranked board (open tasks; shipped 0, 0.1, 1, 4, 6, 15+16, 20, 23, 25, 36 are in the reference doc / `done.md`)
Task 14 (session-expiry warning) is obsolete. Task 22: local half DONE 2026-10-08 (`api.test.js` + Playwright e2e); CI half DROPPED. Optional leftover: frontend unit tests for `PalletInput` / `PalletTable` filter+sort.

| # | Task | Priority | Effort | Depends on |
|---|---|---|---|---|
| 7 | Shipping-certificate table layout (only if a customer needs a different one) | P2 | 1–2d | 6 (shipped) |
| 8 | Config-driven optional fields (generalize `gidon`) | P1 | 3–4d | 6 (shipped; builds on `config/global.farmers` entries `{name, allowGidon, archived?}`, not per-farmer registry docs) |
| 34 | Frontend toolchain majors (Vite 8, then Tailwind 4) | P2 | 4–6d | after CRs, before 9 |
| 9 | PalletTable refactor | P2 | 2–3d | after 1/3 land (36 shipped) |
| 10 | Pagination / virtual scrolling | P2 | 2–3d | 9 |
| 11 | Season management & archival | P2 | 5–7d | 6 (shipped; builds on `config/global.farmers` entries, not per-farmer registry docs) |
| 12 | Automatic daily backup (Cloud Scheduler) | P2 | 2–3d | — |
| 13 | Mobile responsiveness audit | P2 | 2–3d | 9 |
| 24 | Farmer-scoped roles & access | P2 | 4–5d | 6 (shipped; builds on `config/global.farmers` entries, not per-farmer registry docs) |
| 25–33 | Feature ideas (below) | P2 | 0.5–2d each | — |
| 35 | Remaining major bumps (maintenance) | P2 | 3–5d spread | anytime |
| 17–19 | Schema / forms / tenant platform layer | P3 | — | parked, see reference |
| — | Fridge layout (new feature; branch `feature/fridge-layout`, 2 unmerged commits from 2026-05-20) | last | ? | everything else; parked until then |

## Open decisions / blockers
- **Tasks 20 and 4: shipped** (certificates in Firestore, auto-split into ≤13-row certificates by pallet group) — see `done.md`. Not blockers any more.
- **Season start:** ~2 months out (≈ early Dec 2026, as of 2026-10-08). Everything needed for intake → certificate must be done and farmer-verified before then.
- **Device:** the packhouse uses one Samsung Galaxy Tab (model TBD) in landscape; may grow to more devices. Playwright runs a `tablet` project at 1280×800 alongside `desktop`.

## Task cards

### 7 — Shipping-certificate table layout
Header lines per farmer were delivered by task 20. Remaining scope: only if a customer needs a different table layout (columns/rows per certificate); the layout lives in `frontend/src/data/certificatePdf.js` and `certificateCore.js` (`MAX_ROWS`).

### 8 — Config-driven optional fields (generalize `gidon`)
**Problem:** `gidon` (column L) is a single-customer flag in `PalletRecord` and `farmerConfigs: { "גבי צוברי": { allowGidon: true } }`.
**How:** `customFields: [{ key, label, type, column }]` on the farmer registry (task 6, shipped: `config/global.farmers` entries); table, intake form and model read the list. Incremental: keep `gidon` working, add the generic path, then migrate `gidon` onto it. Only do when a second customer needs a distinct field.
Files: `backend/models/palletRecord.js`, `frontend/src/data/data.js`, `PalletInput.vue`, `PalletTable.vue`.

## P2 backlog (one-liners)
- **9 PalletTable refactor** (~860 lines): extract `usePalletTableState` + `PalletTableToolbar.vue` + `PalletTableRow.vue`; start only after CRs 1/3/4 (36 shipped) to avoid churn.
- **10 Pagination / virtual scroll:** server-side pagination or `useVirtualList`; counter "מציג 50 מתוך 347".
- **11 Season management:** Firestore `seasons`, close-season archive, season selector; replaces the manual `NEW_SEASON.md` ritual.
- **12 Daily backup:** Cloud Scheduler nightly export, now sourced from Firestore records; endpoints scaffolded (`/api/internal/backup`, see `backend/CLOUD_SCHEDULER.md`); admin "גיבויים" list.
- **13 Mobile audit:** 390px / 768px, collapse low-priority columns, ≥44px tap targets; add a Playwright project at the packhouse tablet's resolution (≤1366px uses the drawer layout, so tests must open the ☰ menu first).
- **24 Farmer-scoped roles:** `farmer` role linked to a farmer; `ensureOwnFarmerOrAdmin`; builds on the shipped task-6 `config/global.farmers` entries (an `ownerEmails` link would be added there).
- **26 Weight sanity checks** (per-box range / missing on send, via modal). **27 QR on pallet sticker** (pallet id; covers L3). **28 Pallet timeline view** from the audit trail (H3 base). **29 Global pallet/certificate search.** **30 Batch sticker printing + preview** (covers M2). **31 Stale-pallet nudges on Dashboard.** **32 Undo last bulk action** (30s toast). **33 Driver manifest PDF** per destination/truck.
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
