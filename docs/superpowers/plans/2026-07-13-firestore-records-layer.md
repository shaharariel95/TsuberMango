# Firestore Records Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mango pallet records off Google Sheets onto Firestore behind a storage-agnostic `RecordRepository`, and namespace all tenant data under `centers/tsuberi/…`.

**Architecture:** A `RecordRepository` abstract contract (anchored to controller needs) with a single `FirestoreRepository` implementation selected in `repositories/index.js`. All tenant data (records, audit, config, users, farmer_events) lives under `centers/{centerId}`. `centerId` is a constant `'tsuberi'` surfaced via `/api/auth/me`; real per-tenant resolution and Firestore-rule lockdown are deferred to task 23. `googleSheetsService.js` is deleted at cutover.

**Tech Stack:** Node + Express 5, firebase-admin (Firestore), Vue 3, Vitest + Firebase Emulator (new).

**Spec:** `docs/superpowers/specs/2026-07-13-firestore-records-layer-design.md`

## Global Constraints

- Dev-facing content (code, commits, comments, logs) in **English**; UI text stays **Hebrew/RTL**.
- Record `id` is an **opaque string** (Firestore auto-ID) end to end. No `parseInt`/numeric assumptions on `id`.
- Booleans (`sent`/`gidon`/`mark`) stored/read as **real booleans** (no `'TRUE'` coercion).
- Dates written as canonical ISO `yyyy-mm-dd`.
- `centerId` constant lives in one module: `backend/config/center.js` (`CENTER_ID = process.env.CENTER_ID || 'tsuberi'`). Never hardcode `'tsuberi'` elsewhere.
- Firestore paths (canonical):
  - config doc: `centers/{centerId}/config/global`
  - users: `centers/{centerId}/users/{email}`
  - records: `centers/{centerId}/farmers/{farmer}/records/{autoId}`
  - audit: `centers/{centerId}/farmers/{farmer}/audit/{autoId}`
  - events: `centers/{centerId}/farmer_events/{farmer}`
  - sessions: **unchanged**, top-level (firestore-store).
- Record document fields (no `id` inside the doc; `id` = doc.id on read): `shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination, sent, gidon, mark, editedBy, editedAt`.
- Frequent commits: one per task minimum, following the step's commit line.
- All work on branch `arch-redesign`. Nothing touches production.

---

### Task 1: Scaffolding — center constant, contract, repository skeleton, test harness

**Files:**
- Create: `backend/config/center.js`
- Create: `backend/repositories/RecordRepository.js`
- Create: `backend/repositories/FirestoreRepository.js` (skeleton)
- Create: `backend/repositories/index.js`
- Create: `backend/vitest.config.js`
- Create: `backend/tests/FirestoreRepository.test.js`
- Modify: `backend/package.json` (devDeps + scripts)

**Interfaces:**
- Produces: `CENTER_ID` (string); `RecordRepository` (abstract class); `FirestoreRepository` class with `constructor(db = null, centerId = CENTER_ID)`, a `get db()` lazy accessor, and path helpers `farmerDoc(farmer)`, `recordsCol(farmer)`, `auditCol(farmer)`; `require('./repositories')` → singleton `FirestoreRepository`.

- [ ] **Step 1: Add dev dependencies and test scripts**

Run:
```bash
cd backend && npm install --save-dev vitest firebase-tools
```

Then edit `backend/package.json` `scripts` to add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:emulator": "firebase emulators:exec --only firestore --project demo-tsuber \"vitest run\""
```
(Replace the existing placeholder `"test"` line.)

- [ ] **Step 2: Create the center constant**

Create `backend/config/center.js`:
```js
// Single source of the current tenant id. Real per-subdomain / custom-claims
// resolution is deferred to task 23; for now this is a constant.
const CENTER_ID = process.env.CENTER_ID || 'tsuberi';

module.exports = { CENTER_ID };
```

- [ ] **Step 3: Create the abstract contract**

Create `backend/repositories/RecordRepository.js`:
```js
// Storage-agnostic contract for pallet-record persistence.
// Anchored to what sheetController.js and backupService.js consume — NOT to any
// backend's mechanics — so a future PostgresRepository stays a mechanical swap.
class RecordRepository {
  // eslint-disable-next-line no-unused-vars
  getRecords(farmer) { throw new Error('RecordRepository.getRecords not implemented'); }
  getRecordsByPallet(farmer, palletNumber) { throw new Error('not implemented'); }
  getLastPallet(farmer) { throw new Error('not implemented'); }
  appendRecord(farmer, record) { throw new Error('not implemented'); }
  updateRecord(farmer, id, record) { throw new Error('not implemented'); }
  updateRecords(farmer, ids, records) { throw new Error('not implemented'); }
  updateSentStatus(farmer, ids, value) { throw new Error('not implemented'); }
  updateMarkStatus(farmer, ids, value) { throw new Error('not implemented'); }
  appendAuditLog(farmer, entry) { throw new Error('not implemented'); }
}

