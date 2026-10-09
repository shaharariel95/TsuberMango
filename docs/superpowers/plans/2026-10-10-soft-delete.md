# Soft-Delete + Restore Pallets (task 25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mistaken pallet can be deleted from the table (soft, audit-logged) and an admin can restore it from Settings.

**Architecture:** Records get repository-managed fields `deleted: true, deletedBy, deletedAt` (absent = live). `FirestoreRepository` filters deleted records out of every normal read, so all consumers (tables, duplicate-pallet check, last pallet, export, certificates preview) ignore them without per-caller code; backup reads with `includeDeleted` so season-reset row counts still match. Delete/restore are Firestore transactions with state checks; both emit a `bulk_update` realtime event and an audit entry.

**Tech Stack:** Express 5, firebase-admin, Vue 3, Vitest, Playwright.

**Spec (controller-authored; the owner delegated decisions overnight 2026-10-09; board: "25 Soft-delete + restore (audit-logged, admin 'שחזר') — likely the biggest real gap". Today there is NO way to delete a record.)**
Decisions:
- Delete: any signed-in center user (the packhouse account fixes its own intake mistakes), only when the pallet is NOT sent and has NO `cardId`; otherwise 409 (Hebrew message). Restore and the deleted list: admin only.
- UI: delete lives inside the row's edit mode (next to שמור/ביטול) with a confirm dialog — never a one-tap action in the normal row. Restore: a "משטחים שנמחקו" section in Settings (pick a farmer, see deleted pallets, "שחזר").
- Deleted records stay in `records` (no move), so restore is a flag flip and ids stay stable.
- Reads: `getRecords(farmer)` excludes deleted; `getRecords(farmer, { includeDeleted: true })` returns all; `getRecord` returns null for a deleted record. Backup uses `includeDeleted` (rows carry `deleted: true`); season export, Dashboard, tables exclude them.
- Writes on a deleted record: `PUT /records/:id` → 404 (today a missing id silently creates a doc — that bug is fixed too). Certificate issue treats a deleted record as `RECORD_NOT_FOUND`.
- Realtime: delete emits `bulk_update` with `[{ id, deleted: true }]`; clients drop that row. Restore emits `bulk_update` with the full restored record; clients add it when it passes their filter.
- Audit actions: `'מחיקה'` and `'שחזור'`.
- Restoring a pallet whose number is now reused by another live pallet is allowed (duplicates are already allowed with a warning at intake).

## Global Constraints
- Branch `arch-redesign`; no push, deploy, or `main`. No GitHub CI.
- UI text Hebrew (RTL); dev-facing text English. Tailwind only.
- Backend: logger.info/error in every new controller/service/repository method; admin endpoints in `backend/app.js` after the `/api` chain with `ensureAdmin`; every write emits its realtime event after the repository write.
- Raw `fetch` uses `authHeaders()` from `src/utils/auth.js` (token + `X-Client-Id`).
- PalletTable layout contract: pages rendering `<PalletTable>` keep `h-full` (no layout change expected here).
- Gates: `cd backend && npm test` (baseline 145); `cd frontend && npm test` (28) `&& npm run build && npm run e2e` (26). Sequential.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus
1. Delete racing a certificate issue for the same pallet → exactly one wins (both transactional on the record doc): either the pallet is certified and the delete gets 409, or it is deleted and the issue gets RECORD_NOT_FOUND.
2. A deleted pallet never reappears through an edit save from a stale tab (PUT → 404) or through the duplicate-pallet warning at intake.
3. Season reset dry-run total vs backup row count still match when deleted pallets exist (backup includes them).
4. Another client viewing the table sees the row disappear live after a delete, and reappear after a restore.
5. A Hebrew farmer name and auto ids in the DELETE/restore URLs are encoded correctly.

---

### Task 1: Backend — repository, endpoints, certificates guard, backup

**Files:**
- Create: `backend/repositories/errors.js`, `backend/tests/softDelete.api.test.js`
- Modify: `backend/repositories/RecordRepository.js`, `backend/repositories/FirestoreRepository.js`, `backend/repositories/FirestoreCertificateRepository.js` (issue txn missing check), `backend/controllers/recordController.js` (`deleteRecord`, `listDeletedRecords`, `restoreRecord`; `updateRecord` 404), `backend/routes/recordRoutes.js`, `backend/app.js`, `backend/services/backupService.js`, `backend/tests/FirestoreRepository.test.js`, `docs/api-reference.md`, `docs/architecture.md` (record-fields table: `deleted`, `deletedBy`, `deletedAt` — repository-managed, not in `PalletRecord`)

