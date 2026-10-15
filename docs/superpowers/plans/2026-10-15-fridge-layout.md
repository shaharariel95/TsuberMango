# Fridge Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live 5×8 map of the cold room on the packhouse tablet: place / move / clear pallets by tap, safe under concurrent devices, with each slot showing its pallet's live state.

**Architecture:** One Firestore doc per room (`centers/{c}/fridge/main`) holds `cells`; every change is a single operation (`place` / `move` / `clear`) applied by the backend inside a transaction (pure rules in `fridgeCore.js`), with a move-log doc written in the same transaction. Clients `onSnapshot` the room doc for live cells and refetch pallet summaries (resolved live from `RecordRepository`) when the room's pallet set or those farmers' `farmer_events` change.

**Tech Stack:** Node/Express 5, firebase-admin 14 (modular), Vitest 5 on the Firebase emulators, Vue 3.5 + Tailwind 4, Firebase JS SDK 13, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-fridge-layout-design.md`

## Global Constraints

- Branch: `fridge-layout` (already created off `main`; the spec commit is on it). Never touch `feature/fridge-layout`.
- Every Firestore path is under `centers/{centerId}/`; the backend gets `centerId` from `config/center.js` (`CENTER_ID`).
- firebase-admin 14 modular API only (`getFirestore()` from `firebase-admin/firestore`); never `admin.firestore()`.
- All Firestore writes are Admin-SDK-only; the client only reads `centers/{c}/fridge/{roomId}` (new rule) besides the existing config / farmer_events.
- Fridge routes: `verifyFirebaseToken` + `ensureCenterAccess`; any center user (no `ensureAdmin`).
- Every controller handler logs with `logger.info` on success and `logger.error` on failure.
- Grid: room `main`, columns `A B C D E`, rows `1–8`, 40 slots. Aisle = drawn strip "מעבר", not a slot.
- A pallet = `(farmer, palletNumber)`; pallet numbers compare as `String(palletNumber)`. Store the record's own `palletNumber` value, never the client's.
- Timestamps in fridge docs are ISO strings (`new Date().toISOString()`), like `editedAt`.
- UI text Hebrew/RTL; all code comments, logs, commit messages and docs English. Tailwind only, no scoped CSS.
- Tests: `cd backend && npm test` (emulators) and `cd frontend && npm test` + `npm run e2e` (see the `local-dev` skill). No GitHub CI.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push or deploy unless the owner asks.

## Review Focus

1. **String vs number pallet numbers** — the client sends `"12"`, the record stores `12`: `ALREADY_PLACED` must still fire and the summary must still resolve (Task 3 test "string pallet number").
2. **No room doc yet** (fresh season / after reset) — GET returns 40 empty slots, `clear` returns `SLOT_EMPTY` 409, not 500 (Task 1 + Task 3 tests).
3. **Malformed slots** — `a1`, `A9` (the aisle row), `F1`, `A0`, `''`, missing op → 400, never 500 or a write (Task 1 test "rejects invalid slots").
4. **Stale selection on a second device** — a pallet picked on the tablet was already placed elsewhere → 409 with the Hebrew slot name in the message, and the UI re-reads the room (Task 3 test "ALREADY_PLACED message names the slot"; Task 8 `send()` refreshes on error).
5. **Mixed pallet partly sent / partly deleted** — still eligible to place, summary `partly_sent`, deleted records ignored in totals (Task 1 summarize tests; Task 6 eligible test).

---

### Task 1: `fridgeCore` — pure grid rules and pallet summaries

**Files:**
- Create: `backend/services/fridgeCore.js`
- Test: `backend/tests/fridgeCore.test.js`

**Interfaces:**
- Produces:
  - `ROOMS: { main: { cols: string[], rows: number } }`
  - `class FridgeError extends Error { status: number; code: string; details: object }`
  - `isValidSlot(roomId: string, slot: string): boolean`
  - `palletKey(farmer: string, palletNumber: string|number): string` → `` `${farmer}__${palletNumber}` ``
  - `findPallet(cells, farmer, palletNumber): string|null` (slot id)
  - `applyOp(roomId, cells, op, { actor, at }): { cells, logEntry }` — throws `FridgeError`
  - `summarizePallet(live: Record[], deleted: Record[]): Summary` where `Summary = { status: 'ok'|'partly_sent'|'sent'|'deleted'|'missing', kinds: string[], sizes: string[], boxes: number, weightMissing: boolean, mark: boolean, hasCertificate: boolean }`
  - `summarizeRoom(cells, byFarmer: { [farmer]: { live: Record[], deleted: Record[] } }): { [palletKey]: Summary }`

- [ ] **Step 1: Write the failing tests**

`backend/tests/fridgeCore.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../services/fridgeCore');
const { applyOp, isValidSlot, summarizePallet, summarizeRoom, palletKey, findPallet, FridgeError } = core;

const ctx = { actor: 'a@x', at: '2027-05-10T08:00:00.000Z' };
const cell = (farmer, palletNumber) => ({ farmer, palletNumber, placedBy: 'b@x', placedAt: '2027-05-09T08:00:00.000Z' });
const codeOf = (fn) => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(FridgeError); return `${e.status} ${e.code}`; } return 'no error'; };

describe('isValidSlot', () => {
  it('accepts A1–E8 of room main', () => {
    for (const s of ['A1', 'E8', 'C4']) expect(isValidSlot('main', s)).toBe(true);
  });
  it('rejects invalid slots', () => {
    for (const s of ['a1', 'A9', 'F1', 'A0', '', 'A01', 'AA1', null, undefined, 3]) expect(isValidSlot('main', s)).toBe(false);
    expect(isValidSlot('other', 'A1')).toBe(false);
  });
});

describe('applyOp place', () => {
  it('places into an empty slot and logs it', () => {
    const out = applyOp('main', {}, { op: 'place', slot: 'B3', farmer: 'א', palletNumber: 12 }, ctx);
    expect(out.cells).toEqual({ B3: { farmer: 'א', palletNumber: 12, placedBy: 'a@x', placedAt: ctx.at } });
    expect(out.logEntry).toEqual({ op: 'place', farmer: 'א', palletNumber: 12, from: null, to: 'B3', by: 'a@x', at: ctx.at });
  });
  it('does not mutate the input cells', () => {
    const cells = {};
    applyOp('main', cells, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 1 }, ctx);
    expect(cells).toEqual({});
  });
  it('refuses a taken slot', () => {
    expect(codeOf(() => applyOp('main', { B3: cell('ב', 1) }, { op: 'place', slot: 'B3', farmer: 'א', palletNumber: 12 }, ctx))).toBe('409 SLOT_TAKEN');
  });
  it('refuses a pallet already placed, naming its slot, comparing numbers as strings', () => {
    try {
      applyOp('main', { D7: cell('א', 12) }, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: '12' }, ctx);
      throw new Error('expected throw');
    } catch (e) { expect(e.code).toBe('ALREADY_PLACED'); expect(e.status).toBe(409); expect(e.details).toEqual({ slot: 'D7' }); }
  });
  it('the same number for another farmer is a different pallet', () => {
    const out = applyOp('main', { D7: cell('ב', 12) }, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 12 }, ctx);
    expect(Object.keys(out.cells).sort()).toEqual(['A1', 'D7']);
  });
  it('rejects bad input with 400', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A9', farmer: 'א', palletNumber: 1 }, ctx))).toBe('400 BAD_SLOT');
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A1', farmer: '', palletNumber: 1 }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: '' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, { op: 'swap' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, undefined, ctx))).toBe('400 BAD_OP');
  });
  it('unknown room is 404', () => {
    expect(codeOf(() => applyOp('nope', {}, { op: 'clear', slot: 'A1' }, ctx))).toBe('404 ROOM_NOT_FOUND');
  });
});

describe('applyOp move', () => {
  it('moves and keeps the original placedBy/placedAt', () => {
    const out = applyOp('main', { A1: cell('א', 5) }, { op: 'move', from: 'A1', to: 'E8' }, ctx);
    expect(out.cells).toEqual({ E8: cell('א', 5) });
    expect(out.logEntry).toEqual({ op: 'move', farmer: 'א', palletNumber: 5, from: 'A1', to: 'E8', by: 'a@x', at: ctx.at });
  });
  it('refuses empty source, taken target, same slot, bad slots', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'move', from: 'A1', to: 'A2' }, ctx))).toBe('409 SLOT_EMPTY');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1), A2: cell('א', 2) }, { op: 'move', from: 'A1', to: 'A2' }, ctx))).toBe('409 SLOT_TAKEN');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1) }, { op: 'move', from: 'A1', to: 'A1' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1) }, { op: 'move', from: 'A1', to: 'F1' }, ctx))).toBe('400 BAD_SLOT');
  });
});

describe('applyOp clear', () => {
  it('clears an occupied slot and logs it', () => {
    const out = applyOp('main', { C2: cell('א', 9) }, { op: 'clear', slot: 'C2' }, ctx);
    expect(out.cells).toEqual({});
    expect(out.logEntry).toEqual({ op: 'clear', farmer: 'א', palletNumber: 9, from: 'C2', to: null, by: 'a@x', at: ctx.at });
  });
  it('clearing an empty slot (or a room with no doc yet) is 409 SLOT_EMPTY', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'clear', slot: 'C2' }, ctx))).toBe('409 SLOT_EMPTY');
  });
});

describe('findPallet / palletKey', () => {
  it('finds by farmer + string-compared number', () => {
    expect(findPallet({ B2: cell('א', 7) }, 'א', '7')).toBe('B2');
    expect(findPallet({ B2: cell('א', 7) }, 'ב', 7)).toBe(null);
    expect(palletKey('א', 7)).toBe('א__7');
  });
});

describe('summarizePallet', () => {
  const r = (o) => ({ palletNumber: 1, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false, mark: false, cardId: '', ...o });
  it('ok single pallet', () => {
    expect(summarizePallet([r()], [])).toEqual({ status: 'ok', kinds: ['שלי'], sizes: ['15'], boxes: 40, weightMissing: false, mark: false, hasCertificate: false });
  });
  it('mixed pallet: unique kinds/sizes, summed boxes, any-flags', () => {
    const s = summarizePallet([r({ kind: 'שלי', size: '15', weight: 0, mark: true }), r({ kind: 'קיט', size: '15', boxes: 20 })], []);
    expect(s).toEqual({ status: 'ok', kinds: ['שלי', 'קיט'], sizes: ['15'], boxes: 60, weightMissing: true, mark: true, hasCertificate: false });
  });
  it('sent / partly sent', () => {
    expect(summarizePallet([r({ sent: true, cardId: 51 })], []).status).toBe('sent');
    expect(summarizePallet([r({ sent: true, cardId: 51 })], []).hasCertificate).toBe(true);
    expect(summarizePallet([r({ sent: true }), r()], []).status).toBe('partly_sent');
  });
  it('deleted records are ignored while a live one exists', () => {
    expect(summarizePallet([r({ boxes: 10 })], [r({ boxes: 99, deleted: true })])).toMatchObject({ status: 'ok', boxes: 10 });
  });
  it('deleted vs missing', () => {
    expect(summarizePallet([], [r({ deleted: true })])).toEqual({ status: 'deleted', kinds: [], sizes: [], boxes: 0, weightMissing: false, mark: false, hasCertificate: false });
    expect(summarizePallet([], []).status).toBe('missing');
  });
});

