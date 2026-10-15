# Fridge layout — live cold-room map

**Status:** approved design, 2026-10-15. Board: the "Fridge layout" row in `docs/redesign-plan.md`
(proposed task number 37). Prototype: branch `feature/fridge-layout` (2026-05-20, Sheets era) — a
picture of the vision only; nothing is merged or cherry-picked from it.

## Goal
Packhouse staff see, on the tablet, where every pallet in the cold room sits, place / move / clear
pallets with a tap, and see how full the room is. Several devices can use the map at once without
overwriting each other, and the map always reflects the pallets' live state (sent, deleted, marked,
missing weight) without copying pallet data.

## Owner decisions
- **One room, fixed 5×8 grid** (columns A–E, rows 1–8 = 40 slots). No stacking, every slot usable,
  one pallet per slot. The aisle is the "9th row" — drawn on the map, not a slot. Gaps in a row are
  normal. **No layout editing** in Settings (a later feature if needed). A second room may come by
  June 2027, so the data path carries a room id (`main`); there is no multi-room UI.
- **Placement is its own step**, done on the fridge page (sometimes at the end of an intake day; not
  every pallet goes into the fridge — same-day shipments skip it). No intake integration.
- **Device:** the packhouse Galaxy Tab, landscape (1280×800). Tap interactions.
- **No camera scanning in v1.** Search by farmer + pallet number. Does not depend on task 27.
- **Lifecycle:** a *marked* pallet stays in its slot with a badge. A *sent / certificated* or
  *soft-deleted* pallet also stays, and the slot is flagged until someone clears it manually. Record
  writes never touch the fridge.
- **History:** a per-room move log in Firestore, written in the same transaction as each change,
  included in backups. No UI in v1.
- **Timing:** nice-to-have for the 2027 season (May–July); not part of the April dry run; may ship
  mid-season. Keep v1 thin.

## Identity
A physical pallet is **(farmer, palletNumber)** — the same rule the app already uses for mixed pallets
(several records sharing one pallet number). A slot stores that pair, never record data. If a placed
pallet is renumbered, its slot shows "לא נמצא" until cleared or re-placed (no coupling from the
record-update path into the fridge).

## 1. Data and backend

### Firestore
```
centers/{c}/fridge/{roomId}            roomId = 'main' (only room in v1)
  cells: { A1: { farmer, palletNumber, placedBy, placedAt }, ... }   empty slot = no key
  updatedAt, updatedBy
  log/{autoId}   { op: 'place'|'move'|'clear', farmer, palletNumber, from, to, by, at }
```
The room doc is created on first write; reading a missing doc returns empty cells. `from` is null for
`place`, `to` is null for `clear`.

### Units
- **`services/fridgeCore.js`** — pure, no I/O.
  - `ROOMS = { main: { cols: ['A','B','C','D','E'], rows: 8 } }`; `isValidSlot(roomId, slotId)`.
  - `applyOp(cells, op, { actor, at })` → `{ cells, logEntry }` or throws `FridgeError(status, code, details)`:
    - `place {slot, farmer, palletNumber}` — slot valid (`BAD_SLOT` 400) and empty (`SLOT_TAKEN` 409);
      the pallet is not already in another slot (`ALREADY_PLACED` 409, details carry that slot).
    - `move {from, to}` — both valid; `from` occupied (`SLOT_EMPTY` 409); `to` empty (`SLOT_TAKEN` 409).
      `from === to` → 400. No swaps in v1.
    - `clear {slot}` — slot valid and occupied (`SLOT_EMPTY` 409).
    - Unknown op → 400 `BAD_OP`.
- **`repositories/FirestoreFridgeRepository.js`**, exported as `require('../repositories').fridge`
  (constructor takes an injectable `db`, like the other repositories).
  - `getRoom(roomId)` → `{ cells, updatedAt, updatedBy }`.
  - `applyOp(roomId, op, actor)` — one `runTransaction`: read the room doc, `fridgeCore.applyOp`, write
    the doc and a new `log` doc. Concurrent operations serialize here; the loser gets the 409.
  - `clearFarmer(roomId, farmer)` — transaction removing that farmer's cells (used by season reset).