module.exports = RecordRepository;
```

- [ ] **Step 4: Create the FirestoreRepository skeleton**

Create `backend/repositories/FirestoreRepository.js`:
```js
const admin = require('firebase-admin');
const RecordRepository = require('./RecordRepository');
const { CENTER_ID } = require('../config/center');

class FirestoreRepository extends RecordRepository {
  constructor(db = null, centerId = CENTER_ID) {
    super();
    this._db = db;
    this.centerId = centerId;
  }

  // Lazy so module load never runs before admin.initializeApp().
  get db() { return this._db || admin.firestore(); }

  centerDoc() { return this.db.collection('centers').doc(this.centerId); }
  farmerDoc(farmer) { return this.centerDoc().collection('farmers').doc(farmer); }
  recordsCol(farmer) { return this.farmerDoc(farmer).collection('records'); }
  auditCol(farmer) { return this.farmerDoc(farmer).collection('audit'); }
}

module.exports = FirestoreRepository;
```

- [ ] **Step 5: Create the injection seam**

Create `backend/repositories/index.js`:
```js
// Selects the active RecordRepository implementation. Future impls (Postgres,
// behind an explicit trigger) swap here only.
const FirestoreRepository = require('./FirestoreRepository');

module.exports = new FirestoreRepository();
```

- [ ] **Step 6: Create vitest config**

Create `backend/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 7: Write the harness smoke test**

Create `backend/tests/FirestoreRepository.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import admin from 'firebase-admin';
import FirestoreRepository from '../repositories/FirestoreRepository.js';

const CENTER = 'test-center';
const FARMER = 'test-farmer';
let db;
let repo;

beforeAll(() => {
  // firebase emulators:exec sets FIRESTORE_EMULATOR_HOST for us.
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-tsuber' });
  }
  db = admin.firestore();
  repo = new FirestoreRepository(db, CENTER);
});

afterAll(async () => {
  await Promise.all(admin.apps.map(app => app.delete()));
});

beforeEach(async () => {
  // Clear the farmer's records + audit between tests.
  for (const col of ['records', 'audit']) {
    const snap = await db.collection('centers').doc(CENTER)
      .collection('farmers').doc(FARMER).collection(col).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  }
});

it('instantiates with an injected db and center id', () => {
  expect(repo.centerId).toBe(CENTER);
  expect(repo.recordsCol(FARMER).path)
    .toBe(`centers/${CENTER}/farmers/${FARMER}/records`);
});
```

- [ ] **Step 8: Run the test against the emulator**

Run: `cd backend && npm run test:emulator`
Expected: the `instantiates…` test PASSES. (If `firebase`/Java is unavailable, install the Firebase CLI / a JDK first — the emulator is required for every repository test in this plan.)

- [ ] **Step 9: Commit**

```bash
git add backend/config/center.js backend/repositories backend/vitest.config.js backend/tests backend/package.json backend/package-lock.json
git commit -m "feat(backend): repository contract + Firestore skeleton + vitest emulator harness"
```

---

### Task 2: FirestoreRepository reads

**Files:**
- Modify: `backend/repositories/FirestoreRepository.js`
- Test: `backend/tests/FirestoreRepository.test.js`