describe('summarizeRoom', () => {
  it('resolves each cell by (farmer, String(palletNumber))', () => {
    const cells = { A1: cell('א', '12'), A2: cell('ב', 3) };
    const byFarmer = {
      'א': { live: [{ palletNumber: 12, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false }], deleted: [] },
      'ב': { live: [], deleted: [] },
    };
    const out = summarizeRoom(cells, byFarmer);
    expect(out['א__12'].status).toBe('ok');
    expect(out['ב__3'].status).toBe('missing');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run tests/fridgeCore.test.js`
Expected: FAIL — `Cannot find module '../services/fridgeCore'`.

- [ ] **Step 3: Implement**

`backend/services/fridgeCore.js`:
```js
// Pure fridge (cold-room map) logic: slot validation, the place/move/clear rules and pallet summaries.
// No I/O — the repository runs applyOp inside a Firestore transaction, the controller builds summaries.
const ROOMS = { main: { cols: ['A', 'B', 'C', 'D', 'E'], rows: 8 } };

class FridgeError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isValidSlot(roomId, slot) {
  const room = ROOMS[roomId];
  if (!room || typeof slot !== 'string') return false;
  const m = /^([A-Z])([1-9][0-9]?)$/.exec(slot);
  return !!m && room.cols.includes(m[1]) && Number(m[2]) <= room.rows;
}

const palletKey = (farmer, palletNumber) => `${farmer}__${palletNumber}`;

function findPallet(cells, farmer, palletNumber) {
  return Object.keys(cells).find(s => cells[s].farmer === farmer && String(cells[s].palletNumber) === String(palletNumber)) || null;
}

function applyOp(roomId, cells, op, { actor, at }) {
  if (!ROOMS[roomId]) throw new FridgeError(404, 'ROOM_NOT_FOUND');
  const slotOk = (s) => { if (!isValidSlot(roomId, s)) throw new FridgeError(400, 'BAD_SLOT', { slot: s ?? null }); };
  const next = { ...cells };
  const log = (c, from, to) => ({ op: op.op, farmer: c.farmer, palletNumber: c.palletNumber, from, to, by: actor, at });

  switch (op?.op) {
    case 'place': {
      slotOk(op.slot);
      if (!op.farmer || op.palletNumber == null || op.palletNumber === '') throw new FridgeError(400, 'BAD_OP');
      if (next[op.slot]) throw new FridgeError(409, 'SLOT_TAKEN', { slot: op.slot });
      const already = findPallet(next, op.farmer, op.palletNumber);
      if (already) throw new FridgeError(409, 'ALREADY_PLACED', { slot: already });
      next[op.slot] = { farmer: op.farmer, palletNumber: op.palletNumber, placedBy: actor, placedAt: at };
      return { cells: next, logEntry: log(next[op.slot], null, op.slot) };
    }
    case 'move': {
      slotOk(op.from);
      slotOk(op.to);
      if (op.from === op.to) throw new FridgeError(400, 'BAD_OP');
      const c = next[op.from];
      if (!c) throw new FridgeError(409, 'SLOT_EMPTY', { slot: op.from });
      if (next[op.to]) throw new FridgeError(409, 'SLOT_TAKEN', { slot: op.to });
      delete next[op.from];
      next[op.to] = c; // placedBy/placedAt = when it entered the room; the log records the move
      return { cells: next, logEntry: log(c, op.from, op.to) };
    }
    case 'clear': {
      slotOk(op.slot);
      const c = next[op.slot];
      if (!c) throw new FridgeError(409, 'SLOT_EMPTY', { slot: op.slot });
      delete next[op.slot];
      return { cells: next, logEntry: log(c, op.slot, null) };
    }
    default:
      throw new FridgeError(400, 'BAD_OP');
  }
}

const uniq = (records, field) => [...new Set(records.map(r => r[field]).filter(v => v !== '' && v != null))];

// live = the pallet's non-deleted records, deleted = its soft-deleted ones (same farmer + number).
function summarizePallet(live, deleted) {
  if (!live.length) {
    return { status: deleted.length ? 'deleted' : 'missing', kinds: [], sizes: [], boxes: 0, weightMissing: false, mark: false, hasCertificate: false };
  }
  const sent = live.filter(r => r.sent === true).length;
  return {
    status: sent === 0 ? 'ok' : sent === live.length ? 'sent' : 'partly_sent',
    kinds: uniq(live, 'kind'),
    sizes: uniq(live, 'size'),
    boxes: live.reduce((n, r) => n + (Number(r.boxes) || 0), 0),
    weightMissing: live.some(r => !(Number(r.weight) > 0)),
    mark: live.some(r => r.mark === true),
    hasCertificate: live.some(r => r.cardId !== '' && r.cardId != null),
  };
}

function summarizeRoom(cells, byFarmer) {
  const out = {};
  for (const c of Object.values(cells)) {
    const f = byFarmer[c.farmer] || { live: [], deleted: [] };
    const same = (r) => String(r.palletNumber) === String(c.palletNumber);
    out[palletKey(c.farmer, c.palletNumber)] = summarizePallet(f.live.filter(same), f.deleted.filter(same));
  }
  return out;
}

module.exports = { ROOMS, FridgeError, isValidSlot, palletKey, findPallet, applyOp, summarizePallet, summarizeRoom };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run tests/fridgeCore.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/fridgeCore.js backend/tests/fridgeCore.test.js
git commit -m "feat(fridge): pure grid rules and pallet summaries (fridgeCore)"
```

---

### Task 2: `FirestoreFridgeRepository` — transactional operations

**Files:**
- Create: `backend/repositories/FirestoreFridgeRepository.js`
- Modify: `backend/repositories/index.js` (add the `fridge` export)
- Test: `backend/tests/fridge.repo.test.js`

**Interfaces:**
- Consumes: `fridgeCore.applyOp`, `FridgeError` (Task 1).
- Produces (exported as `require('../repositories').fridge`, class also exported):
  - `new FirestoreFridgeRepository(db?, centerId?)`
  - `getRoom(roomId): Promise<{ cells, updatedAt: string|null, updatedBy: string|null }>` — missing doc → `{ cells: {}, updatedAt: null, updatedBy: null }`
  - `applyOp(roomId, op, actor): Promise<{ cells, updatedAt, updatedBy }>` — transaction; writes room doc + one `log` doc
  - `clearFarmer(roomId, farmer): Promise<number>` — removes that farmer's cells in a transaction, returns the count removed; writes nothing if 0

- [ ] **Step 1: Write the failing tests**

`backend/tests/fridge.repo.test.js`:
```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const require = createRequire(import.meta.url);
const { FirestoreFridgeRepository } = require('../repositories/FirestoreFridgeRepository');
const { FridgeError } = require('../services/fridgeCore');

const C = 'fridgerepo';
const center = db.collection('centers').doc(C);
const room = center.collection('fridge').doc('main');
const repo = new FirestoreFridgeRepository(db, C);

beforeEach(async () => { await db.recursiveDelete(center); });
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('FirestoreFridgeRepository', () => {
  it('getRoom on a missing doc is empty', async () => {
    expect(await repo.getRoom('main')).toEqual({ cells: {}, updatedAt: null, updatedBy: null });
  });

  it('place → move → clear writes the doc and one log entry each', async () => {
    await repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 4 }, 'a@x');
    await repo.applyOp('main', { op: 'move', from: 'A1', to: 'B2' }, 'b@x');
    const afterMove = await repo.getRoom('main');
    expect(Object.keys(afterMove.cells)).toEqual(['B2']);
    expect(afterMove.cells.B2).toMatchObject({ farmer: 'א', palletNumber: 4, placedBy: 'a@x' });
    expect(afterMove.updatedBy).toBe('b@x');
    await repo.applyOp('main', { op: 'clear', slot: 'B2' }, 'a@x');
    expect((await repo.getRoom('main')).cells).toEqual({});
    const log = (await room.collection('log').orderBy('at').get()).docs.map(d => d.data().op);
    expect(log.sort()).toEqual(['clear', 'move', 'place']);
  });

  it('a refused op writes nothing', async () => {
    await expect(repo.applyOp('main', { op: 'clear', slot: 'A1' }, 'a@x')).rejects.toBeInstanceOf(FridgeError);
    expect((await room.get()).exists).toBe(false);
    expect((await room.collection('log').get()).size).toBe(0);
  });

  it('two concurrent places into one slot: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.applyOp('main', { op: 'place', slot: 'C3', farmer: 'א', palletNumber: 1 }, 'a@x'),
      repo.applyOp('main', { op: 'place', slot: 'C3', farmer: 'ב', palletNumber: 2 }, 'b@x'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected');
    expect(rejected.reason.code).toBe('SLOT_TAKEN');
    expect(Object.keys((await repo.getRoom('main')).cells)).toEqual(['C3']);
    expect((await room.collection('log').get()).size).toBe(1);
  });

  it('one pallet placed into two slots concurrently: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 7 }, 'a@x'),
      repo.applyOp('main', { op: 'place', slot: 'E8', farmer: 'א', palletNumber: 7 }, 'b@x'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.code).toBe('ALREADY_PLACED');
    expect(Object.keys((await repo.getRoom('main')).cells)).toHaveLength(1);
  });

  it('clearFarmer removes only that farmer', async () => {
    await repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 1 }, 'a@x');
    await repo.applyOp('main', { op: 'place', slot: 'A2', farmer: 'א', palletNumber: 2 }, 'a@x');
    await repo.applyOp('main', { op: 'place', slot: 'A3', farmer: 'ב', palletNumber: 1 }, 'a@x');
    expect(await repo.clearFarmer('main', 'א')).toBe(2);
    expect(Object.keys((await repo.getRoom('main')).cells)).toEqual(['A3']);
    expect(await repo.clearFarmer('main', 'ג')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- tests/fridge.repo.test.js`
(if the npm script does not forward the file filter, run `npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/fridge.repo.test.js"`)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/repositories/FirestoreFridgeRepository.js`:
```js
// Firestore storage for the fridge (cold-room) map: one doc per room at centers/{c}/fridge/{roomId}
// holding `cells`, plus a `log` subcollection. Every change is one operation applied in a transaction,
// so concurrent devices can never overwrite each other (the loser gets the FridgeError).
const { getFirestore } = require('firebase-admin/firestore');
const { CENTER_ID } = require('../config/center');
const core = require('../services/fridgeCore');

class FirestoreFridgeRepository {
  constructor(db = null, centerId = CENTER_ID) {
    this._db = db;
    this.centerId = centerId;
  }

  get db() { return this._db || getFirestore(); }
  roomDoc(roomId) { return this.db.collection('centers').doc(this.centerId).collection('fridge').doc(roomId); }

  async getRoom(roomId) {
    const snap = await this.roomDoc(roomId).get();
    const d = snap.exists ? snap.data() : {};
    return { cells: d.cells || {}, updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || null };
  }

  async applyOp(roomId, op, actor) {
    const ref = this.roomDoc(roomId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const at = new Date().toISOString();
      const { cells, logEntry } = core.applyOp(roomId, snap.exists ? (snap.data().cells || {}) : {}, op, { actor, at });
      t.set(ref, { cells, updatedAt: at, updatedBy: actor });
      t.create(ref.collection('log').doc(), logEntry);
      return { cells, updatedAt: at, updatedBy: actor };
    });
  }

  // Season reset (--farmer): drop one farmer's cells; the log is history and stays.
  async clearFarmer(roomId, farmer) {
    const ref = this.roomDoc(roomId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 0;
      const cells = { ...(snap.data().cells || {}) };
      const mine = Object.keys(cells).filter(s => cells[s].farmer === farmer);
      if (!mine.length) return 0;
      mine.forEach(s => delete cells[s]);
      t.update(ref, { cells, updatedAt: new Date().toISOString(), updatedBy: 'season-reset' });
      return mine.length;
    });
  }
}

module.exports = { FirestoreFridgeRepository };
```

`backend/repositories/index.js` — add after the certificates line:
```js
const { FirestoreFridgeRepository } = require('./FirestoreFridgeRepository');
module.exports.fridge = new FirestoreFridgeRepository();
```
(put the `require` next to the other requires at the top and the export line after `module.exports.certificates = ...`).

- [ ] **Step 4: Run to verify it passes**

Run the same command as Step 2. Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/repositories/FirestoreFridgeRepository.js backend/repositories/index.js backend/tests/fridge.repo.test.js
git commit -m "feat(fridge): transactional room repository with move log"
```

---

### Task 3: Fridge API — controller, routes, mounting

**Files:**
- Create: `backend/controllers/fridgeController.js`, `backend/routes/fridgeRoutes.js`
- Modify: `backend/app.js` (mount next to `/api/certificates`, line ~123, **above** the global `/api` chain)
- Test: `backend/tests/fridge.api.test.js`

**Interfaces:**
- Consumes: `repo.getRecords(farmer, { includeDeleted: true })`, `repo.getRecordsByPallet(farmer, palletNumber)` (existing `RecordRepository`), `repo.fridge` (Task 2), `fridgeCore` (Task 1), `assertKnownFarmer(farmer): Promise<string|null>` from `controllers/recordController.js`.
- Produces HTTP:
  - `GET /api/fridge/:roomId` → `200 { cells, updatedAt, updatedBy, pallets: { [palletKey]: Summary } }`; `404 { error, code: 'ROOM_NOT_FOUND' }`
  - `POST /api/fridge/:roomId/ops` body `{op:'place', slot, farmer, palletNumber} | {op:'move', from, to} | {op:'clear', slot}` → `200` same shape as GET; errors `{ error: <Hebrew>, code, ...details }` with status from `FridgeError`; unknown farmer → `400 { error, code: 'UNKNOWN_FARMER' }`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/fridge.api.test.js`:
```js
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { clearCollection, tokenFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'fridgeapi';
const FARMER = 'חקלאי-מקרר';
const OTHER = 'חקלאי-שני';
const USER = 'fridge-user@test.local';
const STRANGER = 'fridge-stranger@test.local';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const records = (f) => center.collection('farmers').doc(f).collection('records');
const room = center.collection('fridge').doc('main');
const tokens = {};
const api = makeApi(app, tokens);

async function addRecord(farmer, palletNumber, o = {}) {
  const ref = await records(farmer).add({ palletNumber, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false,
    mark: false, gidon: false, cardId: '', harvestDate: '2027-05-01', shipmentDate: '', destination: '', editedBy: '', editedAt: '', ...o });
  return ref.id;
}
const place = (slot, palletNumber, farmer = FARMER) => api('post', '/api/fridge/main/ops', 'user').send({ op: 'place', slot, farmer, palletNumber });

beforeAll(async () => {
  await center.collection('config').doc('global').set({ kinds: ['שלי'], sizes: ['15'], destinations: [],
    farmers: [{ name: FARMER, allowGidon: false }, { name: OTHER, allowGidon: false }], farmerConfigs: {} });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
  tokens.stranger = await tokenFor(STRANGER, { centers: ['someone-else'] });
});
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });
beforeEach(async () => {
  await db.recursiveDelete(room);
  await clearCollection(records(FARMER));
  await clearCollection(records(OTHER));
});

describe('auth', () => {
  it('401 without a token, 403 without the center claim', async () => {
    expect((await api('get', '/api/fridge/main', 'none')).status).toBe(401);
    expect((await api('get', '/api/fridge/main', 'stranger')).status).toBe(403);
  });
});

describe('GET', () => {
  it('empty room before any write', async () => {
    const res = await api('get', '/api/fridge/main', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cells: {}, updatedAt: null, updatedBy: null, pallets: {} });
  });
  it('unknown room is 404', async () => {
    expect((await api('get', '/api/fridge/garage', 'user')).status).toBe(404);
  });
});

describe('place / move / clear', () => {
  it('a regular user can place, move and clear; each returns the room with summaries', async () => {
    await addRecord(FARMER, 12);
    const p = await place('B3', 12);
    expect(p.status).toBe(200);
    expect(p.body.cells.B3).toMatchObject({ farmer: FARMER, palletNumber: 12, placedBy: USER });
    expect(p.body.pallets[`${FARMER}__12`]).toMatchObject({ status: 'ok', boxes: 40 });

    const m = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'move', from: 'B3', to: 'E8' });
    expect(m.status).toBe(200);
    expect(Object.keys(m.body.cells)).toEqual(['E8']);

    const c = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'clear', slot: 'E8' });
    expect(c.status).toBe(200);
    expect(c.body.cells).toEqual({});
    expect((await room.collection('log').get()).size).toBe(3);
  });

  it('string pallet number from the client is stored as the record value and still collides', async () => {
    await addRecord(FARMER, 12);
    const p = await place('A1', '12');
    expect(p.body.cells.A1.palletNumber).toBe(12);
    const again = await place('A2', 12);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_PLACED');
  });

  it('ALREADY_PLACED message names the slot', async () => {
    await addRecord(FARMER, 5);
    await place('C4', 5);
    const res = await place('D1', 5);
    expect(res.body).toMatchObject({ code: 'ALREADY_PLACED', slot: 'C4', error: 'המשטח כבר במקרר בתא C4' });
  });

  it('SLOT_TAKEN, bad slot, bad op, clear on empty', async () => {
    await addRecord(FARMER, 1);
    await addRecord(OTHER, 1);
    await place('A1', 1);
    const taken = await place('A1', 1, OTHER);
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: 'SLOT_TAKEN', error: 'התא תפוס' });
    expect((await place('A9', 1, OTHER)).status).toBe(400);
    expect((await api('post', '/api/fridge/main/ops', 'user').send({ op: 'swap' })).status).toBe(400);
    const empty = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'clear', slot: 'E5' });
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe('SLOT_EMPTY');
  });

  it('place refuses unknown farmer, missing pallet, fully sent pallet; marked is fine', async () => {
    expect((await place('A1', 1, 'לא-קיים')).body.code).toBe('UNKNOWN_FARMER');
    const missing = await place('A1', 999);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    await addRecord(FARMER, 20, { sent: true, cardId: 51 });
    const sent = await place('A1', 20);
    expect(sent.status).toBe(409);
    expect(sent.body.code).toBe('ALREADY_SENT');
    await addRecord(FARMER, 21, { mark: true });
    expect((await place('A1', 21)).status).toBe(200);
    expect((await room.get()).data().cells.A1.palletNumber).toBe(21);
  });

  it('concurrent places into one slot over HTTP: one 200, one 409', async () => {
    await addRecord(FARMER, 1);
    await addRecord(FARMER, 2);
    const [a, b] = await Promise.all([place('C3', 1), place('C3', 2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe('summaries follow the live records', () => {
  it('sent, partly sent, deleted, renumbered', async () => {
    const one = await addRecord(FARMER, 1);
    const twoA = await addRecord(FARMER, 2);
    await addRecord(FARMER, 2, { kind: 'קיט' });
    const three = await addRecord(FARMER, 3);
    const four = await addRecord(FARMER, 4);
    for (const [slot, n] of [['A1', 1], ['A2', 2], ['A3', 3], ['A4', 4]]) expect((await place(slot, n)).status).toBe(200);

    await records(FARMER).doc(one).update({ sent: true, cardId: 60 });
    await records(FARMER).doc(twoA).update({ sent: true });
    await records(FARMER).doc(three).update({ deleted: true, deletedBy: USER, deletedAt: '2027-05-02T00:00:00Z' });
    await records(FARMER).doc(four).update({ palletNumber: 44 });

    const res = await api('get', '/api/fridge/main', 'user');
    const s = (n) => res.body.pallets[`${FARMER}__${n}`].status;
    expect([s(1), s(2), s(3), s(4)]).toEqual(['sent', 'partly_sent', 'deleted', 'missing']);
    expect(res.body.pallets[`${FARMER}__2`].kinds).toEqual(['שלי', 'קיט']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/fridge.api.test.js"`
Expected: FAIL — 404s on `/api/fridge/...` (route not mounted).

- [ ] **Step 3: Implement**

`backend/controllers/fridgeController.js`:
```js
// HTTP layer for the fridge (cold-room) map. Rules live in services/fridgeCore.js, the transaction in
// repositories/FirestoreFridgeRepository.js. Fridge writes change no records, so no farmer_events are
// emitted: clients listen to the room doc itself.
const repo = require('../repositories');
const { ROOMS, FridgeError, summarizeRoom } = require('../services/fridgeCore');
const { assertKnownFarmer } = require('./recordController');
const logger = require('../utils/logger');

const MESSAGES = {
  SLOT_TAKEN: () => 'התא תפוס',
  ALREADY_PLACED: (d) => `המשטח כבר במקרר בתא ${d.slot}`,
  SLOT_EMPTY: () => 'התא ריק',
  NOT_FOUND: () => 'המשטח לא נמצא',
  ALREADY_SENT: () => 'המשטח כבר נשלח',
  BAD_SLOT: () => 'בקשה לא תקינה',
  BAD_OP: () => 'בקשה לא תקינה',
  ROOM_NOT_FOUND: () => 'המקרר לא נמצא',
};

const actorOf = (req) => req.user?.email || 'unknown';

// Room + a live summary of every placed pallet (one records read per farmer on the map).
async function roomView(room) {
  const farmers = [...new Set(Object.values(room.cells).map(c => c.farmer))];
  const byFarmer = {};
  for (const f of farmers) {
    const all = await repo.getRecords(f, { includeDeleted: true });
    byFarmer[f] = { live: all.filter(r => r.deleted !== true), deleted: all.filter(r => r.deleted === true) };
  }
  return { ...room, pallets: summarizeRoom(room.cells, byFarmer) };
}

async function handle(res, label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FridgeError) {
      logger.info(`[fridgeController.${label}] ${err.code} ${JSON.stringify(err.details)}`);
      return res.status(err.status).json({ error: (MESSAGES[err.code] || (() => err.code))(err.details), code: err.code, ...err.details });
    }
    logger.error(`[fridgeController.${label}] ${err.message}`);
    return res.status(500).json({ error: 'שגיאה במקרר', details: err.message });
  }
}

function assertRoom(roomId) {
  if (!ROOMS[roomId]) throw new FridgeError(404, 'ROOM_NOT_FOUND');
}

module.exports = {
  getRoom: (req, res) => handle(res, 'getRoom', async () => {
    assertRoom(req.params.roomId);
    const view = await roomView(await repo.fridge.getRoom(req.params.roomId));
    logger.info(`[fridgeController.getRoom] ${req.params.roomId}: ${Object.keys(view.cells).length} cells`);
    res.json(view);
  }),

  postOp: (req, res) => handle(res, 'postOp', async () => {
    const { roomId } = req.params;
    assertRoom(roomId);
    let op = req.body || {};
    if (op.op === 'place') {
      const farmerError = op.farmer ? await assertKnownFarmer(op.farmer) : null;
      if (farmerError) return res.status(400).json({ error: farmerError, code: 'UNKNOWN_FARMER' });
      if (op.farmer && op.palletNumber != null && op.palletNumber !== '') {
        const recs = await repo.getRecordsByPallet(op.farmer, op.palletNumber);
        if (!recs.length) throw new FridgeError(404, 'NOT_FOUND');
        if (recs.every(r => r.sent === true)) throw new FridgeError(409, 'ALREADY_SENT');
        op = { op: 'place', slot: op.slot, farmer: op.farmer, palletNumber: recs[0].palletNumber };
      }
    }
    const room = await repo.fridge.applyOp(roomId, op, actorOf(req));
    logger.info(`[fridgeController.postOp] ${roomId} ${op.op} ${JSON.stringify({ slot: op.slot, from: op.from, to: op.to, farmer: op.farmer, palletNumber: op.palletNumber })} by ${actorOf(req)}`);
    res.json(await roomView(room));
  }),
};
```

`backend/routes/fridgeRoutes.js`:
```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/fridgeController');

router.get('/:roomId', c.getRoom);
router.post('/:roomId/ops', c.postOp);

module.exports = router;
```

`backend/app.js` — directly under the `/api/certificates` mount (line ~123):
```js
// 🧊 Fridge map — same pattern: own auth chain, mounted above the global /api chain.
app.use("/api/fridge", verifyFirebaseToken, ensureCenterAccess, require("./routes/fridgeRoutes"));
```

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command. Expected: PASS. Then the whole backend suite: `cd backend && npm test` — expected all green.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/fridgeController.js backend/routes/fridgeRoutes.js backend/app.js backend/tests/fridge.api.test.js
git commit -m "feat(fridge): GET room + POST ops API with live pallet summaries"
```

---

### Task 4: Firestore rules — client read of the room doc

**Files:**
- Modify: `frontend/firestore.rules`
- Test: `backend/tests/firestore.rules.test.js`

**Interfaces:**
- Produces: clients with `centerId in token.centers` may read `centers/{centerId}/fridge/{roomId}`; `log` and all writes stay denied.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/firestore.rules.test.js`, add to the `withSecurityRulesDisabled` seed block:
```js
    await setDoc(doc(d, 'centers/tsuberi/fridge/main'), { cells: {} });
    await setDoc(doc(d, 'centers/tsuberi/fridge/main/log/l1'), { op: 'place' });
```
and add a describe block:
```js
describe('fridge reads', () => {
  it('allows a matching authed user to read the room doc', async () => {
    await assertSucceeds(getDoc(doc(authed(['tsuberi']), 'centers/tsuberi/fridge/main')));
  });
  it('denies another center and unauthenticated users', async () => {
    await assertFails(getDoc(doc(authed(['other']), 'centers/tsuberi/fridge/main')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'centers/tsuberi/fridge/main')));
  });
  it('denies the move log and any client write', async () => {
    await assertFails(getDoc(doc(authed(['tsuberi']), 'centers/tsuberi/fridge/main/log/l1')));
    await assertFails(setDoc(doc(authed(['tsuberi']), 'centers/tsuberi/fridge/main'), { cells: { A1: {} } }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/firestore.rules.test.js"`
Expected: FAIL on "allows a matching authed user to read the room doc".

- [ ] **Step 3: Implement**

`frontend/firestore.rules` — update the header comment's first line to `// Client SDK reads only the tenant config doc, the real-time farmer_events and the fridge room docs.` and add after the `farmer_events` match:
```
    match /centers/{centerId}/fridge/{roomId} {
      allow read: if request.auth != null && centerId in request.auth.token.centers;
      allow write: if false; // Admin SDK only (fridgeController); log/ has no rule (denied)
    }
```

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/firestore.rules backend/tests/firestore.rules.test.js
git commit -m "feat(fridge): rules allow center members to read fridge room docs"
```

---

### Task 5: Backup, restore and season reset include the fridge

**Files:**
- Modify: `backend/services/backupService.js` (`buildBackupPayload`)
- Modify: `backend/services/backupRestore.js` (`withFridge` option)
- Modify: `backend/scripts/restoreBackup.js` (`--with-fridge` flag + header comment)
- Modify: `backend/services/seasonReset.js`
- Modify: `NEW_SEASON.md` (mention the fridge in reset + restore steps)
- Test: `backend/tests/backupPayload.test.js`, `backend/tests/backupRestore.test.js`, `backend/tests/seasonReset.test.js`

**Interfaces:**
- Consumes: `FirestoreFridgeRepository(db, centerId).clearFarmer(roomId, farmer)` (Task 2).
- Produces:
  - payload v2 gains `fridge: { [roomId]: { doc: object|null, log: [{ id, ...entry }] } }` (always present, `{}` when no rooms)
  - `restoreBackup(db, centerId, payload, { execute, farmer, withConfig, withFridge })` — summary gains `fridge: { rooms, cells, log } | null` (null unless `withFridge`)
  - `resetSeason` summary gains `fridgeCells: number, fridgeLog: number`

- [ ] **Step 1: Write the failing tests**

`backend/tests/backupPayload.test.js` — in `beforeEach`, after the certificate seed, add:
```js
  await center.collection('fridge').doc('main').set({ cells: { A1: { farmer: 'א', palletNumber: 1, placedBy: 'a@x', placedAt: '2027-05-01T00:00:00Z' } }, updatedAt: '2027-05-01T00:00:00Z', updatedBy: 'a@x' });
  await center.collection('fridge').doc('main').collection('log').doc('l1').set({ op: 'place', farmer: 'א', palletNumber: 1, from: null, to: 'A1', by: 'a@x', at: '2027-05-01T00:00:00Z' });
```
and a test:
```js
it('includes the fridge rooms with their logs', async () => {
  const p = await buildBackupPayload(db, C);
  expect(p.fridge.main.doc.cells.A1).toMatchObject({ farmer: 'א', palletNumber: 1 });
  expect(p.fridge.main.log).toEqual([{ id: 'l1', op: 'place', farmer: 'א', palletNumber: 1, from: null, to: 'A1', by: 'a@x', at: '2027-05-01T00:00:00Z' }]);
});
```

`backend/tests/backupRestore.test.js` — in `seed()` add the same two fridge writes on `ca` (source center), then add:
```js
describe('fridge', () => {
  it('is skipped unless withFridge', async () => {
    const payload = await buildBackupPayload(db, A);
    const out = await restoreBackup(db, B, payload, { execute: true });
    expect(out.fridge).toBe(null);
    expect((await cb.collection('fridge').doc('main').get()).exists).toBe(false);
  });
  it('withFridge restores the room doc and log with ids', async () => {
    const payload = await buildBackupPayload(db, A);
    const dry = await restoreBackup(db, B, payload, { withFridge: true });
    expect(dry.fridge).toEqual({ rooms: 1, cells: 1, log: 1 });
    expect(dry.blockers).toEqual([]);
    await restoreBackup(db, B, payload, { execute: true, withFridge: true });
    expect((await cb.collection('fridge').doc('main').get()).data().cells.A1.palletNumber).toBe(1);
    expect((await cb.collection('fridge').doc('main').collection('log').doc('l1').get()).exists).toBe(true);
  });
  it('a non-empty target room or log is a blocker', async () => {
    const payload = await buildBackupPayload(db, A);
    await cb.collection('fridge').doc('main').set({ cells: { B1: { farmer: 'ב', palletNumber: 3 } } });
    await cb.collection('fridge').doc('main').collection('log').doc('x').set({ op: 'place' });
    const dry = await restoreBackup(db, B, payload, { withFridge: true });
    expect(dry.blockers).toEqual(expect.arrayContaining(['fridge room "main": cells not empty', 'fridge room "main": log not empty']));
    await expect(restoreBackup(db, B, payload, { execute: true, withFridge: true })).rejects.toThrow(/not empty/);
  });
  it('an empty target room doc is not a blocker', async () => {
    const payload = await buildBackupPayload(db, A);
    await cb.collection('fridge').doc('main').set({ cells: {} });
    expect((await restoreBackup(db, B, payload, { withFridge: true })).blockers).toEqual([]);
  });
  it('withFridge refuses a --farmer restore', async () => {
    const payload = await buildBackupPayload(db, A);
    await expect(restoreBackup(db, B, payload, { farmer: 'א', withFridge: true })).rejects.toThrow(/--with-fridge/);
  });
  it('a backup without a fridge section restores with withFridge as zero rooms', async () => {
    const payload = await buildBackupPayload(db, A);
    delete payload.fridge;
    expect((await restoreBackup(db, B, payload, { withFridge: true })).fridge).toEqual({ rooms: 0, cells: 0, log: 0 });
  });
});
```

`backend/tests/seasonReset.test.js` — in `seed()` add (center `C`):
```js
  await center.collection('fridge').doc('main').set({ cells: {
    A1: { farmer: 'א', palletNumber: 1 }, A2: { farmer: 'ב', palletNumber: 3 } } });
  await center.collection('fridge').doc('main').collection('log').doc('l1').set({ op: 'place' });
```
Update the two existing exact expectations:
- line 42–43 → `..., certificates: 1, certificateVersions: 2, farmerEvents: 1, fridgeCells: 2, fridgeLog: 1 });`
- line 84–85 → `..., certificates: 1, certificateVersions: 2, farmerEvents: 0, fridgeCells: 1, fridgeLog: 0 });`

Add tests (use the file's existing backup-seeding pattern for execute, e.g. `await db.collection('backups').add({ timestamp: Timestamp.fromDate(NOW) })`):
```js
it('full execute clears the fridge (cells and log)', async () => {
  await db.collection('backups').add({ timestamp: Timestamp.fromDate(NOW) });
  await resetSeason(db, C, { execute: true, now: NOW });
  expect((await center.collection('fridge').doc('main').get()).exists).toBe(false);
  expect((await center.collection('fridge').doc('main').collection('log').get()).size).toBe(0);
});
it('--farmer execute removes only that farmer\'s cells and keeps the log', async () => {
  await db.collection('backups').add({ timestamp: Timestamp.fromDate(NOW) });
  await resetSeason(db, C, { execute: true, now: NOW, farmer: 'א' });
  expect(Object.keys((await center.collection('fridge').doc('main').get()).data().cells)).toEqual(['A2']);
  expect((await center.collection('fridge').doc('main').collection('log').get()).size).toBe(1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/backupPayload.test.js tests/backupRestore.test.js tests/seasonReset.test.js"`
Expected: FAIL (no `fridge` in payload / summaries).

- [ ] **Step 3: Implement**

`backend/services/backupService.js` — in `buildBackupPayload`, after the certificates loop:
```js
    const fridge = {};
    for (const ref of await center.collection('fridge').listDocuments()) {
        const snap = await ref.get();
        const logSnap = await ref.collection('log').get();
        fridge[ref.id] = { doc: snap.exists ? snap.data() : null, log: logSnap.docs.map(d => ({ id: d.id, ...d.data() })) };
    }
```
and add `fridge,` after `certificates,` in the returned object. Update the doc comment: `...certificates + versions, fridge rooms + move log`.

`backend/services/backupRestore.js`:
- Header comment: add `Fridge rooms (+ log) only with { withFridge } (full restores only); a non-empty target room or log is a blocker.`
- Signature: `{ execute = false, farmer = null, withConfig = false, withFridge = false } = {}`
- After the `withConfig` check:
```js
  if (withFridge && farmer) throw new Error('--with-fridge needs a full (no --farmer) restore');
```
- After the certificate-exists blocker loop:
```js
  const fridgeRooms = withFridge ? Object.entries(payload.fridge || {}) : [];
  for (const [roomId, r] of fridgeRooms) {
    if (badId(roomId)) throw new Error(`Fridge room with an invalid id in backup: ${roomId}`);
    if ((r.log || []).some(e => !e || badId(e.id))) throw new Error(`Fridge log entry without id in room "${roomId}"`);
    const ref = center.collection('fridge').doc(roomId);
    const cur = await ref.get();
    if (cur.exists && Object.keys(cur.data().cells || {}).length) blockers.push(`fridge room "${roomId}": cells not empty`);
    if (!(await ref.collection('log').limit(1).get()).empty) blockers.push(`fridge room "${roomId}": log not empty`);
  }
```
- In `summary` add:
```js
    fridge: withFridge ? {
      rooms: fridgeRooms.length,
      cells: fridgeRooms.reduce((n, [, r]) => n + Object.keys(r.doc?.cells || {}).length, 0),
      log: fridgeRooms.reduce((n, [, r]) => n + (r.log || []).length, 0),
    } : null,
```
- In the write section, after the `withConfig` block:
```js
  for (const [roomId, r] of fridgeRooms) {
    const ref = center.collection('fridge').doc(roomId);
    if (r.doc) set(ref, r.doc);
    for (const e of r.log || []) set(ref.collection('log').doc(String(e.id)), stripId(e));
  }
```

`backend/scripts/restoreBackup.js`:
- Usage line: `... [--farmer <name>] [--with-config] [--with-fridge]`
- Call: `{ execute, farmer: value('--farmer') || null, withConfig: flag('--with-config'), withFridge: flag('--with-fridge') }`

`backend/services/seasonReset.js`:
- Header comment: add `the fridge map (rooms + move log; with --farmer only that farmer's cells)` to the cleared list.
- Add at top: `const { FirestoreFridgeRepository } = require('../repositories/FirestoreFridgeRepository');`
- After the `farmerEvents` count:
```js
  const fridgeRefs = await center.collection('fridge').listDocuments();
  let fridgeCells = 0;
  let fridgeLog = 0;
  for (const ref of fridgeRefs) {
    const snap = await ref.get();
    const cells = Object.values(snap.exists ? (snap.data().cells || {}) : {});
    fridgeCells += farmer ? cells.filter(c => c.farmer === farmer).length : cells.length;
    if (!farmer) fridgeLog += (await ref.collection('log').count().get()).data().count;
  }
```
- `summary` gets `fridgeCells, fridgeLog` after `farmerEvents`.
- In the execute branch: in the `if (farmer)` block add
```js
    const fridgeRepo = new FirestoreFridgeRepository(db, centerId);
    for (const ref of fridgeRefs) await fridgeRepo.clearFarmer(ref.id, farmer);
```
and in the `else` block add `await db.recursiveDelete(center.collection('fridge'));`

`NEW_SEASON.md` — where it lists what the reset deletes, add "the fridge map (all rooms and their move log; `--farmer` removes only that farmer's slots)"; where it describes restore flags, add "`--with-fridge` also restores the fridge map (full restores only; refuses a non-empty room/log)".

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then the whole suite `cd backend && npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/backupService.js backend/services/backupRestore.js backend/scripts/restoreBackup.js backend/services/seasonReset.js NEW_SEASON.md backend/tests/backupPayload.test.js backend/tests/backupRestore.test.js backend/tests/seasonReset.test.js
git commit -m "feat(fridge): backup, restore (--with-fridge) and season reset cover the fridge"
```

---

### Task 6: Frontend pure helpers + API client

**Files:**
- Create: `frontend/src/utils/fridgeView.js`, `frontend/src/api/fridge.js`
- Modify: `frontend/src/api/records.js` (add `listRecords`)
- Test: `frontend/tests/fridgeView.test.js`

**Interfaces:**
- Consumes: `call(method, path, body)` from `src/api/http.js`.
- Produces:
  - `COLS = ['A','B','C','D','E']`, `ROWS = 8`, `CAPACITY = 40`, `ROOM_ID = 'main'`
  - `palletKey(farmer, palletNumber): string`
  - `eligiblePallets(records, farmer, cells, query?): Array<{ palletNumber, kinds: string[], boxes: number, mixed: boolean, mark: boolean, weightMissing: boolean }>` sorted by number
  - `roomStats(cells): { occupied, capacity, rate, level: 'low'|'mid'|'high', perFarmer: Array<{ farmer, count }> }`
  - `FLAG_LABELS: { sent, partly_sent, deleted, missing }` (Hebrew), `isFlagged(summary): boolean`
  - `farmerTints(farmers: string[], cells): { [farmer]: string }` (Tailwind class string)
  - `getRoom(roomId)`, `postOp(roomId, op)` (`api/fridge.js`)
  - `listRecords(farmer): Promise<Record[]>` (`api/records.js`)

- [ ] **Step 1: Write the failing tests**

`frontend/tests/fridgeView.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { eligiblePallets, roomStats, isFlagged, farmerTints, palletKey, CAPACITY } from '../src/utils/fridgeView.js';

const r = (palletNumber, o = {}) => ({ id: `${palletNumber}-${Math.random()}`, palletNumber, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false, mark: false, ...o });

describe('eligiblePallets', () => {
  it('excludes deleted, fully sent and already placed pallets; one entry per mixed pallet; marked and partly sent included', () => {
    const records = [r(1), r(2, { sent: true }), r(3, { deleted: true }), r(4), r(4, { kind: 'קיט', boxes: 10, weight: 0 }),
      r(5, { mark: true }), r(6, { sent: true }), r(6), r(7)];
    const cells = { A1: { farmer: 'א', palletNumber: 7 }, A2: { farmer: 'ב', palletNumber: 1 } };
    const out = eligiblePallets(records, 'א', cells);
    expect(out.map(p => p.palletNumber)).toEqual([1, 4, 5, 6]);
    expect(out.find(p => p.palletNumber === 4)).toEqual({ palletNumber: 4, kinds: ['שלי', 'קיט'], boxes: 50, mixed: true, mark: false, weightMissing: true });
    expect(out.find(p => p.palletNumber === 5).mark).toBe(true);
  });
  it('filters by pallet-number substring and sorts numerically', () => {
    const out = eligiblePallets([r(112), r(12), r(3)], 'א', {}, ' 12 ');
    expect(out.map(p => p.palletNumber)).toEqual([12, 112]);
  });
  it('placed check compares numbers as strings', () => {
    expect(eligiblePallets([r(9)], 'א', { B1: { farmer: 'א', palletNumber: '9' } })).toEqual([]);
  });
});

describe('roomStats', () => {
  const cellsOf = (n, farmer = 'א') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`S${i}`, { farmer, palletNumber: i }]));
  it('levels: <50% low, <85% mid, else high', () => {
    expect(roomStats({}).level).toBe('low');
    expect(roomStats(cellsOf(19)).level).toBe('low');
    expect(roomStats(cellsOf(20)).level).toBe('mid');
    expect(roomStats(cellsOf(34)).level).toBe('high');
    const full = roomStats(cellsOf(CAPACITY));
    expect(full).toMatchObject({ occupied: 40, capacity: 40, rate: 100, level: 'high' });
  });
  it('per-farmer counts, largest first', () => {
    const cells = { A1: { farmer: 'א' }, A2: { farmer: 'ב' }, A3: { farmer: 'ב' } };
    expect(roomStats(cells).perFarmer).toEqual([{ farmer: 'ב', count: 2 }, { farmer: 'א', count: 1 }]);
  });
});

describe('flags, tints, keys', () => {
  it('isFlagged for sent / partly_sent / deleted / missing only', () => {
    expect(['ok', 'sent', 'partly_sent', 'deleted', 'missing'].map(status => isFlagged({ status }))).toEqual([false, true, true, true, true]);
    expect(isFlagged(undefined)).toBe(false);
  });
  it('tints are stable by farmer-list position and cover farmers not in the list', () => {
    const t = farmerTints(['א', 'ב'], { A1: { farmer: 'ג' } });
    expect(t['א']).not.toBe(t['ב']);
    expect(typeof t['ג']).toBe('string');
    expect(farmerTints(['א', 'ב'], {})['א']).toBe(t['א']);
  });
  it('palletKey', () => { expect(palletKey('א', 3)).toBe('א__3'); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/fridgeView.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/utils/fridgeView.js`:
```js
// fridgeView.js — pure helpers for the fridge (cold-room) page: which pallets can be placed, room
// stats, status flags and per-farmer tints. No Vue, no I/O. The grid itself is fixed (room 'main', 5×8).
export const ROOM_ID = 'main';
export const COLS = ['A', 'B', 'C', 'D', 'E'];
export const ROWS = 8;
export const CAPACITY = COLS.length * ROWS;

export const palletKey = (farmer, palletNumber) => `${farmer}__${palletNumber}`;

const uniq = (values) => [...new Set(values.filter(v => v !== '' && v != null))];

// A farmer's pallets that can go into the fridge: not deleted, not fully sent, not already on the map.
// A mixed pallet (several records, one number) is one entry. Marked / partly sent pallets are included.
export function eligiblePallets(records, farmer, cells, query = '') {
  const placed = new Set(Object.values(cells).filter(c => c.farmer === farmer).map(c => String(c.palletNumber)));
  const q = String(query).trim();
  const groups = new Map();
  for (const r of records) {
    if (r.deleted === true) continue;
    const k = String(r.palletNumber);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [k, recs] of groups) {
    if (placed.has(k) || recs.every(r => r.sent === true)) continue;
    if (q && !k.includes(q)) continue;
    out.push({
      palletNumber: recs[0].palletNumber,
      kinds: uniq(recs.map(r => r.kind)),
      boxes: recs.reduce((n, r) => n + (Number(r.boxes) || 0), 0),
      mixed: recs.length > 1,
      mark: recs.some(r => r.mark === true),
      weightMissing: recs.some(r => !(Number(r.weight) > 0)),
    });
  }
  return out.sort((a, b) => Number(a.palletNumber) - Number(b.palletNumber));
}

export function roomStats(cells) {
  const list = Object.values(cells);
  const occupied = list.length;
  const rate = (occupied / CAPACITY) * 100;
  const counts = new Map();
  list.forEach(c => counts.set(c.farmer, (counts.get(c.farmer) || 0) + 1));
  const perFarmer = [...counts].map(([farmer, count]) => ({ farmer, count })).sort((a, b) => b.count - a.count);
  return { occupied, capacity: CAPACITY, rate, level: rate < 50 ? 'low' : rate < 85 ? 'mid' : 'high', perFarmer };
}

export const FLAG_LABELS = { sent: 'נשלח', partly_sent: 'נשלח חלקית', deleted: 'נמחק', missing: 'לא נמצא' };
export const isFlagged = (summary) => !!summary && summary.status in FLAG_LABELS;

// Literal class strings so Tailwind keeps them.
const TINTS = [
  'bg-sky-50 border-sky-300', 'bg-emerald-50 border-emerald-300', 'bg-violet-50 border-violet-300',
  'bg-orange-50 border-orange-300', 'bg-pink-50 border-pink-300', 'bg-teal-50 border-teal-300',
  'bg-lime-50 border-lime-300', 'bg-indigo-50 border-indigo-300',
];
export function farmerTints(farmers, cells) {
  const names = [...farmers];
  Object.values(cells).forEach(c => { if (!names.includes(c.farmer)) names.push(c.farmer); });
  return Object.fromEntries(names.map((f, i) => [f, TINTS[i % TINTS.length]]));
}
```

`frontend/src/api/fridge.js`:
```js
import { call } from './http';

const f = encodeURIComponent;
// Room + live pallet summaries: { cells, updatedAt, updatedBy, pallets }.
export const getRoom = (roomId) => call('GET', `/fridge/${f(roomId)}`);
// op: {op:'place', slot, farmer, palletNumber} | {op:'move', from, to} | {op:'clear', slot}. Returns the room.
export const postOp = (roomId, op) => call('POST', `/fridge/${f(roomId)}/ops`, op);
```

`frontend/src/api/records.js` — add:
```js
export const listRecords = async (farmer) => (await call('GET', `/farmers/${f(farmer)}/records`)).data || [];
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/fridgeView.js frontend/src/api/fridge.js frontend/src/api/records.js frontend/tests/fridgeView.test.js
git commit -m "feat(fridge): frontend view helpers and API client"
```

---

### Task 7: `useFridgeRoom` composable — live room + summary refresh

**Files:**
- Create: `frontend/src/composables/useFridgeRoom.js`

**Interfaces:**
- Consumes: `db` from `src/main`, `centerId` from `composables/useCenter`, `getRoom` / `postOp` (Task 6), `palletKey` (Task 6).
- Produces: `useFridgeRoom(roomId = 'main') → { cells: Ref<object>, pallets: Ref<object>, loading: Ref<boolean>, error: Ref<Error|null>, refresh(): Promise<void>, run(op): Promise<room> }` — `run` rejects with the API error (`e.message` is the Hebrew text, `e.data.code` the code).

No unit test (Firestore listeners; covered by the Task 9 e2e "live on a second client" and "sent turns red live" tests).

- [ ] **Step 1: Implement**

`frontend/src/composables/useFridgeRoom.js`:
```js
import { ref, watch, onUnmounted } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../main'
import { centerId } from './useCenter'
import { getRoom, postOp } from '../api/fridge'
import { palletKey } from '../utils/fridgeView'

// Live fridge room: cells come from an onSnapshot on centers/{c}/fridge/{roomId}; the pallet summaries
// (sent / deleted / weight ...) come from GET /api/fridge/:roomId and are refetched when a cell shows a
// pallet without a summary, or when a farmer_events doc changes for a farmer on the map.
export function useFridgeRoom(roomId = 'main') {
  const cells = ref({})
  const pallets = ref({})
  const loading = ref(true)
  const error = ref(null)
  let unsubRoom = null
  const farmerUnsubs = new Map()
  let timer = null

  function apply(room) {
    cells.value = room.cells || {}
    pallets.value = room.pallets || {}
    syncFarmerListeners()
  }

  async function refresh() {
    try {
      apply(await getRoom(roomId))
      error.value = null
    } catch (e) {
      console.error('[useFridgeRoom] refresh failed', e)
      error.value = e
    } finally {
      loading.value = false
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer)
    timer = setTimeout(refresh, 400)
  }

  function stopFarmerListeners() {
    farmerUnsubs.forEach(u => u())
    farmerUnsubs.clear()
  }

  function syncFarmerListeners() {
    if (!centerId.value) return
    const wanted = new Set(Object.values(cells.value).map(c => c.farmer))
    for (const [f, unsub] of farmerUnsubs) if (!wanted.has(f)) { unsub(); farmerUnsubs.delete(f) }
    for (const f of wanted) {
      if (farmerUnsubs.has(f)) continue
      let first = true // the first fire replays the current doc, not a change
      farmerUnsubs.set(f, onSnapshot(doc(db, 'centers', centerId.value, 'farmer_events', f),
        () => { if (first) { first = false; return } scheduleRefresh() },
        e => console.error(`[useFridgeRoom] farmer_events/${f} listener`, e)))
    }
  }

  function subscribeRoom() {
    if (unsubRoom) { unsubRoom(); unsubRoom = null }
    stopFarmerListeners()
    if (!centerId.value) return
    unsubRoom = onSnapshot(doc(db, 'centers', centerId.value, 'fridge', roomId), snap => {
      cells.value = snap.exists() ? (snap.data().cells || {}) : {}
      syncFarmerListeners()
      const unknown = Object.values(cells.value).some(c => !pallets.value[palletKey(c.farmer, c.palletNumber)])
      if (unknown) scheduleRefresh()
    }, e => { console.error('[useFridgeRoom] room listener', e); error.value = e })
  }

  async function run(op) {
    const room = await postOp(roomId, op)
    apply(room)
    return room
  }

  watch(centerId, subscribeRoom, { immediate: true })
  refresh()

  onUnmounted(() => {
    if (unsubRoom) unsubRoom()
    stopFarmerListeners()
    clearTimeout(timer)
  })

  return { cells, pallets, loading, error, refresh, run }
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npx vite build`
Expected: build succeeds (the composable is not imported yet; this only checks syntax once Task 8 imports it — if tree-shaken, rely on Task 8's build).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useFridgeRoom.js
git commit -m "feat(fridge): useFridgeRoom live room composable"
```

---

### Task 8: Fridge page, components, route and menu entry

**Files:**
- Create: `frontend/src/components/FridgeLayout.vue`
- Create: `frontend/src/components/fridge/FridgeGrid.vue`, `FridgeSlot.vue`, `FridgePlacePanel.vue`, `FridgeStats.vue`
- Modify: `frontend/src/router.js` (route `/Fridge`)
- Modify: `frontend/src/App.vue` (`routes` array, after `/Certificates`, line ~307)

**Interfaces:**
- Consumes: `useFridgeRoom` (Task 7); `COLS`, `ROWS`, `ROOM_ID`, `palletKey`, `eligiblePallets`, `roomStats`, `FLAG_LABELS`, `isFlagged`, `farmerTints` (Task 6); `listRecords` (Task 6); `requestConfirm` from `composables/useDialogs`; `useNotification`; `LoadingState`, `ErrorState`; `inject('config')` (`config.farmers`: active farmer names), `inject('selectedFarmer')`.
- Produces DOM hooks used by Task 9: each slot `div[data-slot="A1"][data-state="empty|occupied"][data-status="<summary status or ''>"]`; each pick button `button[data-pallet="<number>"]`; farmer `<select aria-label="חקלאי">`; search `<input aria-label="חיפוש משטח">`; slot sheet `role="dialog"` with buttons `העבר`, `פנה תא`, `סגור`; flagged slots contain a `פנה תא` button; menu link label `מקרר`.

- [ ] **Step 1: `FridgeSlot.vue`**

```vue
<template>
  <div role="button" tabindex="0" :aria-label="`תא ${slotId}`" :data-slot="slotId" :data-state="cell ? 'occupied' : 'empty'"
    :data-status="summary?.status || ''" @click="$emit('select', slotId)" @keydown.enter="$emit('select', slotId)"
    :class="['relative h-full min-h-0 rounded-xl border-2 p-1.5 flex flex-col justify-between overflow-hidden cursor-pointer select-none transition-colors',
      !cell ? (targeting ? 'border-dashed border-mango-400 bg-mango-50' : 'border-dashed border-slate-300 bg-white/80')
        : flagged ? 'border-red-400 bg-red-50' : tint,
      selected ? 'ring-4 ring-blue-500' : '']">
    <span class="absolute top-0.5 left-1 text-[10px] font-bold font-mono text-slate-400">{{ slotId }}</span>
    <template v-if="cell">
      <div class="text-[11px] font-bold text-slate-600 truncate">{{ cell.farmer }}</div>
      <div class="text-lg font-extrabold leading-none text-slate-900">{{ cell.palletNumber }}</div>
      <div v-if="summary && summary.kinds.length" class="text-[11px] text-slate-600 truncate">
        {{ summary.kinds.join('/') }} · {{ summary.sizes.join('/') }} · {{ summary.boxes }} ארגזים
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <span v-if="flagged" class="rounded bg-red-600 px-1 text-[10px] font-bold text-white">{{ flagLabel }}</span>
        <span v-if="summary?.mark && !flagged" class="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">סומן למשלוח</span>
        <span v-if="summary?.weightMissing && !flagged" class="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">חסר משקל</span>
        <button v-if="flagged" type="button" @click.stop="$emit('clear', slotId)"
          class="mr-auto rounded border border-red-300 bg-white px-1.5 text-[10px] font-bold text-red-700">פנה תא</button>
      </div>
    </template>
  </div>
</template>

<script>
import { FLAG_LABELS, isFlagged } from '../../utils/fridgeView';

export default {
  emits: ['select', 'clear'],
  props: {
    slotId: { type: String, required: true }, // not `slot`: reserved-looking attribute on components
    cell: { type: Object, default: null },
    summary: { type: Object, default: null },
    tint: { type: String, default: 'bg-white border-slate-300' },
    selected: { type: Boolean, default: false },
    targeting: { type: Boolean, default: false },
  },
  computed: {
    flagged() { return isFlagged(this.summary); },
    flagLabel() { return this.summary ? FLAG_LABELS[this.summary.status] : ''; },
  },
};
</script>
```

- [ ] **Step 2: `FridgeGrid.vue`**

```vue
<template>
  <div class="h-full flex flex-col gap-1.5">
    <div class="grid grid-cols-[2rem_repeat(5,minmax(0,1fr))] gap-1.5 text-center text-xs font-bold text-slate-400">
      <div></div>
      <div v-for="c in cols" :key="c">{{ c }}</div>
    </div>
    <div class="flex-1 min-h-0 grid grid-rows-8 gap-1.5">
      <div v-for="r in rows" :key="r" class="grid grid-cols-[2rem_repeat(5,minmax(0,1fr))] gap-1.5 min-h-0">
        <div class="flex items-center justify-center text-sm font-bold text-slate-500">{{ r }}</div>
        <FridgeSlot v-for="c in cols" :key="c + r" :slot-id="c + r" :cell="cells[c + r] || null"
          :summary="summaryFor(cells[c + r])" :tint="cells[c + r] ? tints[cells[c + r].farmer] : undefined"
          :selected="selectedSlot === c + r" :targeting="targeting"
          @select="$emit('select', $event)" @clear="$emit('clear', $event)" />
      </div>
    </div>
    <div class="rounded-xl bg-slate-200 py-1.5 text-center text-xs font-bold tracking-widest text-slate-500">מעבר</div>
  </div>
</template>

<script>
import FridgeSlot from './FridgeSlot.vue';
import { COLS, ROWS, palletKey } from '../../utils/fridgeView';

export default {
  components: { FridgeSlot },
  emits: ['select', 'clear'],
  props: {
    cells: { type: Object, required: true },
    pallets: { type: Object, required: true },
    tints: { type: Object, required: true },
    selectedSlot: { type: String, default: null },
    targeting: { type: Boolean, default: false },
  },
  setup() {
    return { cols: COLS, rows: Array.from({ length: ROWS }, (_, i) => i + 1) };
  },
  methods: {
    summaryFor(cell) { return cell ? this.pallets[palletKey(cell.farmer, cell.palletNumber)] || null : null; },
  },
};
</script>
```

- [ ] **Step 3: `FridgePlacePanel.vue`**

```vue
<template>
  <div class="h-full min-h-0 flex flex-col gap-2">
    <h2 class="text-sm font-bold text-slate-700">שיבוץ משטח</h2>
    <select v-model="farmer" aria-label="חקלאי" class="select-field">
      <option v-for="f in farmers" :key="f" :value="f">{{ f }}</option>
    </select>
    <input v-model="query" type="search" inputmode="numeric" placeholder="מספר משטח" aria-label="חיפוש משטח" class="input-field" />
    <div class="flex-1 min-h-0 overflow-auto flex flex-col gap-1.5">
      <p v-if="loading" class="py-4 text-center text-sm text-slate-400">טוען משטחים...</p>
      <p v-else-if="!eligible.length" class="py-4 text-center text-sm text-slate-400">אין משטחים זמינים לשיבוץ</p>
      <button v-for="p in eligible" :key="p.palletNumber" type="button" :data-pallet="p.palletNumber"
        @click="$emit('pick', { farmer, palletNumber: p.palletNumber })"
        :class="['tap-target flex items-center gap-2 rounded-xl border px-3 py-2 text-right text-sm transition-colors',
          isPicked(p) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-mango-300']">
        <span class="font-mono font-bold">{{ p.palletNumber }}</span>
        <span class="truncate">{{ p.kinds.join('/') }} · {{ p.boxes }} ארגזים</span>
        <span v-if="p.mixed" class="rounded bg-slate-100 px-1 text-[10px] text-slate-600">מעורב</span>
        <span v-if="p.weightMissing" class="rounded bg-amber-100 px-1 text-[10px] text-amber-800">חסר משקל</span>
      </button>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { listRecords } from '../../api/records';
import { eligiblePallets } from '../../utils/fridgeView';
import { useNotification } from '../../composables/useNotification';

export default {
  emits: ['pick'],
  props: {
    farmers: { type: Array, required: true },
    cells: { type: Object, required: true },
    picked: { type: Object, default: null },
    defaultFarmer: { type: String, default: '' },
  },
  setup(props) {
    const { notify } = useNotification();
    const farmer = ref(props.defaultFarmer || props.farmers[0] || '');
    const query = ref('');
    const records = ref([]);
    const loading = ref(false);

    async function load() {
      if (!farmer.value) { records.value = []; return; }
      loading.value = true;
      try { records.value = await listRecords(farmer.value); }
      catch (e) { notify(e.message || 'טעינת המשטחים נכשלה', 'error'); records.value = []; }
      finally { loading.value = false; }
    }
    watch(farmer, load, { immediate: true });
    watch(() => props.farmers, (list) => { if (!farmer.value && list.length) farmer.value = list[0]; });

    const eligible = computed(() => eligiblePallets(records.value, farmer.value, props.cells, query.value));
    const isPicked = (p) => props.picked && props.picked.farmer === farmer.value && String(props.picked.palletNumber) === String(p.palletNumber);
    return { farmer, query, loading, eligible, isPicked, reload: load };
  },
};
</script>
```

- [ ] **Step 4: `FridgeStats.vue`**

```vue
<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-4">
      <div class="relative h-20 w-20 shrink-0">
        <svg class="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="transparent" stroke-width="6" class="stroke-slate-100" />
          <circle cx="40" cy="40" r="34" fill="transparent" stroke-width="6" stroke-linecap="round" :class="ringClass"
            :stroke-dasharray="circumference" :stroke-dashoffset="circumference * (1 - stats.rate / 100)" />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-lg font-bold leading-none text-slate-800" data-testid="fridge-occupied">{{ stats.occupied }}</span>
          <span class="text-[10px] text-slate-400">מתוך {{ stats.capacity }}</span>
        </div>
      </div>
      <div>
        <div class="text-xs font-bold text-slate-400">תפוסה</div>
        <div class="text-2xl font-extrabold text-slate-800">{{ Math.round(stats.rate) }}%</div>
      </div>
    </div>
    <div v-if="stats.perFarmer.length" class="flex flex-col gap-1 text-xs">
      <div v-for="f in stats.perFarmer" :key="f.farmer" class="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
        <span class="truncate font-bold text-slate-700">{{ f.farmer }}</span>
        <span class="rounded bg-slate-200 px-1.5 font-bold text-slate-800">{{ f.count }}</span>
      </div>
    </div>
    <p v-else class="text-center text-sm text-slate-400">המקרר ריק</p>
  </div>
</template>

<script>
import { roomStats } from '../../utils/fridgeView';

const RING = { low: 'stroke-emerald-500', mid: 'stroke-amber-500', high: 'stroke-red-500' };

export default {
  props: { cells: { type: Object, required: true } },
  computed: {
    stats() { return roomStats(this.cells); },
    ringClass() { return RING[this.stats.level]; },
    circumference() { return 2 * Math.PI * 34; },
  },
};
</script>
```

- [ ] **Step 5: `FridgeLayout.vue` (page)**

```vue
<template>
  <div class="h-full flex flex-col gap-3 text-right" dir="rtl">
    <div class="flex shrink-0 items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-slate-800">מקרר</h1>
      <div v-if="banner" :class="['flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-bold', banner.cls]">
        <span>{{ banner.text }}</span>
        <button type="button" @click="resetMode" class="rounded border bg-white px-2 py-0.5 text-xs">ביטול</button>
      </div>
    </div>

    <LoadingState v-if="loading" message="טוען את המקרר..." />
    <ErrorState v-else-if="error && !Object.keys(cells).length" title="טעינת המקרר נכשלה" :message="error.message || ''" @retry="refresh" />
    <div v-else class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_18rem] gap-3">
      <div class="min-h-0 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <FridgeGrid :cells="cells" :pallets="pallets" :tints="tints" :selected-slot="mode === 'moving' ? moveFrom : null"
          :targeting="mode !== 'idle'" @select="onSlot" @clear="clearSlot" />
      </div>
      <aside class="min-h-0 flex flex-col gap-3">
        <div class="card flex-1 min-h-0">
          <FridgePlacePanel ref="panel" :farmers="farmers" :cells="cells" :picked="picked" :default-farmer="selectedFarmer" @pick="onPick" />
        </div>
        <div class="card"><FridgeStats :cells="cells" /></div>
      </aside>
    </div>

    <div v-if="detail && detailCell" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" @click.self="detail = null">
      <div role="dialog" :aria-label="`תא ${detail}`" class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 class="mb-3 text-base font-bold text-slate-800">תא {{ detail }} · משטח {{ detailCell.palletNumber }}</h3>
        <dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-slate-500">חקלאי</dt><dd>{{ detailCell.farmer }}</dd>
          <template v-if="detailSummary && detailSummary.kinds.length">
            <dt class="text-slate-500">זן / גודל</dt><dd>{{ detailSummary.kinds.join('/') }} · {{ detailSummary.sizes.join('/') }}</dd>
            <dt class="text-slate-500">ארגזים</dt><dd>{{ detailSummary.boxes }}</dd>
          </template>
          <dt class="text-slate-500">מצב</dt><dd>{{ statusLabel }}</dd>
          <dt class="text-slate-500">שובץ</dt><dd>{{ detailCell.placedBy }} · {{ placedAtText }}</dd>
        </dl>
        <div class="flex gap-2">
          <button type="button" class="btn-primary" @click="startMove">העבר</button>
          <button type="button" class="btn-danger" @click="clearSlot(detail)">פנה תא</button>
          <button type="button" class="btn-ghost" @click="detail = null">סגור</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, inject } from 'vue';
import LoadingState from './shared/LoadingState.vue';
import ErrorState from './shared/ErrorState.vue';
import FridgeGrid from './fridge/FridgeGrid.vue';
import FridgePlacePanel from './fridge/FridgePlacePanel.vue';
import FridgeStats from './fridge/FridgeStats.vue';
import { useFridgeRoom } from '../composables/useFridgeRoom';
import { useNotification } from '../composables/useNotification';
import { requestConfirm } from '../composables/useDialogs';
import { ROOM_ID, palletKey, farmerTints, FLAG_LABELS } from '../utils/fridgeView';

export default {
  components: { LoadingState, ErrorState, FridgeGrid, FridgePlacePanel, FridgeStats },
  setup() {
    const config = inject('config');
    const selectedFarmer = inject('selectedFarmer', ref(''));
    const { notify } = useNotification();
    const { cells, pallets, loading, error, refresh, run } = useFridgeRoom(ROOM_ID);

    const mode = ref('idle'); // 'idle' | 'placing' | 'moving'
    const picked = ref(null); // { farmer, palletNumber } while placing
    const moveFrom = ref(null);
    const detail = ref(null); // slot whose sheet is open
    const busy = ref(false);
    const panel = ref(null);

    const farmers = computed(() => config.farmers || []);
    const tints = computed(() => farmerTints(farmers.value, cells.value));
    const detailCell = computed(() => (detail.value ? cells.value[detail.value] : null));
    const detailSummary = computed(() => (detailCell.value ? pallets.value[palletKey(detailCell.value.farmer, detailCell.value.palletNumber)] : null));
    const statusLabel = computed(() => FLAG_LABELS[detailSummary.value?.status] || 'במקרר');
    const placedAtText = computed(() => (detailCell.value?.placedAt ? new Date(detailCell.value.placedAt).toLocaleString('he-IL') : ''));
    const banner = computed(() => {
      if (mode.value === 'placing') return { text: `נבחר משטח ${picked.value.palletNumber} (${picked.value.farmer}) — הקש על תא פנוי`, cls: 'border-blue-200 bg-blue-50 text-blue-800' };
      if (mode.value === 'moving') return { text: `העברת משטח מתא ${moveFrom.value} — הקש על תא פנוי`, cls: 'border-amber-200 bg-amber-50 text-amber-800' };
      return null;
    });

    function resetMode() { mode.value = 'idle'; picked.value = null; moveFrom.value = null; }

    // One operation at a time; on any error show the server's Hebrew message and re-read the room.
    async function send(op, okMessage) {
      if (busy.value) return;
      busy.value = true;
      try {
        await run(op);
        notify(okMessage, 'success');
        resetMode();
      } catch (e) {
        notify(e.message || 'הפעולה נכשלה', 'error');
        resetMode();
        refresh();
        panel.value?.reload();
      } finally {
        busy.value = false;
      }
    }

    function onPick(p) { mode.value = 'placing'; picked.value = p; moveFrom.value = null; }

    function onSlot(slot) {
      const occupied = !!cells.value[slot];
      if (mode.value === 'placing') {
        if (occupied) return; // banner says: tap an empty slot
        const { farmer, palletNumber } = picked.value;
        return send({ op: 'place', slot, farmer, palletNumber }, `משטח ${palletNumber} שובץ בתא ${slot}`);
      }
      if (mode.value === 'moving') {
        if (slot === moveFrom.value) return resetMode();
        if (occupied) return;
        return send({ op: 'move', from: moveFrom.value, to: slot }, `המשטח הועבר לתא ${slot}`);
      }
      if (occupied) detail.value = slot;
    }

    function startMove() { moveFrom.value = detail.value; mode.value = 'moving'; picked.value = null; detail.value = null; }

    async function clearSlot(slot) {
      detail.value = null;
      const c = cells.value[slot];
      if (!c) return;
      const ok = await requestConfirm({ title: 'פינוי תא', message: `לפנות את תא ${slot} (משטח ${c.palletNumber}, ${c.farmer})?`, variant: 'red' });
      if (ok) send({ op: 'clear', slot }, `תא ${slot} פונה`);
    }

    return {
      cells, pallets, loading, error, refresh, mode, picked, moveFrom, detail, panel,
      farmers, tints, detailCell, detailSummary, statusLabel, placedAtText, banner, selectedFarmer,
      resetMode, onPick, onSlot, startMove, clearSlot,
    };
  },
};
</script>
```

- [ ] **Step 6: Route + menu**

`frontend/src/router.js`: add `import FridgeLayout from "./components/FridgeLayout.vue";` with the other imports and, after the `/Certificates` route:
```js
  { path: "/Fridge", name: "Fridge", component: FridgeLayout, meta: { requiresAuth: true } },
```
`frontend/src/App.vue` `routes` array, after the `/Certificates` entry:
```js
      { path: '/Fridge', label: 'מקרר', role: 'user' },
```

- [ ] **Step 7: Build and manual check**

Run: `cd frontend && npm test && npx vite build` — expected green and a successful build.
Then (local-dev skill) start the emulator stack with `cd backend && npm run local:test`, sign in, open מקרר at 1280×800: place a pallet, move it, clear it; check the 40 slots + aisle strip fit without page scroll.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/FridgeLayout.vue frontend/src/components/fridge frontend/src/router.js frontend/src/App.vue
git commit -m "feat(fridge): fridge map page with place/move/clear and live updates"
```

---

### Task 9: Playwright e2e

**Files:**
- Create: `frontend/e2e/fridge.spec.js`
- Modify: `frontend/e2e/helpers.js` (add fridge helpers)

**Interfaces:**
- Consumes: DOM hooks from Task 8; `signIn`, `navTo`, `intakePallet`, `editRow`, `uniquePalletNumber`, `FARMER`, `DESTINATION`, `SECOND_ADMIN_EMAIL` from `e2e/helpers.js`.
- Produces: `openFridge(page)`, `slotOf(page, slot)`, `placeOnFirstEmpty(page, palletNumber): Promise<string>` (slot id), `clearSlot(page, slot)` in `e2e/helpers.js`.

The e2e stack reuses `centers/test` across runs, so every test clears the slots it used (the room has 40).

- [ ] **Step 1: Helpers**

Append to `frontend/e2e/helpers.js`:
```js
// --- Fridge map ---------------------------------------------------------------
export async function openFridge(page) {
  await navTo(page, 'מקרר');
  await expect(page.getByRole('heading', { name: 'מקרר' })).toBeVisible();
  await expect(page.locator('[data-slot]')).toHaveCount(40);
}

export const slotOf = (page, slot) => page.locator(`[data-slot="${slot}"]`);

// Pick the pallet in the side panel, tap the first empty slot; returns that slot id.
export async function placeOnFirstEmpty(page, palletNumber) {
  await page.getByLabel('חקלאי').selectOption(FARMER);
  await page.getByLabel('חיפוש משטח').fill(String(palletNumber));
  await page.locator(`button[data-pallet="${palletNumber}"]`).click();
  const empty = page.locator('[data-slot][data-state="empty"]').first();
  const slot = await empty.getAttribute('data-slot');
  await empty.click();
  await expect(slotOf(page, slot)).toContainText(String(palletNumber));
  return slot;
}

export async function clearSlot(page, slot) {
  await slotOf(page, slot).click();
  await page.getByRole('dialog').getByRole('button', { name: 'פנה תא' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(slotOf(page, slot)).toHaveAttribute('data-state', 'empty');
}
```

- [ ] **Step 2: Specs**

`frontend/e2e/fridge.spec.js`:
```js
// Fridge map: place / move / clear, live updates on a second client, and the red "sent" flag.
import { test, expect } from '@playwright/test';
import { SECOND_ADMIN_EMAIL, DESTINATION, signIn, navTo, intakePallet, editRow, uniquePalletNumber,
  openFridge, slotOf, placeOnFirstEmpty, clearSlot } from './helpers.js';

test('place, move and clear a pallet', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await openFridge(page);

  const from = await placeOnFirstEmpty(page, pallet);
  await expect(slotOf(page, from)).toHaveAttribute('data-status', 'ok');
  // Placed pallets leave the pick list.
  await expect(page.locator(`button[data-pallet="${pallet}"]`)).toHaveCount(0);

  await slotOf(page, from).click();
  await page.getByRole('dialog').getByRole('button', { name: 'העבר' }).click();
  const target = page.locator('[data-slot][data-state="empty"]').first();
  const to = await target.getAttribute('data-slot');
  await target.click();
  await expect(slotOf(page, to)).toContainText(String(pallet));
  await expect(slotOf(page, from)).toHaveAttribute('data-state', 'empty');

  await page.reload();
  await expect(slotOf(page, to)).toContainText(String(pallet));
  await clearSlot(page, to);
});

test('a placement appears on a second client without reload', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  await signIn(a);
  await signIn(b, SECOND_ADMIN_EMAIL);
  await intakePallet(a, pallet);
  await openFridge(a);
  await openFridge(b);

  const slot = await placeOnFirstEmpty(a, pallet);
  await expect(slotOf(b, slot)).toContainText(String(pallet));
  await clearSlot(a, slot);
  await expect(slotOf(b, slot)).toHaveAttribute('data-state', 'empty');
});

test('a pallet sent elsewhere turns its slot red live, and can be cleared', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  await signIn(a);
  await signIn(b, SECOND_ADMIN_EMAIL);
  await intakePallet(a, pallet);
  await openFridge(b);
  const slot = await placeOnFirstEmpty(b, pallet);

  // Mark it sent on client A (data table editor), while B keeps the fridge open.
  await navTo(a, 'טבלת נתונים');
  const editor = await editRow(a, pallet);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2027-05-10');
  await editor.locator('td[data-col="sent"] input[type="checkbox"]').check();
  await editor.getByRole('button', { name: 'שמור' }).click();

  await expect(slotOf(b, slot)).toHaveAttribute('data-status', 'sent');
  await expect(slotOf(b, slot)).toContainText('נשלח');
  await slotOf(b, slot).getByRole('button', { name: 'פנה תא' }).click();
  await b.getByRole('button', { name: 'אשר' }).click();
  await expect(slotOf(b, slot)).toHaveAttribute('data-state', 'empty');
});
```

- [ ] **Step 3: Run**

Run: `cd frontend && npx playwright test e2e/fridge.spec.js`
Expected: 6 passed (3 tests × `desktop` + `tablet`). Then the full `npm run e2e` — expected all green.
If a spec fails, debug the cause (`superpowers:systematic-debugging`); do not weaken assertions.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/fridge.spec.js frontend/e2e/helpers.js
git commit -m "test(fridge): e2e place/move/clear, live second client, sent flag"
```

---

### Task 10: Docs, board, done log

**Files:**
- Modify: `docs/architecture.md`, `docs/api-reference.md`, `docs/realtime.md`, `docs/redesign-plan.md`, `done.md`

- [ ] **Step 1: `docs/architecture.md`**
- Backend list: add entries for `services/fridgeCore.js` (pure grid rules + summaries), `repositories/FirestoreFridgeRepository.js` (room doc + log, transactional ops, `clearFarmer`; exported as `require('../repositories').fridge`), `controllers/fridgeController.js` + `routes/fridgeRoutes.js` (mounted above the global `/api` chain with its own `verifyFirebaseToken` + `ensureCenterAccess`).
- Frontend list: `components/FridgeLayout.vue` + `components/fridge/*`, `composables/useFridgeRoom.js`, `utils/fridgeView.js`, `api/fridge.js`.
- `backupService` / `backupRestore` / `seasonReset` bullets: mention the fridge (payload `fridge` section; `withFridge`; reset clears rooms + log, `--farmer` only that farmer's cells).
- Firestore tree: add
```
  fridge/{roomId}               { cells: {A1: {farmer, palletNumber, placedBy, placedAt}}, updatedAt, updatedBy }  (room 'main')
    log/{autoId}                { op, farmer, palletNumber, from, to, by, at }
```
  and a table row: `centers/{c}/fridge/{room}` (+ `log`) — fridge map; written by Admin SDK via `FirestoreFridgeRepository` (transactions); client-readable room doc.
- Security rules paragraph: add `centers/{centerId}/fridge/{roomId}` to the client-readable list.

- [ ] **Step 2: `docs/api-reference.md`**
- Frontend routes: `/Fridge` — `FridgeLayout.vue`, `requiresAuth`.
- New "Fridge API" section: the two endpoints with bodies, responses and error codes (`SLOT_TAKEN` 409, `ALREADY_PLACED` 409 `{slot}`, `SLOT_EMPTY` 409, `NOT_FOUND` 404, `ALREADY_SENT` 409, `UNKNOWN_FARMER` 400, `BAD_SLOT`/`BAD_OP` 400, `ROOM_NOT_FOUND` 404), and the `pallets` summary shape with the five statuses.

- [ ] **Step 3: `docs/realtime.md`**
Add a section "Fridge map": the room doc is the live channel (`onSnapshot` on `centers/{c}/fridge/main`, no `farmer_events` emitted by fridge writes); `useFridgeRoom` also listens to `farmer_events/{farmer}` for each farmer on the map and refetches `GET /api/fridge/main` (debounced 400 ms) so a sent / deleted pallet turns red without a reload; no echo suppression (state replace is idempotent).

- [ ] **Step 4: Board + done**
- `docs/redesign-plan.md`: replace the "— | Fridge layout ..." table row with nothing (shipped) once verified, and add `37` to the shipped list in the "Ranked board" heading.
- `done.md`: append an entry "37 — Fridge layout (2026-10-xx)": what shipped, the spec/plan paths, test counts from the final runs, deploy order (rules → backend → frontend) and that it is **not deployed** until the owner asks.

- [ ] **Step 5: Final verification**
Run: `cd backend && npm test` and `cd frontend && npm test && npm run e2e`. All green; copy the pass counts into `done.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md docs/api-reference.md docs/realtime.md docs/redesign-plan.md done.md
git commit -m "docs(fridge): architecture, API, realtime, board and done log"
```

Deployment (rules → backend → frontend via the `deploy` skill) and merging to `main` happen only when the owner asks.
