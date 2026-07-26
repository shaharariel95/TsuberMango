# Real-Time Updates

After every backend write, `firestoreEventService.js` writes an event document to
`centers/{centerId}/farmer_events/{farmerName}` in Firestore (fire-and-forget — never blocks the
HTTP response). All connected clients hold an `onSnapshot` listener via `useFarmerEvents.js`. When
the document changes, the composable applies the delta to the caller's `pallets` ref in-place and
flashes affected rows yellow for 3 seconds.

**Why Firestore instead of WebSockets:** Cloud Run scales to 0. Open WebSocket connections keep the
instance alive and billed. Firestore's SDK manages all connection infrastructure externally — Cloud
Run is only woken by actual HTTP requests.

---

## Event Types

| type | payload | What the composable does |
|---|---|---|
| `create` | `pallet` | Append to bottom if passes filter |
| `update` | `pallet` | Update in-place if passes filter; remove if no longer qualifies |
| `bulk_update` | `pallets[]` | Per-row: update in-place / remove / ignore |
| `reset_sent` | `palletIds[]` | Set `sent: false` in-place; remove if view filters on sent |
| `mark_destination` | `pallets[]`, `newValue` | Only updates `mark` field on existing rows; appends if view filters on mark |

---

## `useFarmerEvents(farmer, pallets, options)`

- `farmer` — `Ref<string>` — reactive farmer name; composable re-subscribes automatically on change
- `pallets` — `Ref<Array>` — the page's data array; mutated in-place (new rows appended, existing rows patched, removed rows spliced)
- `options.currentUserEmail` — `Ref<string>` — echo suppression: events where `updatedBy === currentUserEmail` are skipped
- `options.filter` — `(pallet) => boolean` — which rows belong in this view

Returns `{ highlightedIds }` — a `ref(new Set())` of pallet IDs currently flashing.

### Key implementation details

- First `onSnapshot` fire is skipped (`isFirstSnapshot` guard) — prevents replaying a stale event from before the session opened.
- The snapshot callback wraps `applyEvent` in try-catch — a malformed event logs to console and exits without corrupting the array.
- `mark_destination` only updates the `mark` field on existing rows (other fields are not overwritten with potentially stale req.body data).

---

## Per-View Filter

| Component | pallets ref | filter |
|---|---|---|
| `Weight.vue` | `message` | none (all pallets) |
| `SentPallets.vue` | `pallets` | `p => p.sent === true` |
| `sentPalletsForMark.vue` | `pallets` | `p => p.sent === true` |
| `Destination.vue` | `pallets` | `p => p.mark === true` |

---

## PalletTable Flash Prop

`PalletTable.vue` accepts a `highlightedIds` prop (type `Object`, default `new Set()`). Pass
`highlightedIds` (not `highlightedIds.value`) — Vue auto-unwraps refs from `setup()` in templates.
The `<tr>` receives class `pallet-flash` when `highlightedIds.has(pallet.id)` is true. The
`@keyframes palletFlash` animation runs 3s ease-out and ends at `background-color: inherit` so
missing-weight rows (amber-50) restore correctly.

> See also: the **PalletTable Layout Contract** in [CLAUDE.md](../CLAUDE.md) — pages rendering
> `<PalletTable>` must put `h-full` on their root div.