**Interfaces:**
- Consumes: `recordsCol(farmer)` from Task 1.
- Produces: `getRecords(farmer) -> Promise<Record[]>` (each `{ id, ...fields }`); `getRecordsByPallet(farmer, palletNumber) -> Promise<Record[]>` (filtered, may be empty); `getLastPallet(farmer) -> Promise<number>` (highest numeric `palletNumber`, else `0`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/FirestoreRepository.test.js`:
```js
describe('reads', () => {
  it('getRecords returns docs with string id merged in', async () => {
    await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER)
      .collection('records').add({ palletNumber: '5', kind: 'mango', sent: false });
    const recs = await repo.getRecords(FARMER);
    expect(recs).toHaveLength(1);
    expect(typeof recs[0].id).toBe('string');
    expect(recs[0].palletNumber).toBe('5');
  });

  it('getRecordsByPallet filters by palletNumber (string-compared)', async () => {
    const col = db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');
    await col.add({ palletNumber: 5 });
    await col.add({ palletNumber: '7' });
    const hits = await repo.getRecordsByPallet(FARMER, '5');
    expect(hits).toHaveLength(1);
    expect(await repo.getRecordsByPallet(FARMER, '99')).toHaveLength(0);
  });

  it('getLastPallet returns the highest numeric palletNumber, else 0', async () => {
    expect(await repo.getLastPallet(FARMER)).toBe(0);
    const col = db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');
    await col.add({ palletNumber: '3' });
    await col.add({ palletNumber: '11' });
    await col.add({ palletNumber: '' });
    expect(await repo.getLastPallet(FARMER)).toBe(11);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm run test:emulator`
Expected: the three `reads` tests FAIL with "getRecords not implemented" / "not implemented".

- [ ] **Step 3: Implement the read methods**

Add to `FirestoreRepository` (inside the class, after the path helpers):
```js
  async getRecords(farmer) {
    const snap = await this.recordsCol(farmer).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getRecordsByPallet(farmer, palletNumber) {
    const all = await this.getRecords(farmer);
    return all.filter(r => String(r.palletNumber) === String(palletNumber));
  }

  async getLastPallet(farmer) {
    const all = await this.getRecords(farmer);
    const nums = all.map(r => parseInt(r.palletNumber)).filter(n => !isNaN(n));
    return nums.length ? Math.max(...nums) : 0;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm run test:emulator`
Expected: all `reads` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/repositories/FirestoreRepository.js backend/tests/FirestoreRepository.test.js
git commit -m "feat(backend): FirestoreRepository read methods"
```

---

### Task 3: FirestoreRepository writes

**Files:**
- Modify: `backend/repositories/FirestoreRepository.js`
- Test: `backend/tests/FirestoreRepository.test.js`

**Interfaces:**
- Produces: `appendRecord(farmer, record) -> Promise<{id, ...record}>` (auto-string id); `updateRecord(farmer, id, record) -> Promise<{id, ...record}>` (full overwrite); `updateRecords(farmer, ids, records) -> Promise<{success:true, message:string}>` (batch full overwrite).

- [ ] **Step 1: Write the failing tests**

Append to the test file:
```js
describe('writes', () => {
  const rec = () => ({ palletNumber: '1', kind: 'mango', size: 'L', boxes: 10, weight: 200, sent: false, gidon: false, mark: false, harvestDate: '2026-07-13', shipmentDate: '', cardId: '', destination: '', editedBy: 'a@b.c', editedAt: '2026-07-13T00:00:00Z' });

  it('appendRecord assigns a string id and stores the object', async () => {
    const out = await repo.appendRecord(FARMER, rec());
    expect(typeof out.id).toBe('string');
    const back = await repo.getRecords(FARMER);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(out.id);
    expect(back[0].kind).toBe('mango');
  });

  it('updateRecord overwrites the doc at id', async () => {
    const { id } = await repo.appendRecord(FARMER, rec());
    await repo.updateRecord(FARMER, id, { ...rec(), weight: 999 });
    const back = await repo.getRecords(FARMER);
    expect(back[0].weight).toBe(999);
  });

  it('updateRecords batch-overwrites multiple docs', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const b = await repo.appendRecord(FARMER, rec());
    const res = await repo.updateRecords(FARMER, [a.id, b.id], [{ ...rec(), destination: 'X' }, { ...rec(), destination: 'Y' }]);
    expect(res.success).toBe(true);
    const back = (await repo.getRecords(FARMER)).sort((x, y) => x.destination.localeCompare(y.destination));
    expect(back.map(r => r.destination)).toEqual(['X', 'Y']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm run test:emulator`
Expected: the three `writes` tests FAIL with "not implemented".

- [ ] **Step 3: Implement the write methods**

Add to `FirestoreRepository`:
```js
  async appendRecord(farmer, record) {
    const ref = this.recordsCol(farmer).doc(); // auto-id
    const data = { ...record };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async updateRecord(farmer, id, record) {
    const data = { ...record };
    await this.recordsCol(farmer).doc(id).set(data); // full overwrite (mirrors updateRowById)
    return { id, ...data };
  }

  async updateRecords(farmer, ids, records) {
    const batch = this.db.batch();
    ids.forEach((id, i) => batch.set(this.recordsCol(farmer).doc(id), { ...records[i] }));
    await batch.commit();
    return { success: true, message: 'Rows updated successfully' };
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm run test:emulator`
Expected: all `writes` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/repositories/FirestoreRepository.js backend/tests/FirestoreRepository.test.js
git commit -m "feat(backend): FirestoreRepository write methods"
```

---

### Task 4: FirestoreRepository bulk-status + audit

**Files:**
- Modify: `backend/repositories/FirestoreRepository.js`
- Test: `backend/tests/FirestoreRepository.test.js`

**Interfaces:**
- Produces: `updateSentStatus(farmer, ids, value) -> Promise<{id, sent}[]>`; `updateMarkStatus(farmer, ids, value) -> Promise<{id, mark}[]>`; `appendAuditLog(farmer, entry) -> Promise<void>` (never throws to caller; caller keeps it fire-and-forget).

- [ ] **Step 1: Write the failing tests**

Append:
```js
describe('bulk status + audit', () => {
  const rec = (extra) => ({ palletNumber: '1', sent: false, mark: false, ...extra });

  it('updateSentStatus flips sent on the given ids only', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const b = await repo.appendRecord(FARMER, rec());
    const out = await repo.updateSentStatus(FARMER, [a.id], true);
    expect(out).toEqual([{ id: a.id, sent: true }]);
    const back = await repo.getRecords(FARMER);
    expect(back.find(r => r.id === a.id).sent).toBe(true);
    expect(back.find(r => r.id === b.id).sent).toBe(false);
  });

  it('updateMarkStatus flips mark on the given ids', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const out = await repo.updateMarkStatus(FARMER, [a.id], true);
    expect(out).toEqual([{ id: a.id, mark: true }]);
    expect((await repo.getRecords(FARMER))[0].mark).toBe(true);
  });

  it('appendAuditLog writes an audit doc', async () => {
    await repo.appendAuditLog(FARMER, { recordId: 'r1', palletNumber: '1', action: 'קליטה', editedBy: 'a@b.c', editedAt: '2026-07-13T00:00:00Z' });
    const snap = await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('audit').get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().action).toBe('קליטה');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm run test:emulator`
Expected: the three tests FAIL with "not implemented".

- [ ] **Step 3: Implement the methods**

Add to `FirestoreRepository`:
```js
  async updateSentStatus(farmer, ids, value) {
    const batch = this.db.batch();
    ids.forEach(id => batch.update(this.recordsCol(farmer).doc(id), { sent: value }));
    await batch.commit();
    return ids.map(id => ({ id, sent: value }));
  }

  async updateMarkStatus(farmer, ids, value) {
    const batch = this.db.batch();
    ids.forEach(id => batch.update(this.recordsCol(farmer).doc(id), { mark: value }));
    await batch.commit();
    return ids.map(id => ({ id, mark: value }));
  }

  async appendAuditLog(farmer, entry) {
    // Never rethrow — audit must not break the main flow.
    try {
      await this.auditCol(farmer).add({
        recordId: entry.recordId,
        palletNumber: entry.palletNumber,
        action: entry.action,
        editedBy: entry.editedBy,
        editedAt: entry.editedAt,
      });
    } catch (err) {
      // logged by caller context; swallow here to match legacy behavior
    }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm run test:emulator`
Expected: all tests PASS (full suite green).

- [ ] **Step 5: Commit**

```bash
git add backend/repositories/FirestoreRepository.js backend/tests/FirestoreRepository.test.js
git commit -m "feat(backend): FirestoreRepository bulk-status + audit"
```

---

### Task 5: Wire backend consumers to the repository

**Files:**
- Modify: `backend/controllers/sheetController.js`
- Modify: `backend/services/backupService.js`

**Interfaces:**
- Consumes: `require('../repositories')` singleton (all methods from Tasks 2–4).

- [ ] **Step 1: Repoint sheetController imports**

In `backend/controllers/sheetController.js`, replace line 3:
```js
const sheetsService = require("../services/googleSheetsService");
```
with:
```js
const repo = require("../repositories");
```

- [ ] **Step 2: Map every call site (mechanical rename + object payloads)**

Apply these exact substitutions in `sheetController.js`:

| Old call | New call |
|---|---|
| `sheetsService.appendRow(farmer, sheetRecord.toArray())` | `repo.appendRecord(farmer, { ...sheetRecord })` |
| `sheetsService.appendAuditLog(farmer, {…})` | `repo.appendAuditLog(farmer, {…})` |
| `sheetsService.getAllRecords(farmer)` | `repo.getRecords(farmer)` |
| `sheetsService.getRowsByPallet(farmer, palletNumber)` | `repo.getRecordsByPallet(farmer, palletNumber)` |
| `sheetsService.getLastPallet(farmer)` | `repo.getLastPallet(farmer)` |
| `sheetsService.updateRowsByIds(farmer, ids, updatedDataArray)` | `repo.updateRecords(farmer, ids, updatedObjects)` |
| `sheetsService.updateRowById(farmer, parseInt(id), sheetRecord.toArray())` | `repo.updateRecord(farmer, id, { ...sheetRecord })` |
| `sheetsService.updateSentStatusForPallets(farmer, palletIds, false)` | `repo.updateSentStatus(farmer, palletIds, false)` |
| `sheetsService.updateSendToDestinationPallets(farmer, palletIds, X)` | `repo.updateMarkStatus(farmer, palletIds, X)` |

Specifics:
- In `updateMultipleRecords`, build `updatedObjects` instead of `updatedDataArray`: push `{ ...sheetRecord }` (the model instance spread) rather than `sheetRecord.toArray()`.
- In `updateRecord`, drop `parseInt(id)` — pass the string `id` straight through (both to `repo.updateRecord` and in the audit `recordId`/emit payload).
- `getRecordsByPallet`: the repo returns `[]` for an unknown pallet (it no longer throws). The controller already handles `records.length === 0 → 404`, so leave that branch; remove reliance on a thrown "not found".

- [ ] **Step 3: Simplify now-dead error branches**

The repo no longer emits `"Invalid farmer sheet"`. In each `catch`, the `error.message.includes("Invalid farmer sheet")` branch is now dead but harmless. Leave them in place (removing is optional cleanup) — do **not** add new farmer validation here; that is task 6.

- [ ] **Step 4: Repoint backupService**

In `backend/services/backupService.js`:
- Replace line 5 `const sheetsService = require('./googleSheetsService');` with `const repo = require('../repositories');`
- Replace line 63 `const records = await sheetsService.getAllRecords(farmer);` with `const records = await repo.getRecords(farmer);`
- Leave `getFarmerNames()` reading `config/global` **as-is for now** — it is repointed to the namespaced path in Task 7's follow-up note (see Task 8 seed + Task 7). Add a `// TODO(task 7): namespaced config path` comment on line 25 so it is not forgotten.

- [ ] **Step 5: Verify the server boots and a record round-trips (emulator or dev Firestore)**

Run: `cd backend && node -e "require('./controllers/sheetController'); require('./services/backupService'); console.log('modules load OK')"`
Expected: prints `modules load OK` with no import error.

Then (against the Firestore emulator or a dev project) start the server and exercise create+read via the dev-login flow, confirming a pallet is written under `centers/tsuberi/farmers/{farmer}/records`. Full end-to-end smoke is Task 10; this step only confirms wiring loads and one create works.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/sheetController.js backend/services/backupService.js
git commit -m "feat(backend): wire controllers + backup to RecordRepository"
```

---

### Task 6: Namespace real-time events under the center

**Files:**
- Modify: `backend/services/firestoreEventService.js`

**Interfaces:**
- Consumes: `CENTER_ID` from `backend/config/center.js`.
- Produces: events written to `centers/{centerId}/farmer_events/{farmer}` (payload/behavior unchanged).

- [ ] **Step 1: Repoint the event doc path**

Replace the top of `backend/services/firestoreEventService.js`:
```js
const admin = require('firebase-admin')
const logger = require('../utils/logger')

const COL = 'farmer_events'
const db = () => admin.firestore()

function emit(farmer, payload) {
  db().collection(COL).doc(farmer).set({
```
with:
```js
const admin = require('firebase-admin')
const logger = require('../utils/logger')
const { CENTER_ID } = require('../config/center')

const db = () => admin.firestore()
const eventDoc = (farmer) =>
  db().collection('centers').doc(CENTER_ID).collection('farmer_events').doc(farmer)

function emit(farmer, payload) {
  eventDoc(farmer).set({
```
(The rest of `emit` — the spread payload, `farmer`, `updatedAt`, `.catch(...)` — is unchanged. The exported `emitCreate/…` map is unchanged.)

- [ ] **Step 2: Verify module loads**

Run: `cd backend && node -e "require('./services/firestoreEventService'); console.log('event service OK')"`
Expected: prints `event service OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/services/firestoreEventService.js
git commit -m "feat(backend): namespace farmer_events under centers/{centerId}"
```

---

### Task 7: Namespace users + config in server.js; expose centerId

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/services/backupService.js` (finish the Task 5 TODO)

**Interfaces:**
- Consumes: `CENTER_ID`.
- Produces: `/api/auth/me` response now includes `centerId`; all `users`/`config` reads/writes namespaced.

- [ ] **Step 1: Import the center constant and add collection helpers**

Near the top of `server.js` (after `const db = admin.firestore();`, line ~22) add:
```js
const { CENTER_ID } = require('./config/center');
const centerRef = () => db.collection('centers').doc(CENTER_ID);
const usersCol = () => centerRef().collection('users');
const configDoc = () => centerRef().collection('config').doc('global');
```

- [ ] **Step 2: Replace every top-level users/config reference**

Apply these exact replacements in `server.js`:
- Line 27 `db.collection("users").limit(1)` → `usersCol().limit(1)`
- Line 35 `batch.set(db.collection("users").doc(email), { role })` → `batch.set(usersCol().doc(email), { role })`
- Line 101 `db.collection("users").doc(email).get()` → `usersCol().doc(email).get()`
- Line 299 `db.collection("config").doc("global").set(req.body)` → `configDoc().set(req.body)`
- Line 316 `db.collection("users").get()` → `usersCol().get()`
- Line 335 `db.collection("users").doc(email).set({ role })` → `usersCol().doc(email).set({ role })`
- Line 348 `db.collection("users").where("role", "==", "admin").get()` → `usersCol().where("role", "==", "admin").get()`
- Line 354 `db.collection("users").doc(email).delete()` → `usersCol().doc(email).delete()`

- [ ] **Step 3: Add centerId to /api/auth/me**

Replace the `/api/auth/me` body (line 186–192):
```js
app.get("/api/auth/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ ...req.user, centerId: CENTER_ID });
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});
```

- [ ] **Step 4: Finish the backupService config path**

In `backend/services/backupService.js` `getFarmerNames()` (line 25), replace:
```js
const snap = await db.collection('config').doc('global').get();
```
with:
```js
const { CENTER_ID } = require('../config/center');
const snap = await db.collection('centers').doc(CENTER_ID).collection('config').doc('global').get();
```
and remove the `// TODO(task 7)` comment.

- [ ] **Step 5: Verify server boots**

Run: `cd backend && node -e "process.env.NODE_ENV='test'; require('./config/center'); console.log('center', require('./config/center').CENTER_ID)"`
Expected: prints `center tsuberi`.
Then confirm `server.js` has no syntax error: `cd backend && node --check server.js` → no output = OK.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/services/backupService.js
git commit -m "feat(backend): namespace users + config under center; expose centerId in /api/auth/me"
```

---

### Task 8: One-time namespace seed script (config + users carry-over)

**Files:**
- Create: `backend/scripts/seedCenterNamespace.js`

**Interfaces:**
- Consumes: `CENTER_ID`; the Firebase Admin init pattern from `server.js`.
- Produces: `centers/{centerId}` doc + copied `config/global` and `users/*`; idempotent.

- [ ] **Step 1: Write the seed script**

Create `backend/scripts/seedCenterNamespace.js`:
```js
// One-time carry-over: copy top-level config/global and users/* into
// centers/{CENTER_ID}/. Idempotent — safe to re-run. Records/audit are NOT
// touched (fresh-start). Run: node scripts/seedCenterNamespace.js
require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const { CENTER_ID } = require('../config/center');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'))
    ),
  });
}
const db = admin.firestore();

async function run() {
  const center = db.collection('centers').doc(CENTER_ID);
  await center.set({ name: CENTER_ID, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const cfg = await db.collection('config').doc('global').get();
  if (cfg.exists) {
    await center.collection('config').doc('global').set(cfg.data());
    console.log('copied config/global');
  } else {
    console.log('no top-level config/global to copy');
  }

  const users = await db.collection('users').get();
  let n = 0;
  const batch = db.batch();
  users.forEach(doc => { batch.set(center.collection('users').doc(doc.id), doc.data()); n++; });
  await batch.commit();
  console.log(`copied ${n} users`);

  console.log(`seed complete for center "${CENTER_ID}"`);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
```
(The service-account key is `backend/services/SheetsCred.env.json` — the same file `backupService.js` loads via `keyFilename`. If `server.js` already initialized Admin with credentials in a running process, the `admin.apps.length` guard skips re-init; this script is meant to run standalone via `node`.)

- [ ] **Step 2: Verify the script parses**

Run: `cd backend && node --check scripts/seedCenterNamespace.js`
Expected: no output = OK. (Actual execution happens at cutover, Task 10 Step 2.)

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/seedCenterNamespace.js
git commit -m "feat(backend): one-time center-namespace seed (config + users carry-over)"
```

---

### Task 9: Frontend — center-aware paths, ISO dates

**Files:**
- Create: `frontend/src/composables/useCenter.js`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/components/Settings.vue`
- Modify: `frontend/src/composables/useFarmerEvents.js`
- Modify: `frontend/src/components/PalletInput.vue`

**Interfaces:**
- Consumes: `/api/auth/me` returning `{ ..., centerId }` (Task 7).
- Produces: module-level `centerId` ref set once after auth; all frontend Firestore paths namespaced.

- [ ] **Step 1: Create the shared center ref**

Create `frontend/src/composables/useCenter.js`:
```js
import { ref } from 'vue'

// Set once in App.vue from /api/auth/me. Imported wherever a Firestore path
// needs the tenant id (config subscription, farmer events).
export const centerId = ref('')
export function setCenterId(id) { centerId.value = id || '' }
```

- [ ] **Step 2: App.vue — set centerId, then subscribe to namespaced config**

In `frontend/src/App.vue`:
- Add to imports (near line 179): `import { setCenterId, centerId } from './composables/useCenter'`
- Also `provide('centerId', centerId)` alongside the other provides (near line 238), for template/child convenience.
- Replace the auth+config block (lines 324–334) so config subscription waits for centerId:
```js
      // 1. Fetch User Info, then subscribe to the tenant's config
      fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.email) user.value = data;
          if (data.centerId) {
            setCenterId(data.centerId);
            const configRef = doc(db, "centers", data.centerId, "config", "global");
            onSnapshot(configRef, (snapshot) => {
```
Keep the existing `onSnapshot` callback body (lines 335 onward — `kinds/sizes/destinations/farmers` mapping) unchanged; just ensure the closing braces now nest inside the `.then`. Remove the old standalone `const configDoc = doc(db, "config", "global")` + its `onSnapshot` (they are replaced).

- [ ] **Step 3: Settings.vue — namespaced config subscription**

In `frontend/src/components/Settings.vue`:
- Add import: `import { centerId } from '../composables/useCenter'`
- Replace line 373 `const docRef = doc(db, "config", "global");` with:
```js
      const docRef = doc(db, "centers", centerId.value, "config", "global");
```
(Settings is admin-only and mounts after App has set `centerId`. If `centerId.value` is empty defensively guard: `if (!centerId.value) return;` before the subscription.)

- [ ] **Step 4: useFarmerEvents — namespaced event doc**

In `frontend/src/composables/useFarmerEvents.js`:
- Add import: `import { centerId } from './useCenter'`
- Replace line 72 `const docRef = doc(db, 'farmer_events', farmerName)` with:
```js
    const docRef = doc(db, 'centers', centerId.value, 'farmer_events', farmerName)
```

- [ ] **Step 5: PalletInput — send ISO dates (stop the dd/mm conversion)**

In `frontend/src/components/PalletInput.vue`, replace the `formattedData` block (lines 405–411):
```js
                const formattedData = {
                    ...formData,
                    shipmentDate: formData.shipmentDate ?
                        new Date(formData.shipmentDate).toLocaleDateString('en-GB') : '',
                    harvestDate: new Date(formData.harvestDate)
                        .toLocaleDateString('en-GB').slice(0, 5),
                }
```
with:
```js
                // The <input type="date"> already yields canonical ISO yyyy-mm-dd.
                const formattedData = { ...formData };
```

- [ ] **Step 6: Audit the frontend for stale date parsing and numeric id assumptions**

Run: `cd frontend && grep -rnE "toLocaleDateString\('en-GB'\)|parseInt\((rec|pallet|record)?\.?id|Number\(.*\.id" src`
Expected: no remaining `en-GB` date conversions on record dates, and no numeric coercion of `.id`. Fix any hit (id must be treated as an opaque string; the event-matching in `useFarmerEvents` already uses `===` on ids, which is correct for strings). `Number(...palletNumber)` in `Dashboard.vue:176` is fine — that's `palletNumber`, not `id`.

- [ ] **Step 7: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: build succeeds (no import/compile errors).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/composables/useCenter.js frontend/src/App.vue frontend/src/components/Settings.vue frontend/src/composables/useFarmerEvents.js frontend/src/components/PalletInput.vue
git commit -m "feat(frontend): center-aware Firestore paths + ISO intake dates"
```

---

### Task 10: Cutover — seed, smoke test, delete Sheets service, update docs

**Files:**
- Delete: `backend/services/googleSheetsService.js`
- Modify: `CLAUDE.md`
- Modify: `docs/redesign-plan.md`, `redesign-plan.html`
- Modify: `done.md`

**Interfaces:**
- Consumes: everything from Tasks 1–9.

- [ ] **Step 1: Confirm nothing still imports the Sheets service**

Run: `cd backend && grep -rn "googleSheetsService" . --include=*.js | grep -v node_modules`
Expected: **no matches** (all consumers repointed in Tasks 5–7). If any remain, repoint them before continuing.

- [ ] **Step 2: Run the namespace seed against the real dev Firestore**

Run: `cd backend && node scripts/seedCenterNamespace.js`
Expected: logs `copied config/global`, `copied N users`, `seed complete for center "tsuberi"`.

- [ ] **Step 3: End-to-end smoke test (dev)**

Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`), log in via Google (or dev-login), and verify against `centers/tsuberi/…`:
1. Login + `/api/auth/me` returns `centerId: "tsuberi"`; config lists load (kinds/sizes/destinations/farmers).
2. Create a pallet (intake) → appears under `centers/tsuberi/farmers/{farmer}/records`, `harvestDate` stored as ISO `yyyy-mm-dd`, booleans real.
3. Open a second browser/tab on the same farmer → real-time flash on the new row (event at `centers/tsuberi/farmer_events/{farmer}`).
4. Edit a record (single) and a bulk sent/mark toggle → persists; audit docs appear under `.../audit`.
5. Admin backup (`POST /api/admin/backup`) → succeeds, reads from Firestore.
6. Add/remove a user in Settings admin → writes under `centers/tsuberi/users`.

Record the results; do not proceed until all six pass.

- [ ] **Step 4: Delete the Sheets service and dead caches**

Run: `git rm backend/services/googleSheetsService.js`
(Its four in-memory caches and the append-lock die with it — already unreferenced. `POST /api/admin/refresh-cache` in `server.js` no longer clears Sheets caches; simplify that handler to only re-warm what still exists, or return a no-op success. Update `server.js` lines ~275–286 accordingly and confirm `node --check server.js`.)

- [ ] **Step 5: Remove the old top-level docs (optional, after verification)**

Once Step 3 has passed and the app has run a full session on the namespaced data, delete the legacy top-level `config/global` and `users/*` via a one-off console/script call. Leave `sessions` untouched. (Safe to defer if you want a fallback window.)

- [ ] **Step 6: Update CLAUDE.md**

Reflect the new reality: records/audit/config/users/events live under `centers/{centerId}`; `RecordRepository`/`FirestoreRepository` replace `googleSheetsService`; the four Sheets caches are gone; ids are strings; dates are ISO. Update the "Database" section, "Caching" section, "Firestore Collections" table, and the real-time paths.

- [ ] **Step 7: Mark the task done in the plan + done.md**

Append a `done.md` entry (tasks 15+16, merged), and in `redesign-plan.html` (source of truth, then regenerate the `.md`) mark the 15+16 row done. Note the deferred follow-ups still open: task 6 (farmer provisioning rewrite), task 23 (real centerId resolution + Firestore-rule lockdown), task 20 (shipping labels off Sheets — `SPREADSHEET_ID` and `SHIPPING_LABELS_ID_*` remain until then).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: cut over records + tenant data to Firestore; remove googleSheetsService (tasks 15+16)"
```

---

## Notes carried forward (not in this plan)

- **Task 6** — rewrite `addSheet`/`deleteSheet` admin endpoints to provision Firestore `farmers/{farmer}` docs; add loud unknown-farmer validation in the repo/registry.
- **Task 23** — replace the `CENTER_ID` constant with real per-subdomain / custom-claims resolution and lock down `firestore.rules` (records are readable under the current open posture until then — same as today's `config`/`farmer_events`).
- **Task 20** — remove the remaining Sheets dependency (shipping labels) and the `SPREADSHEET_ID` / `SHIPPING_LABELS_ID_*` env vars.
- **Task 22** — the full Vitest + CI harness; this plan seeded only backend repo tests against the emulator.