**Interfaces (produced):**
- `DELETE /api/farmers/:farmer/records/:id` → 200 `{ id, deleted: true }` | 404 | 409 `{ error }` (any center user)
- `GET /api/admin/farmers/:farmer/deleted-records` → 200 `{ records: [...] }` sorted by `deletedAt` desc (admin)
- `POST /api/admin/farmers/:farmer/records/:id/restore` → 200 `{ record }` | 404 (admin)
- Repository: `getRecords(farmer, { includeDeleted = false } = {})`, `getDeletedRecords(farmer)`, `softDeleteRecord(farmer, id, deletedBy, deletedAt)` → deleted record, `restoreRecord(farmer, id, editedBy, editedAt)` → restored record; both throw `RecordStateError` (`status`, Hebrew `message`).

- [ ] **Step 1: Failing tests.** Create `backend/tests/softDelete.api.test.js` following the setup pattern of `backend/tests/certificates.api.test.js` (own `CENTER = 'softdel'`, `process.env.CENTER_ID` pinned before importing `../app.js`, admin + user tokens via `tokenFor`, `makeApi`, `waitFor`, a farmer `FARMER = 'חקלאי-מחיקה'` in `config/global.farmers`, a `certificateProfile` on `farmers/{FARMER}` for the certificate test, and an `addRecord(palletNumber, overrides)` helper writing a complete record like that file's helper). Tests:

```js
describe('soft delete', () => {
  it('a user can delete an unsent pallet; reads, by-pallet and export no longer see it; audit + event written', async () => {
    const id = await addRecord(501);
    const res = await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`, 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, deleted: true });
    const list = await api('get', `/api/farmers/${enc(FARMER)}/records`);
    expect(JSON.stringify(list.body)).not.toContain(id);
    const byPallet = await api('get', `/api/farmers/${enc(FARMER)}/records/pallet/501`);
    expect(JSON.stringify(byPallet.body)).not.toContain(id);
    const exp = await api('get', '/api/admin/export/records');
    expect(exp.body.farmers[FARMER].map(r => r.id)).not.toContain(id);
    const stored = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(stored).toMatchObject({ deleted: true, deletedBy: USER });
    const audit = await farmerDoc.collection('audit').where('recordId', '==', id).get();
    expect(audit.docs.map(d => d.data().action)).toContain('מחיקה');
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.type === 'bulk_update' && d.pallets.some(p => p.id === id && p.deleted === true) ? d : null;
    });
    expect(evt).toBeTruthy();
  });
  it('409s a sent pallet and a pallet with a cardId; 404s a missing or already-deleted id', async () => {
    const sent = await addRecord(502, { sent: true });
    const carded = await addRecord(503, { cardId: 12 });
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${sent}`)).status).toBe(409);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${carded}`)).status).toBe(409);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/nope`)).status).toBe(404);
    const gone = await addRecord(504);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${gone}`);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${gone}`)).status).toBe(404);
  });
  it('editing a deleted (or missing) pallet 404s and does not resurrect it', async () => {
    const id = await addRecord(505);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`);
    const body = { harvestDate: '2026-11-30', palletNumber: 505, boxes: 10, kind: 'שלי', size: '15' };
    expect((await api('put', `/api/farmers/${enc(FARMER)}/records/${id}`).send(body)).status).toBe(404);
    expect((await farmerDoc.collection('records').doc(id).get()).data().deleted).toBe(true);
    expect((await api('put', `/api/farmers/${enc(FARMER)}/records/does-not-exist`).send(body)).status).toBe(404);
    expect((await farmerDoc.collection('records').doc('does-not-exist').get()).exists).toBe(false);
  });
  it('a deleted pallet cannot be put on a certificate', async () => {
    const id = await addRecord(506);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`);
    expect((await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).status).toBe(404);
    expect((await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: [id] })).status).toBe(404);
  });
});

describe('restore (admin)', () => {
  it('lists deleted pallets newest first and restores one; audit + event written', async () => {
    const a = await addRecord(511);
    const b = await addRecord(512);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${a}`);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${b}`);
    const list = await api('get', `/api/admin/farmers/${enc(FARMER)}/deleted-records`);
    expect(list.status).toBe(200);
    const ids = list.body.records.map(r => r.id);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a));
    const res = await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${a}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.record).toMatchObject({ id: a, palletNumber: 511 });
    expect(res.body.record.deleted).toBeUndefined();
    const stored = (await farmerDoc.collection('records').doc(a).get()).data();
    expect(stored.deleted).toBeUndefined();
    expect(stored.deletedBy).toBeUndefined();
    const listed = await api('get', `/api/farmers/${enc(FARMER)}/records`);
    expect(JSON.stringify(listed.body)).toContain(a);
    const audit = await farmerDoc.collection('audit').where('recordId', '==', a).get();
    expect(audit.docs.map(d => d.data().action)).toContain('שחזור');
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.type === 'bulk_update' && d.pallets.some(p => p.id === a && p.palletNumber == 511 && !p.deleted) ? d : null;
    });
    expect(evt).toBeTruthy();
  });
  it('404s restoring a live pallet; 403s a non-admin', async () => {
    const live = await addRecord(513);
    expect((await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${live}/restore`)).status).toBe(404);
    expect((await api('get', `/api/admin/farmers/${enc(FARMER)}/deleted-records`, 'user')).status).toBe(403);
    expect((await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${live}/restore`, 'user')).status).toBe(403);
  });
});
```

Adapt only response-shape details you verify in the existing code (e.g. what `GET /records` and `/records/pallet/:n` return — they are asserted with `JSON.stringify(...).not.toContain(id)` so the shape does not matter). `addRecord` defaults must include `sent: false, cardId: ''` and every field `validateIssueSelection` needs (weight, boxes, destination, shipmentDate) so the certificate test fails only because of the deletion.

Append to `backend/tests/FirestoreRepository.test.js` (it has `repo`, `FARMER`, `db`, `CENTER`):

```js
describe('soft-deleted records', () => {
  it('getRecords/getRecord hide deleted records; includeDeleted and getDeletedRecords show them', async () => {
    const live = await repo.appendRecord(FARMER, { palletNumber: '71', sent: false, cardId: '' });
    const gone = await repo.appendRecord(FARMER, { palletNumber: '72', sent: false, cardId: '' });
    await repo.softDeleteRecord(FARMER, gone.id, 'a@b.c', '2026-10-10T00:00:00Z');
    const ids = (await repo.getRecords(FARMER)).map(r => r.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);
    expect(await repo.getRecord(FARMER, gone.id)).toBeNull();
    expect((await repo.getRecords(FARMER, { includeDeleted: true })).map(r => r.id)).toContain(gone.id);
    expect((await repo.getDeletedRecords(FARMER)).map(r => r.id)).toEqual([gone.id]);
    expect(await repo.getLastPallet(FARMER)).not.toBe(72);
  });
});
```

(If that file clears records between tests differently, make the `getDeletedRecords` and `getLastPallet` assertions robust to other tests' data: e.g. `toContain(gone.id)` and check `getRecordsByPallet(FARMER, '72')` is empty instead of the last-pallet assertion.)

- [ ] **Step 2: Run to verify they fail** — from `backend/`: `npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/softDelete.api.test.js tests/FirestoreRepository.test.js"` → FAIL (routes 404, methods missing).

- [ ] **Step 3: `backend/repositories/errors.js`**

```js
// Errors repositories throw for a request that conflicts with the record's current state.
// `status` is the HTTP status the controller should answer with; `message` is user-facing (Hebrew).
class RecordStateError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RecordStateError';
    this.status = status;
  }
}

module.exports = { RecordStateError };
```

- [ ] **Step 4: `RecordRepository.js` contract** — change `getRecords(farmer)` to `getRecords(farmer, { includeDeleted } = {})` with comment `// Live records only, unless includeDeleted (soft-deleted ones carry deleted: true).`; note on `getRecord`: `// … resolves to null when missing or soft-deleted.`; add:

```js
  // Soft-deleted records only (deleted: true).
  getDeletedRecords(farmer) { throw new Error('not implemented'); }
  // Transactional soft delete. Throws RecordStateError 404 (missing/already deleted) or 409 (sent or has a cardId).
  softDeleteRecord(farmer, id, deletedBy, deletedAt) { throw new Error('not implemented'); }
  // Transactional restore of a soft-deleted record. Throws RecordStateError 404 if it is not deleted.
  restoreRecord(farmer, id, editedBy, editedAt) { throw new Error('not implemented'); }
```

- [ ] **Step 5: `FirestoreRepository.js`** — add `const { RecordStateError } = require('./errors');` and:

```js
  async getRecords(farmer, { includeDeleted = false } = {}) {
    const snap = await this.recordsCol(farmer).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return includeDeleted ? all : all.filter(r => r.deleted !== true);
  }

  async getRecord(farmer, id) {
    const snap = await this.recordsCol(farmer).doc(id).get();
    return snap.exists && snap.data().deleted !== true ? { id: snap.id, ...snap.data() } : null;
  }

  async getDeletedRecords(farmer) {
    return (await this.getRecords(farmer, { includeDeleted: true })).filter(r => r.deleted === true);
  }

  async softDeleteRecord(farmer, id, deletedBy, deletedAt) {
    const ref = this.recordsCol(farmer).doc(id);
    const out = await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data().deleted === true) throw new RecordStateError(404, 'המשטח לא נמצא');
      const r = snap.data();
      if (r.sent === true || (r.cardId !== '' && r.cardId != null)) {
        throw new RecordStateError(409, 'לא ניתן למחוק משטח שנשלח או שיש לו תעודת משלוח');
      }
      t.update(ref, { deleted: true, deletedBy, deletedAt });
      return { id, ...r, deleted: true, deletedBy, deletedAt };
    });
    logger.info(`[FirestoreRepository.softDeleteRecord] ${farmer}/${id} by ${deletedBy}`);
    return out;
  }

  async restoreRecord(farmer, id, editedBy, editedAt) {
    const ref = this.recordsCol(farmer).doc(id);
    const { FieldValue } = admin.firestore;
    const out = await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data().deleted !== true) throw new RecordStateError(404, 'משטח מחוק לא נמצא');
      const { deleted, deletedBy, deletedAt, ...rest } = snap.data();
      t.update(ref, { deleted: FieldValue.delete(), deletedBy: FieldValue.delete(), deletedAt: FieldValue.delete(), editedBy, editedAt });
      return { id, ...rest, editedBy, editedAt };
    });
    logger.info(`[FirestoreRepository.restoreRecord] ${farmer}/${id} by ${editedBy}`);
    return out;
  }
```

(Replace the existing `getRecords`/`getRecord`; `getRecordsByPallet` and `getLastPallet` keep calling `getRecords(farmer)` and so exclude deleted records automatically.)

- [ ] **Step 6: Certificates guard** — in `FirestoreCertificateRepository._issueTxn`, change
`const missing = recSnaps.find(s => !s.exists);` to
`const missing = recSnaps.find(s => !s.exists || s.data().deleted === true); // soft-deleted = gone`.
(`certificateService.preview` already uses `repo.getRecords`, which now excludes deleted records → its existing `RECORD_NOT_FOUND` path covers preview.)

- [ ] **Step 7: Controller** — in `backend/controllers/recordController.js`: `const { RecordStateError } = require('../repositories/errors');`. In `updateRecord`, right after `const existing = await repo.getRecord(farmer, id);` add:

```js
      if (!existing) return res.status(404).json({ error: `Row with ID ${id} not found` });
```

Add three methods to the controller class (follow the file's style; use the same `farmer` source the neighbouring handlers use — `req.params.farmer` / `req.farmer`):

```js
  // Soft delete (task 25): any center user; only unsent pallets without a certificate number.
  async deleteRecord(req, res) {
    const { farmer, id } = req.params;
    const farmerError = await assertKnownFarmer(farmer);
    if (farmerError) return res.status(400).json({ error: farmerError });
    const actor = req.user?.email || 'unknown';
    const at = new Date().toISOString();
    try {
      const rec = await repo.softDeleteRecord(farmer, id, actor, at);
      repo.appendAuditLog(farmer, { recordId: id, palletNumber: rec.palletNumber, action: 'מחיקה', editedBy: actor, editedAt: at })
        .catch(err => logger.error(`appendAuditLog failed on delete: ${err.message}`));
      firestoreEventService.emitBulkUpdate(farmer, [{ id, deleted: true }], actor);
      logger.info(`[deleteRecord] ${farmer}/${id} pallet ${rec.palletNumber} by ${actor}`);
      res.json({ id, deleted: true });
    } catch (err) {
      if (err instanceof RecordStateError) return res.status(err.status).json({ error: err.message });
      logger.error(`[deleteRecord] ${farmer}/${id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete record', details: err.message });
    }
  }

  async listDeletedRecords(req, res) {
    const { farmer } = req.params;
    try {
      const records = (await repo.getDeletedRecords(farmer))
        .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
      logger.info(`[listDeletedRecords] ${farmer}: ${records.length}`);
      res.json({ records });
    } catch (err) {
      logger.error(`[listDeletedRecords] ${farmer}: ${err.message}`);
      res.status(500).json({ error: 'Failed to list deleted records', details: err.message });
    }
  }

  async restoreRecord(req, res) {
    const { farmer, id } = req.params;
    const actor = req.user?.email || 'unknown';
    const at = new Date().toISOString();
    try {
      const record = await repo.restoreRecord(farmer, id, actor, at);
      repo.appendAuditLog(farmer, { recordId: id, palletNumber: record.palletNumber, action: 'שחזור', editedBy: actor, editedAt: at })
        .catch(err => logger.error(`appendAuditLog failed on restore: ${err.message}`));
      firestoreEventService.emitBulkUpdate(farmer, [record], actor);
      logger.info(`[restoreRecord] ${farmer}/${id} pallet ${record.palletNumber} by ${actor}`);
      res.json({ record });
    } catch (err) {
      if (err instanceof RecordStateError) return res.status(err.status).json({ error: err.message });
      logger.error(`[restoreRecord] ${farmer}/${id}: ${err.message}`);
      res.status(500).json({ error: 'Failed to restore record', details: err.message });
    }
  }
```

- [ ] **Step 8: Routes** — `backend/routes/recordRoutes.js`, next to the update route:

```js
// Soft delete a record (task 25)
router.delete('/farmers/:farmer/records/:id',
    validateFarmer,
    recordController.deleteRecord.bind(recordController)
);
```

`backend/app.js`, next to the backup endpoints (after `recordController` is required):

```js
// 🗑️ Soft-deleted pallets (task 25) — list + restore, admin only.
app.get('/api/admin/farmers/:farmer/deleted-records', ensureAdmin, recordController.listDeletedRecords.bind(recordController));
app.post('/api/admin/farmers/:farmer/records/:id/restore', ensureAdmin, recordController.restoreRecord.bind(recordController));
```

- [ ] **Step 9: Backup includes deleted records** — `backend/services/backupService.js`: `repo.getRecords(farmer)` → `repo.getRecords(farmer, { includeDeleted: true })` with comment `// include soft-deleted rows (deleted: true) so the backup is complete and matches the season-reset counts`.

- [ ] **Step 10: Run** the two files (Step 2 command) → PASS; then the full suite `cd backend && npm test` → all pass (145 + new).

- [ ] **Step 11: Docs** — `docs/api-reference.md`: the three endpoints. `docs/architecture.md`: record-fields table rows for `deleted` / `deletedBy` / `deletedAt` ("repository-managed soft-delete markers; absent on live records; not part of `PalletRecord`"), and one line that normal reads exclude them while backup includes them.

- [ ] **Step 12: Commit**
```bash
git add -A backend docs/api-reference.md docs/architecture.md
git commit -m "feat(task-25): soft-delete + admin restore of pallet records (backend)"
```

---

### Task 2: Frontend — delete in edit mode, live removal, Settings restore

**Files:**
- Create: `frontend/src/api/http.js`, `frontend/src/api/records.js`, `frontend/src/utils/applyPallet.js`, `frontend/tests/applyPallet.test.js`, `frontend/src/components/DeletedPallets.vue`, `frontend/e2e/delete-restore.spec.js`
- Modify: `frontend/src/api/certificates.js` (import `call` from `./http`), `frontend/src/composables/useFarmerEvents.js` (use `applyPallet`), `frontend/src/components/PalletTable.vue` (delete button in edit mode), `frontend/src/components/Settings.vue` (mount `DeletedPallets`), `docs/realtime.md`, `docs/redesign-plan.md`, `done.md`

**Interfaces:**
- Consumes Task 1 endpoints (above).
- Produces: `applyPallet(list, pallet, filter) → id|null` (mutates `list`); `deleteRecord(farmer, id)`, `listDeletedRecords(farmer)`, `restoreRecord(farmer, id)`.

- [ ] **Step 1: Failing unit test** — `frontend/tests/applyPallet.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { applyPallet } from '../src/utils/applyPallet.js';

describe('applyPallet', () => {
  it('merges an update into an existing row', () => {
    const list = [{ id: 'a', weight: 1, kind: 'x' }];
    expect(applyPallet(list, { id: 'a', weight: 2 })).toBe('a');
    expect(list).toEqual([{ id: 'a', weight: 2, kind: 'x' }]);
  });
  it('adds a new row that passes the filter, ignores one that does not', () => {
    const list = [];
    expect(applyPallet(list, { id: 'b', sent: true }, p => p.sent)).toBe('b');
    expect(applyPallet(list, { id: 'c', sent: false }, p => p.sent)).toBeNull();
    expect(list.map(p => p.id)).toEqual(['b']);
  });
  it('removes a row that no longer passes the filter', () => {
    const list = [{ id: 'a', sent: true }];
    expect(applyPallet(list, { id: 'a', sent: false }, p => p.sent)).toBeNull();
    expect(list).toEqual([]);
  });
  it('removes a soft-deleted row and never adds one', () => {
    const list = [{ id: 'a', weight: 1 }];
    expect(applyPallet(list, { id: 'a', deleted: true })).toBeNull();
    expect(list).toEqual([]);
    expect(applyPallet(list, { id: 'z', deleted: true })).toBeNull();
    expect(list).toEqual([]);
  });
});
```

Run `cd frontend && npm test` → FAIL (module missing).

- [ ] **Step 2: `frontend/src/utils/applyPallet.js`** — move the body of `applyOne` out of `useFarmerEvents.js` into a pure function, plus the deleted rule:

```js
// Apply one realtime pallet change to a view's list (mutates `list`). Returns the id to flash,
// or null. A soft-deleted pallet (deleted: true) is removed and never added.
export function applyPallet(list, p, filter) {
  const idx = list.findIndex(x => x.id === p.id)
  if (p.deleted) { if (idx !== -1) list.splice(idx, 1); return null }
  const passes = !filter || filter(p)
  if (idx !== -1 && !passes) { list.splice(idx, 1); return null }
  if (idx !== -1)             { list[idx] = { ...list[idx], ...p }; return p.id }
  if (idx === -1 && passes)   { list.push(p); return p.id }
  return null
}
```

In `useFarmerEvents.js`, delete the local `applyOne` and call `applyPallet(list, p, options.filter)` where `applyOne(p, list)` was called (import from `../utils/applyPallet`). Run `npm test` → PASS.

- [ ] **Step 3: API helpers.** Create `frontend/src/api/http.js` by moving `baseUrl` + `call` out of `src/api/certificates.js` (export `call`; keep its exact behavior, including `authHeaders()` and the `{status, data}` on errors), and make `certificates.js` `import { call } from './http';`. Create `frontend/src/api/records.js`:

```js
import { call } from './http';

const f = encodeURIComponent;
export const deleteRecord = (farmer, id) => call('DELETE', `/farmers/${f(farmer)}/records/${f(id)}`);
export const listDeletedRecords = (farmer) => call('GET', `/admin/farmers/${f(farmer)}/deleted-records`);
export const restoreRecord = (farmer, id) => call('POST', `/admin/farmers/${f(farmer)}/records/${f(id)}/restore`);
```

- [ ] **Step 4: PalletTable delete button.** In the edit-mode actions column (the `<div class="flex flex-col gap-1">` holding שמור / ביטול), add a third button after ביטול, shown only when the edited pallet can be deleted:

```html
                                    <button v-if="canDeleteEditing" @click="deleteEditing" :disabled="isLoading"
                                        class="text-xs px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors min-h-[32px]">
                                        מחק
                                    </button>
```

Script: import `deleteRecord` from `../api/records`; `requestConfirm`/`requestAlert` are already imported in this file (verify; import from `../composables/useDialogs` if not). Add:

```js
        // Only unsent pallets without a certificate number can be deleted (the server enforces it too).
        canDeleteEditing() {
            const p = this.pallets.find(x => x.id === this.editingId);
            return !!p && !p.sent && (p.cardId === '' || p.cardId == null);
        },
```
(in `computed`) and in `methods`:
```js
        async deleteEditing() {
            const p = this.pallets.find(x => x.id === this.editingId);
            if (!p) return;
            const ok = await requestConfirm({ title: 'מחיקת משטח', confirmText: 'מחק משטח',
                message: `למחוק את משטח ${p.palletNumber}? מנהל יכול לשחזר אותו מההגדרות (משטחים שנמחקו).` });
            if (!ok) return;
            try {
                await deleteRecord(this.farmer, p.id);
                this.$emit('update:pallets', this.pallets.filter(x => x.id !== p.id));
                this.editingId = null;
                this.editingPallet = null;
            } catch (e) {
                await requestAlert({ title: 'המחיקה נכשלה', message: e.message, variant: 'error' });
            }
        },
```
(Match the option-API layout of the file: put `canDeleteEditing` with the other computed properties, `deleteEditing` with the other methods. If `requestConfirm` options use different key names in `useDialogs.js`, follow that file.)

- [ ] **Step 5: `frontend/src/components/DeletedPallets.vue`** — a self-contained Settings section (Composition API, Tailwind, RTL), props none; injects `config`? No — it receives `farmers` (array of names) as a prop from Settings:
  - Header `<h2>` "משטחים שנמחקו" in a `section class="card space-y-3"` like the other Settings sections.
  - A `<select aria-label="חקלאי למשטחים שנמחקו">` of the farmer names (default: first); on change (and on mount when a farmer is set) call `listDeletedRecords(farmer)`.
  - Loading text "טוען...", empty text "אין משטחים שנמחקו", error text from the error message.
  - A table (`text-sm`, sticky-free, `overflow-x-auto` wrapper) with columns: מס' משטח, תאריך קטיף, זן, גודל, ארגזים, נמחק ע"י, מועד מחיקה (format `deletedAt` as `YYYY-MM-DD HH:MM` via `.slice(0,16).replace('T',' ')`), and a "שחזר" button per row with `:aria-label="\`שחזר משטח ${r.palletNumber}\`"`, min-h 40px, disabled while a restore is running.
  - Restore: `await restoreRecord(farmer, r.id)` → remove the row from the list and show inline success text `המשטח ${r.palletNumber} שוחזר`; on error show the message in red.
  In `Settings.vue`, import it and render `<DeletedPallets :farmers="localConfig.farmers.map(f => f.name)" />` right after the "ייצוא נתוני עונה" section.

- [ ] **Step 6: E2E** — `frontend/e2e/delete-restore.spec.js`:

```js
// Delete a pallet from the table (edit mode → מחק → confirm), then restore it from Settings.
import { test, expect } from '@playwright/test';
import { FARMER, navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber } from './helpers.js';

test('delete a pallet and restore it from Settings', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);

  await editRow(page, pallet);
  await page.getByRole('button', { name: 'מחק', exact: true }).click();
  await page.getByRole('button', { name: 'מחק משטח' }).click();
  await expect(rowByPallet(page, pallet)).toHaveCount(0);

  await navTo(page, 'ניהול הגדרות');
  await page.getByLabel('חקלאי למשטחים שנמחקו').selectOption(FARMER);
  await page.getByRole('button', { name: `שחזר משטח ${pallet}` }).click();
  await expect(page.getByText(`המשטח ${pallet} שוחזר`)).toBeVisible();

  await navTo(page, 'טבלת נתונים');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);
});
```

Also add to `frontend/e2e/realtime.spec.js` (reusing its two-context pattern, users ADMIN + SECOND_ADMIN): after both clients show the pallet on 'טבלת נתונים', client A deletes it via edit mode → client B's row disappears (`toHaveCount(0)`).

- [ ] **Step 7: Gates** — `cd frontend && npm test && npm run build && npm run e2e` → all pass on desktop and tablet. Screenshot (scratchpad, never the repo) the edit-mode row with the מחק button and the Settings "משטחים שנמחקו" section on tablet 1280×800; list the paths in the report.

- [ ] **Step 8: Docs** — `docs/realtime.md`: deleted rows arrive as `bulk_update` `{id, deleted: true}` and are removed by `applyPallet`; restore arrives as a normal `bulk_update`. `docs/redesign-plan.md`: remove "**25 Soft-delete + restore** …" from the P2 backlog line and add 25 to the shipped list in the ranked-board heading. `done.md`: new entry at the top of "## October 2026 — Pre-season push": `### ✅ Task 25 — Soft-delete + restore` (3–4 bullets: who can delete/restore and the sent/cardId rule; storage + read filtering + backup includes deleted; realtime + audit; tests).

- [ ] **Step 9: Commit**
```bash
git add -A frontend docs/realtime.md docs/redesign-plan.md done.md
git commit -m "feat(task-25): delete pallets from the table, restore from Settings (frontend)"
```
