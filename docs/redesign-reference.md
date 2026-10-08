# TsuberMango — Redesign Reference (archive)

Rationale, history, shipped task cards, and the platform vision. **Not needed to execute a task** — the active board is [redesign-plan.md](redesign-plan.md); shipped work is logged in `../done.md`. Split out of the old plan on 2026-10-08; content below is unchanged except light tidy. References to `redesign-plan.html` mean the frozen human snapshot.

---

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

## Obsolete / dropped tasks

- **14 — Session expiry warning (M1): obsolete.** Task 23 (Firebase Auth) shipped; ID tokens auto-refresh, so the session-expiry gap it would patch no longer exists. Original idea: on 401 set `sessionExpired` in `sessionStorage` and show a Hebrew banner on Login.
- **22 — CI half dropped (owner decision, 2026-10-08):** the repo is public and nothing but code is connected to it, so there is no GitHub Actions CI, ever. The local half shipped as `backend/tests/api.test.js` + Playwright e2e (see `done.md`, October 2026).

---

## DONE task cards (history)

## P0★ — Top priority: get off Google Sheets (decided 2026-07-13)

See the "Priority decision" section above for the full rationale. This block executes **before** the customer CRs below.

> **✅ DONE 2026-07-13 — cutover verified live on Firestore.** See `done.md` for the shipped summary. Records, audit, config, users, and farmer_events all live under `centers/tsuberi/…`; write-path farmer validation added; interim Firestore rules deployed (`frontend/firestore.rules`). **Residuals still on Sheets (by design):** `googleSheetsService.js` is retained for farmer provisioning (`create-sheet`/`delete-sheet`), `refresh-cache`, and startup cache-warming → **task 6** removes it; shipping labels → **task 20**. Firestore-rule lockdown → **task 23** (✅ shipped 2026-07-26); real per-subdomain centerId resolution is still open. The rest of this block is kept as historical detail.
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

> **✅ DONE — shipped to production 2026-07-26.** See `done.md` for the full shipped summary and the cutover log. Client reads of `config`/`farmer_events` are now authed + center-matched (`request.auth != null && centerId in request.auth.token.centers`), replacing the old `read: if true`; the ruleset released `2026-07-26T20:54:44Z` was verified byte-identical to `frontend/firestore.rules`.
>
> **Two things the cutover proved that the plan had wrong:**
> 1. **`backfillAuthClaims.js` was a structural no-op.** Production Firebase Auth had zero user records (Passport never created any), so there was nothing to backfill. Claims self-heal at first login instead — `/api/auth/me` is mounted *above* the `ensureCenterAccess` guard so a claimless token still reaches it. Every user, including ones added months from now, works with no manual step.
> 2. **Rules must be deployed LAST, not first.** The checklist's "rules after the backfill" order rested on a safety that never existed, and deploying rules early would have broken the live Passport frontend. Correct order: backend → frontend → rules. The new frontend works fine on the old permissive rules, so the rules flip becomes an independently reversible final step.
>
> **One deviation from the original spec below:** `centerId` stays env-resolved (`CENTER_ID`, constant `'tsuberi'`) rather than derived from the subdomain — the `centers` custom claim gates which centers a user *may* read/access (claim-guarded), but it does not perform hostname→tenant resolution. Subdomain resolution remains open/deferred (see task 24 and the P3 block). The rest of this card is kept as the original spec for history.

**Pulled in alongside 16** (2026-07-13 decision — not left parked). Firestore rules leave `config` and `farmer_events` `read: if true` — world-readable. Fine for one customer, a real leak the moment there's a second tenant. Cookie-based sessions are why `request.auth` is null client-side today, which forced the open rules.

Execute the Firebase Auth migration already designed in `firebaseSession.html` (Passport/express-session → Firebase ID tokens, `verifyFirebaseToken` middleware, `onAuthStateChanged` router guard). With real `request.auth`, tighten Firestore rules to per-tenant/per-user reads. Resolve the center from the subdomain at login and stamp it as a Firebase Auth custom claim; middleware and Firestore rules both read the claim.

Files: per `firebaseSession.html` — `server.js`, auth middleware, `Login.vue`, router guard, `App.vue`, `firestore.rules`.


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

---

## Backlog items consciously parked (not dropped silently)

- **H2 — PWA + offline entry queue** (`docs/pwa-requirements.md`): big bet, real value for spotty packhouse WiFi. Parked until after the DB move — the Firestore decision *strengthens* it: the Firestore SDK's built-in offline persistence + queued writes replaces most of the hand-rolled IndexedDB queue that doc specs. Re-scope down after task 16.
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
