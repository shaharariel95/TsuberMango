# Firestore records layer — design spec

**Date:** 2026-07-13
**Tasks:** redesign board 15 + 16 (merged), full Phase 1 namespacing
**Branch:** `arch-redesign`
**Status:** approved design, pre-implementation

---

## 1. Summary

Move the mango pallet **records** off Google Sheets and onto Firestore, behind a
storage-agnostic `RecordRepository` interface. This merges the original tasks 15
(repository interface) and 16 (Firestore records store) into one workstream,
because the fresh-start decision (2026-07-13) removes the reason to build a
throwaway `SheetsRepository`: the app never runs another Google Sheets season, so
Firestore becomes the first and only implementation.

Per the approved scope, this task also performs the **full Phase 1 namespacing**:
all tenant data moves under `centers/tsuberi/…`, not just records.

At the end of this task, `googleSheetsService.js` is deleted and the app's record
read/write path, real-time events, config, and user authorization all read from
`centers/tsuberi/…` in Firestore.

**Effort:** ~1–1.5 weeks (full namespacing + frontend path rewrites +
auth-adjacent user-lookup changes bring this back up from the ~3–5d a
records-only standup would have been).

---

## 2. Goals / non-goals

**Goals**
- Define `RecordRepository` as a storage-agnostic contract anchored to controller
  needs, so the parked Postgres swap stays mechanical (per the binding Firestore
  DB decision).
- Implement `FirestoreRepository` as the only implementation.
- Namespace all tenant data under `centers/tsuberi/…` (records, audit, config,
  users, farmer_events).
- Rewire every consumer (backend controllers/services, frontend paths) off
  `googleSheetsService` and off the old top-level Firestore paths.
- Delete `googleSheetsService.js` and the old top-level `config/global` + `users`
  docs after a verified cutover.

**Non-goals (explicitly deferred)**
- **Real centerId resolution** (per-subdomain / Firebase Auth custom claims) →
  task 23. This task uses a hardcoded `'tsuberi'` constant.
- **Firestore security-rules lockdown** → task 23.
- **Farmer provisioning rewrite** (`addSheet` / `deleteSheet` admin endpoints) →
  task 6 (farmer registry). Left vestigial here.
- **Shipping labels off Sheets** → task 20 (the second Sheets tentacle).
- **Full Vitest + CI harness** → task 22. This task lays a minimal emulator-based
  test down-payment only.
- **Schema-as-data / generic record types** → task 17. `SheetModel` stays.

---

## 3. Key decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| SheetsRepository | **Skip it** | Fresh-start = no more Sheets seasons; wrapper is throwaway. |
| 15/16 boundary | **Merge** into one task | Interface anchored to controller needs; Firestore is first + only impl. |
| Namespacing scope | **Full Phase 1** | Move records+audit AND config, users, farmer_events under `centers/tsuberi/`. |
| Record IDs | **Firestore auto-IDs (strings)** | Simplest write path, no counter/transaction hotspot. `id` becomes an opaque string. |
| centerId | **Constant `'tsuberi'`**, surfaced via `/api/auth/me` | Real resolution is task 23's job. |
| Records cache | **Dropped** | Firestore is fast at ~1,500 docs; removes invalidation/coalescing complexity. |
| Farmer provisioning | **Deferred to task 6** | `addSheet`/`deleteSheet` become vestigial; safe off-season. |
| Tests | **Minimal Vitest + Firestore emulator** | Down-payment on task 22, covering the repo's read/write/bulk paths. |

---

## 4. Interface + injection seam

### `backend/repositories/RecordRepository.js`
Abstract contract (throw-on-call base methods, or JSDoc-typed abstract class).
Anchored to what `sheetController.js` and `backupService.js` actually call —
**not** to Firestore mechanics:

```
getRecords(farmer)                      -> Record[]
getRecordsByPallet(farmer, palletNo)    -> Record[]
getLastPallet(farmer)                   -> highest palletNumber (or 0)
appendRecord(farmer, record)            -> { id, ...record }
updateRecord(farmer, id, record)        -> updated record
updateRecords(farmer, ids, records)     -> { success, message } batch result
updateSentStatus(farmer, ids, value)    -> bulk single-field write
updateMarkStatus(farmer, ids, value)    -> bulk single-field write
appendAuditLog(farmer, entry)           -> Promise (fire-and-forget by caller)
```

Notes:
- `getLastPallet` is by **palletNumber** (not id) — unchanged semantics from today.
- `updateSentStatus` / `updateMarkStatus` are kept as two explicit named methods
  (mirroring today's `updateSentStatusForPallets` /
  `updateSendToDestinationPallets`) rather than one generic `bulkUpdateField`,
  because the controller + real-time events treat `sent` and `mark` distinctly.

### `backend/repositories/index.js`
Selects and exports the singleton implementation. `sheetController.js` and
`backupService.js` `require('../repositories')` instead of the Sheets service.
Future impls (Firestore today, Postgres if a trigger fires) swap here only.

### `SheetModel` stays
The controller still constructs a `SheetModel` for required-field validation and
boolean coercion (`sent`/`gidon`/`mark`), but passes the **object** to the repo.
`toArray()` is no longer used on the Firestore write path (records are stored as
objects). `toArray()` may remain on the model for now; remove if unreferenced
after the cutover.

---

## 5. Firestore data model

```
centers/tsuberi/
  config (doc)              <- one-time copy from top-level config/global
  users/{email}            role, ...   <- one-time copy from top-level users/*
  farmers/{farmer}/
    records/{autoId}        id = doc.id (string),
                            shipmentDate, cardId, harvestDate, palletNumber,
                            kind, size, boxes, weight, destination,
                            sent, gidon, mark, editedBy, editedAt
    audit/{autoId}          recordId, palletNumber, action, editedBy, editedAt
  farmer_events/{farmer}    real-time delta doc, overwritten per write
```