- **`controllers/fridgeController.js`** + **`routes/fridgeRoutes.js`**, mounted under
  `verifyFirebaseToken` + `ensureCenterAccess`. Any center user may use it (not admin-only).
  `logger.info` on every successful operation (op, slot(s), farmer, pallet, actor) and `logger.error`
  on failures. Unknown `roomId` → 404. `FridgeError` → its status with a Hebrew message:

  | code | message |
  |---|---|
  | `SLOT_TAKEN` | התא תפוס |
  | `ALREADY_PLACED` | המשטח כבר במקרר בתא {slot} |
  | `SLOT_EMPTY` | התא ריק |
  | `NOT_FOUND` | המשטח לא נמצא |
  | `ALREADY_SENT` | המשטח כבר נשלח |
  | `BAD_SLOT` / `BAD_OP` | בקשה לא תקינה |

### API

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/fridge/:roomId` | `{ cells, updatedAt, updatedBy, pallets }`. `pallets` is keyed `${farmer}__${palletNumber}` and resolved live through `RecordRepository`: one `getRecords(farmer, { includeDeleted: true })` per distinct farmer on the map (the deleted ones tell deleted from renumbered). |
| POST | `/api/fridge/:roomId/ops` | Body `{op:'place', slot, farmer, palletNumber}` \| `{op:'move', from, to}` \| `{op:'clear', slot}`. Returns the same shape as GET. |

**Pallet summary:** `{ kinds[], sizes[], boxes, weightMissing, mark, hasCertificate, status }`, where
`status` is
- `ok` — at least one live record, none sent;
- `partly_sent` — some live records sent, not all;
- `sent` — every live record sent;
- `deleted` — no live records, but soft-deleted records with that number exist;
- `missing` — neither (typically renumbered after placing). Archiving a farmer keeps its records, so
  its pallets resolve normally.

`boxes` sums over the live records; `weightMissing` is true when any live record has no weight; `mark`
is true when any is marked; `hasCertificate` when any has a `cardId`.

**Place validation** (before the transaction — eligibility, not the concurrency guard):
`assertKnownFarmer(farmer)`; `getRecordsByPallet(farmer, palletNumber)` is non-empty (`NOT_FOUND` 404);
not every record is sent (`ALREADY_SENT` 409). Marked pallets may be placed.

**Realtime:** fridge writes emit nothing to `farmer_events` (no record changed). The room doc itself is
the live channel (see §2). Record writes keep emitting exactly as today.

## 2. Frontend

Route `/Fridge` (PascalCase like the other routes), `meta: { requiresAuth }`, menu entry "מקרר". Layout for 1280×800 landscape (the drawer
layout):

```
┌──────────────────────────────────────────────┬─────────────────────┐
│  map: columns A–E × rows 1–8                 │  place panel        │
│  [A1][B1][C1][D1][E1]                        │  farmer ▾ + search  │
│   ...                                        │  pallet list        │
│  [A8][B8][C8][D8][E8]                        │─────────────────────│
│  ════════ מעבר (aisle, not slots) ════════   │  capacity  31/40    │
│                                              │  per-farmer counts  │
└──────────────────────────────────────────────┴─────────────────────┘
```
(RTL mirrors it.)

**Slot:** farmer (per-farmer tint), pallet number, kinds/sizes, boxes. Badges: amber `סומן למשלוח`,
`חסר משקל`; red `נשלח`, `נשלח חלקית`, `נמחק`, `לא נמצא` — red slots show a "פנה תא" action.

**Interactions** (tap only; no drag-and-drop, sounds or camera):
1. **Place:** choose a farmer, search by pallet number. The list shows that farmer's pallets that are
   not deleted, not fully sent, and not already on the map; a mixed pallet is one entry; marked
   pallets are included. Source: the existing `GET /api/farmers/:farmer/records`. Tap a pallet, then an
   empty slot. A banner shows the selection with "ביטול".
2. **Tap an occupied slot:** a sheet with the pallet's details and **העבר** (then tap the target slot)
   and **פנה תא** (confirmed through `requestConfirm` from `composables/useDialogs`).
3. **Errors:** a 409 or network failure shows a Hebrew corner toast (`useNotification().notify(msg, 'error')`) and the map re-reads the server state.
   No offline / localStorage fallback — the server is the source of truth.

**Live data:** `useFridgeRoom(roomId)`:
- `onSnapshot` on `centers/{c}/fridge/{roomId}` → `cells` (live on every device);
- when the set of pallets on the map changes, or a `farmer_events/{farmer}` doc changes for any farmer
  on the map, re-run `GET /api/fridge/main` (debounced) to refresh the summaries — a pallet sent on
  another screen turns red without a reload;
- after this device's own operation, apply the POST response at once; the following identical snapshot
  is harmless, so no echo suppression is needed.

**Capacity:** occupied / 40 with green < 50 %, amber < 85 %, red otherwise; pallets per farmer.

| File | Role |
|---|---|
| `components/FridgeLayout.vue` | Page; `h-full` root; wires panel + grid |
| `components/fridge/FridgeGrid.vue`, `FridgeSlot.vue` | Map and one slot |
| `components/fridge/FridgePlacePanel.vue`, `FridgeStats.vue` | Pallet picking; capacity + per-farmer counts |
| `api/fridge.js` | `getRoom`, `postOp` |
| `composables/useFridgeRoom.js` | Listeners + refetch |
| `utils/fridgeView.js` | Pure: eligible-pallets filter, stats, farmer colours |

Reuses `LoadingState`, `ErrorState`, `useDialogs` and `useNotification`. Tailwind only; Hebrew UI.

## 3. Rules, backup, restore, season reset

**Firestore rules** (`frontend/firestore.rules`) — one read-only match; `log` stays default-deny; all
writes stay Admin-SDK-only:
```
match /centers/{centerId}/fridge/{roomId} {
  allow read: if request.auth != null && centerId in request.auth.token.centers;
}
```

**Backup** (`backupService.buildBackupPayload`): adds `fridge: { [roomId]: { doc, log: [{id, ...}] } }`.
The payload stays version 2; the section is optional, so older backups without it remain valid.

**Restore** (`backupRestore`, CLI `scripts/restoreBackup.js`): the fridge is restored only with
`withFridge` / `--with-fridge` (mirrors `withConfig`) and never in a `--farmer` restore. An existing
room doc with non-empty `cells` is a blocker (like existing records); an empty or missing one is
written. Log entries keep their ids; a non-empty target log is a blocker (the same rule as audit). The dry run reports the counts.

**Season reset** (`seasonReset`): a full reset `recursiveDelete`s `centers/{c}/fridge` and reports
`fridgeCells` / `fridgeLog` in the summary. `--farmer X` removes only X's cells (one transaction per
room via `clearFarmer`) and leaves the log. `NEW_SEASON.md` updated.

## 4. Testing
- **Backend unit (Vitest):** `fridgeCore` — every op, every error code, slot validation.
- **Backend API (Vitest on the emulators):** place / move / clear happy paths; 401 without a token and
  403 without the center claim; `SLOT_TAKEN` and `ALREADY_PLACED`; **two concurrent places into one
  slot → exactly one succeeds**; **one pallet placed into two slots concurrently → exactly one
  succeeds**; each log op is written; summary `status` after send, partial send, soft delete, renumber;
  place refused for unknown farmer, missing pallet, fully sent pallet.
- **Rules (`firestore.rules.test.js`):** room doc readable with the center claim, denied without it or
  for another center; `log` denied; client writes denied.
- **Backup / restore / reset:** payload contains the fridge; restore dry run, execute, blockers,
  `--farmer` skips it; reset full and per-farmer.
- **Frontend unit:** `fridgeView` — eligible filter (deleted, sent, placed excluded; mixed counted
  once; marked included), stats and thresholds.
- **Playwright** (`desktop` + `tablet` 1280×800): place → move → clear; a second browser context sees
  the placement live; a pallet marked sent through the API turns its slot red with "פנה תא".

## 5. Docs and rollout
- Update `docs/architecture.md` (Firestore tree, files), `docs/api-reference.md` (endpoints, route),
  `docs/realtime.md` (room listener + farmer-events refetch), `NEW_SEASON.md`, and the board row.
- **Deploy order:** Firestore rules → backend → frontend (the `deploy` skill; only when the owner asks).
- `feature/fridge-layout` stays untouched as the prototype; its PalletTable mobile-card and `App.vue`
  scrolling changes belong to task 13, and `sheets_optimization_strategy.md` is obsolete.

## Out of scope (v1)
Layout editing in Settings; more than one room in the UI; drag-and-drop; camera / QR scanning; slot
swaps; a log viewer; sounds; automatically freeing slots on send / delete.