- **records / audit:** fresh — start empty, no import. Auto-string IDs.
- **Record document shape:** the named-field object today produced by
  `getAllRecords`'s row mapping (columns B–O), plus `id`. Booleans stored as real
  booleans (no more `'TRUE'` string coercion). Dates written as canonical ISO
  `yyyy-mm-dd` from day one (see §8).
- **config + users:** small one-time **copy** to the new path via a committed seed
  script. Old top-level docs remain until cutover is verified, then deleted.
- **farmer_events:** no data move (ephemeral). Writer + subscriber repoint to the
  namespaced path.
- **sessions:** unchanged — stays top-level (`firestore-store`); not tenant data
  per the plan tree.

---

## 6. Consumers rewired

### Backend
- **`controllers/sheetController.js`** — `require` the repo instead of
  `googleSheetsService`; pass `SheetModel` objects (drop `toArray()`); remove
  `parseInt(id)` in `updateRecord` (ids are strings now); keep the
  audit + `firestoreEventService` emit calls as-is (fire-and-forget). Revisit the
  `error.message.includes("Invalid farmer sheet")` mapping — replace with a
  storage-neutral error from the repo (see §7).
- **`services/backupService.js`** — read via `repo.getRecords(farmer)` (the
  backup source becomes Firestore, per plan task 12 note).
- **`services/firestoreEventService.js`** — write events to
  `centers/tsuberi/farmer_events/{farmer}` (centerId-aware path).
- **`server.js`** — OAuth callback + `seedUsersIfEmpty()` user lookup reads
  `centers/tsuberi/users/{email}`; add `centerId` to the `/api/auth/me` response;
  `POST /api/admin/refresh-cache` simplifies (records cache gone).

### Frontend
- **`App.vue`** + **`Settings.vue`** — `config` `onSnapshot` path →
  `centers/tsuberi/config`. centerId comes from `/api/auth/me`.
- **`composables/useFarmerEvents.js`** — subscribe to
  `centers/tsuberi/farmer_events/{farmer}`.
- **id-as-string audit** — grep the frontend for numeric assumptions on `id`
  (`parseInt`, `Number(...)`, `=== <number>`), especially the event-matching in
  `useFarmerEvents` and any row `:key`. Ensure `id` is treated as an opaque string
  everywhere.

---

## 7. Validation, errors, caching

- **Farmer validation:** replace `validateSheetName` (Sheets metadata call) with a
  check against the known farmer set (from `config.farmers` / `farmerConfigs`).
  Throw a storage-neutral error (e.g. `UnknownFarmerError` or a message like
  `"Unknown farmer: X"`); update the controller's error mapping to match (it
  currently keys on the Sheets-specific `"Invalid farmer sheet"` string).
- **Caching:** the in-memory records cache, coalescing (`activeRecordFetches`),
  and per-farmer append-lock are all **removed** — Firestore reads are fast and
  atomic writes need no in-process lock. `cachedSheetNames` /
  `cachedAuditSheetExists` disappear with the Sheets service.
- **Booleans:** stored/read as real Firestore booleans; the `== 'TRUE'` coercion
  in the old row mapper is gone. `SheetModel`'s `!!` coercion on input remains.

---

## 8. Dates

Write `harvestDate` / `shipmentDate` as canonical ISO `yyyy-mm-dd` from the first
record — no legacy formats to normalize (this is all that remains of ex-task 21).
**`Dashboard.vue`'s "פעילות היום" comparison** compares `dd/mm` today; update it to
compare ISO, or it silently re-breaks once the store is ISO. A
`frontend/src/utils/dates.js` formatting helper centralizes this.

---

## 9. Testing

Task 22 (full Vitest + CI) does not exist yet. This task lays a **minimal
down-payment**:
- Vitest configured for the backend.
- `FirestoreRepository` tested against the **Firestore emulator**: append → read
  round-trip, `getRecordsByPallet`, `getLastPallet`, single + batch update,
  `updateSentStatus` / `updateMarkStatus` bulk writes, and unknown-farmer error.
- Not in scope: CI wiring, frontend component tests, controller tests — those land
  with task 22.

---

## 10. Cutover sequence

All on `arch-redesign`; nothing touches production.

1. Land the interface, `FirestoreRepository`, seed script, and consumer rewires.
   There is no dual-run flip: controllers import `repositories/index.js`, which
   exports the Firestore impl directly. Consumers stop importing
   `googleSheetsService` in the same change set.
2. Run the config/users seed (copy top-level → `centers/tsuberi/`).
3. Smoke-test: login/session, create a pallet, read it back, real-time flash on a
   second client, an update, a bulk sent/mark toggle, a backup run.
4. Delete `googleSheetsService.js`, the old top-level `config/global` + `users`
   docs, and any now-dead env/config for the Sheets records path
   (`SPREADSHEET_ID` stays only if shipping labels still need it until task 20).
5. Update `CLAUDE.md` (data-store section, caching section, real-time paths) and
   the redesign plan docs (mark 15+16 merged/done).

---

## 11. Open follow-ups flagged (not in this task)

- **Task 6** must rewrite `addSheet`/`deleteSheet` to provision a Firestore
  `farmers/{farmer}` doc instead of a Google Sheet.
- **Task 23** replaces the constant centerId with real resolution and locks down
  Firestore rules (records are now world-readable-ish until then — same posture as
  today's `config`/`farmer_events`, not worse).
- **Task 20** removes the remaining Sheets dependency (shipping labels) and
  `SHIPPING_LABELS_ID_*` env vars.
