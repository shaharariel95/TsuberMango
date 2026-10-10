# Complete Backups + Restore Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly backup that contains everything needed to rebuild a center, and a tested `restoreBackup.js` that puts it back.

**Architecture:** `backupService.buildBackupPayload(db, centerId)` produces a self-contained v2 JSON (config, users, farmer docs, every farmer's records incl. soft-deleted, audit, certificates with versions); `runBackup` uploads it unchanged. `services/backupRestore.js` restores a payload (v1 or v2) into a center with dry-run-by-default, refuses to overwrite existing data, and is exercised end to end against the emulator: build → wipe → restore → compare.

**Tech Stack:** Node (CommonJS), firebase-admin (BulkWriter), @google-cloud/storage, Vitest on the Firestore emulator.

**Spec (controller-authored; owner asked 2026-10-10 "let's build the restore tool"; dry run with a farmer in April — must be fully ready):**
Facts checked in production (read-only, 2026-10-10): Cloud Scheduler job `tsuberi-daily-backup` runs `0 2 * * *` Asia/Jerusalem → `POST https://api.tsuberi.com/api/internal/backup`; files land nightly in `gs://tsuberi-mangos-backups/backups/YYYY-MM-DD.json` (since May; ~295 KB in June–July, 694 B since August = test data only). No native Firestore backup schedule exists. Current payload = `{ timestamp, farmers: {name: records[]} [, certificates] }` — only farmers in the config list, no config/users/profiles/audit, and per-farmer read errors are swallowed (a partial file still gets metadata).
Decisions:
- Backup payload v2 (backward compatible keys kept): `{ version: 2, timestamp, centerId, config, users: {email: data}, farmerDocs: {name: data}, farmers: {name: records[]}, audit: {name: entries[]}, certificates: [...] }`. `farmers`/`audit` cover EVERY `centers/{c}/farmers/{name}` doc (`listDocuments()`, parent-only included) and include soft-deleted records. `rowCount` = total records; `farmerCount` = number of farmer keys.
- A backup is all-or-nothing: any read failure fails the run (no upload, no metadata, error logged) instead of silently writing a partial file.
- Restore never overwrites: a scoped farmer whose `records` (or `audit`) collection already has docs, or a certificate id that already exists, is a blocker; executing with blockers throws. Normal path: `clearSeason.js` first (or restore into an empty/emulator center).
- Restore scopes: everything (default), or `--farmer <name>` (that farmer's records + audit + farmer doc + certificates whose `farmer` matches). `--with-config` (full scope + v2 only) also replaces `config/global` and writes `users`.
- Record/audit/certificate ids are preserved (`set` on the original id). Restore writes no realtime events — clients reload.
- CLI: `node scripts/restoreBackup.js (--file <path> | --gcs <latest|YYYY-MM-DD|backups/…json>) [--farmer <name>] [--with-config] [--execute --center <CENTER_ID>]`. Dry run by default; execute needs `--execute` AND `--center` equal to the resolved `CENTER_ID` (same rule as `clearSeason.js`). Works against the emulator when `FIRESTORE_EMULATOR_HOST` is set (Admin SDK honors it) — that is the documented restore drill.

## Global Constraints
- Branch `arch-redesign`; no push/deploy/`main`; no GitHub CI. Never run `restoreBackup.js` or `clearSeason.js` against production; tests use the emulator only. Reading production (gcloud) is allowed only for read-only checks the controller already did.
- Dev-facing text English; logger.info/error in new service functions.
- Gates: `cd backend && npm test` (baseline 155). Frontend untouched.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus
1. A JSON round trip (file on disk) must restore byte-equivalent data: records, audit, certificates + versions, farmer profiles (`nextNumber`!) — test compares after `JSON.parse(JSON.stringify(payload))`.
2. A farmer missing from the config list but holding records is in the backup and gets restored.
3. Restore into a center that still has data refuses (blockers listed) and writes nothing.
4. Old v1 files (records only, no `version`) still restore.
5. A failing read during backup produces no file and no metadata (so `clearSeason`'s 24 h guard can't be satisfied by a broken backup).

---

### Task 1: Backup payload v2 (complete, all-or-nothing)

**Files:**
- Modify: `backend/services/backupService.js`
- Create: `backend/tests/backupPayload.test.js`

**Interfaces:**
- Produces: `buildBackupPayload(db, centerId) → Promise<{ version: 2, timestamp: string, centerId, config: object|null, users: {[email]: object}, farmerDocs: {[name]: object}, farmers: {[name]: Array<record & {id}>}, audit: {[name]: Array<entry & {id}>}, certificates: Array<cert & {id, versions: Array<{n, ...}>}> }>`, exported from `backupService.js` alongside the existing exports. `runBackup` uses it.

- [ ] **Step 1: Failing test** — `backend/tests/backupPayload.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import admin from 'firebase-admin';
import { createRequire } from 'node:module';

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const require = createRequire(import.meta.url);
const { buildBackupPayload } = require('../services/backupService');
const repo = require('../repositories');

const C = 'backuptest';
const center = db.collection('centers').doc(C);

beforeEach(async () => {
  await db.recursiveDelete(center);
  await center.collection('config').doc('global').set({ kinds: ['שלי'], farmers: [{ name: 'א', allowGidon: false }] });
  await center.collection('users').doc('a@x').set({ role: 'admin' });
  await center.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: 'אדם', nextNumber: 80 } });
  await center.collection('farmers').doc('א').collection('records').doc('r1').set({ palletNumber: 1, sent: false, cardId: '' });
  await center.collection('farmers').doc('א').collection('records').doc('r2').set({ palletNumber: 2, deleted: true, deletedBy: 'a@x', deletedAt: '2026-10-10T00:00:00Z' });
  await center.collection('farmers').doc('א').collection('audit').doc('a1').set({ recordId: 'r1', action: 'קליטה' });
  // Not in the config list, records only (no farmers/ב document)
  await center.collection('farmers').doc('ב').collection('records').doc('r3').set({ palletNumber: 3 });
  const cert = center.collection('certificates').doc('א__79');
  await cert.set({ farmer: 'א', number: 79, currentVersion: 2, recordIds: ['r1'] });
  await cert.collection('versions').doc('1').set({ issuedAt: '2026-10-01T00:00:00Z' });
  await cert.collection('versions').doc('2').set({ issuedAt: '2026-10-02T00:00:00Z' });
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

describe('buildBackupPayload (v2)', () => {
  it('contains config, users, farmer docs, every farmer incl. unlisted + soft-deleted records, audit and certificates', async () => {
    const p = await buildBackupPayload(db, C);
    expect(p.version).toBe(2);
    expect(p.centerId).toBe(C);
    expect(typeof p.timestamp).toBe('string');
    expect(p.config.kinds).toEqual(['שלי']);
    expect(p.users).toEqual({ 'a@x': { role: 'admin' } });
    expect(p.farmerDocs['א'].certificateProfile.nextNumber).toBe(80);
    expect(p.farmerDocs['ב']).toBeUndefined();
    expect(p.farmers['א'].map(r => r.id).sort()).toEqual(['r1', 'r2']);
    expect(p.farmers['א'].find(r => r.id === 'r2').deleted).toBe(true);
    expect(p.farmers['ב'].map(r => r.id)).toEqual(['r3']);
    expect(p.audit['א']).toEqual([{ id: 'a1', recordId: 'r1', action: 'קליטה' }]);
    expect(p.audit['ב']).toEqual([]);
    expect(p.certificates).toHaveLength(1);
    expect(p.certificates[0]).toMatchObject({ id: 'א__79', number: 79 });
    expect(p.certificates[0].versions.map(v => v.n)).toEqual([1, 2]);
  });

  it('fails as a whole when any read fails (no partial backup)', async () => {
    const spy = vi.spyOn(repo, 'getRecords').mockRejectedValueOnce(new Error('boom'));
    try {
      await expect(buildBackupPayload(db, C)).rejects.toThrow('boom');
    } finally { spy.mockRestore(); }
  });
});
```

(`listAllWithVersions` on the certificate repository reads `centers/{CENTER_ID}/certificates` for the process's `CENTER_ID`; `buildBackupPayload` must read certificates for the `centerId` argument instead — read `centers/{centerId}/certificates` + `versions` directly with `db`, sorted by version number, in the same `{ id, ...data, versions: [{ n, ...data }] }` shape. Likewise records: use `repo.getRecords(name, { includeDeleted: true })` only if the repo is bound to `centerId`; since the repository singleton is bound to the process `CENTER_ID`, construct `new FirestoreRepository(db, centerId)` (from `../repositories/FirestoreRepository`) inside `buildBackupPayload` and call `getRecords(name, { includeDeleted: true })` on it. The failure test above spies on the singleton — change it to `vi.spyOn(FirestoreRepository.prototype, 'getRecords')` (import via `require('../repositories/FirestoreRepository')`) so it covers the instance you construct.)

- [ ] **Step 2: Run to verify it fails** — from `backend/`: `npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/backupPayload.test.js"` → FAIL (`buildBackupPayload` is not a function).

- [ ] **Step 3: Implement `buildBackupPayload`** in `backend/services/backupService.js` (keep the file's 4-space style):

```js
const FirestoreRepository = require('../repositories/FirestoreRepository');

/**
 * Build a complete, self-contained backup of one center (payload v2).
 * Every farmers/{name} doc is included (also ones missing from the config list), with soft-deleted
 * records. Any read failure rejects — a backup is all-or-nothing.
 */
async function buildBackupPayload(db, centerId) {
    const center = db.collection('centers').doc(centerId);
    const records = new FirestoreRepository(db, centerId);

    const configSnap = await center.collection('config').doc('global').get();
    const usersSnap = await center.collection('users').get();
    const farmerRefs = await center.collection('farmers').listDocuments();

    const farmerDocs = {};
    const farmers = {};
    const audit = {};
    for (const ref of farmerRefs) {
        const docSnap = await ref.get();
        if (docSnap.exists) farmerDocs[ref.id] = docSnap.data();
        farmers[ref.id] = await records.getRecords(ref.id, { includeDeleted: true });
        const auditSnap = await ref.collection('audit').get();
        audit[ref.id] = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const certSnap = await center.collection('certificates').get();
    const certificates = [];
    for (const d of certSnap.docs) {
        const vs = await d.ref.collection('versions').get();
        const versions = vs.docs.map(v => ({ n: Number(v.id), ...v.data() })).sort((a, b) => a.n - b.n);
        certificates.push({ id: d.id, ...d.data(), versions });
    }

    return {
        version: 2,
        timestamp: new Date().toISOString(),
        centerId,
        config: configSnap.exists ? configSnap.data() : null,
        users: Object.fromEntries(usersSnap.docs.map(d => [d.id, d.data()])),
        farmerDocs,
        farmers,
        audit,
        certificates,
    };
}
```

Then rewrite `runBackup(triggeredBy)` to: check `BUCKET_NAME`; `const payload = await buildBackupPayload(admin.firestore(), CENTER_ID)` (require `CENTER_ID` from `../config/center` at the top); `rowCount` = sum of `payload.farmers[*].length`; `farmerCount` = `Object.keys(payload.farmers).length`; filename from `payload.timestamp.slice(0, 10)`; upload `JSON.stringify(payload, null, 2)`; write the metadata doc exactly as today (same fields); log; return `{ filename, rowCount, farmerCount }`. Delete `getFarmerNames` and the per-farmer try/catch that swallowed errors (all-or-nothing). Export `buildBackupPayload` with the existing exports. Do not change `getRecentBackups` or the GCS client.

- [ ] **Step 4: Run** the file (Step 2 command) → PASS; then `cd backend && npm test` → all pass.

- [ ] **Step 5: Commit**
```bash
git add backend/services/backupService.js backend/tests/backupPayload.test.js
git commit -m "feat(backup): complete v2 payload (config, users, profiles, all farmers, audit, certificates), all-or-nothing"
```

---

### Task 2: `backupRestore` service + `restoreBackup.js` CLI + docs

**Files:**
- Create: `backend/services/backupRestore.js`, `backend/scripts/restoreBackup.js`, `backend/tests/backupRestore.test.js`
- Modify: `NEW_SEASON.md`, `backend/CLOUD_SCHEDULER.md`, `docs/architecture.md`, `docs/redesign-plan.md`, `done.md`

**Interfaces:**
- Consumes: `buildBackupPayload(db, centerId)` (Task 1); `resetSeason(db, centerId, { execute, skipBackupCheck })` from `services/seasonReset.js`.
- Produces: `restoreBackup(db, centerId, payload, { execute = false, farmer = null, withConfig = false } = {}) → Promise<{ executed, version, backupTimestamp, farmers: {[name]: {records, audit}}, farmerDocs: number, certificates: number, certificateVersions: number, config: boolean, users: number, blockers: string[] }>`; throws on an invalid payload, an unknown `farmer`, `withConfig` with `farmer` or a v1 payload, or `execute` with blockers.

- [ ] **Step 1: Failing tests** — `backend/tests/backupRestore.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { createRequire } from 'node:module';

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const require = createRequire(import.meta.url);
const { buildBackupPayload } = require('../services/backupService');
const { restoreBackup } = require('../services/backupRestore');
const { resetSeason } = require('../services/seasonReset');

const A = 'restoresrc';
const B = 'restoredst';
const ca = db.collection('centers').doc(A);
const cb = db.collection('centers').doc(B);

async function seed() {
  await db.recursiveDelete(ca);
  await db.recursiveDelete(cb);
  await ca.collection('config').doc('global').set({ kinds: ['שלי'], farmers: [{ name: 'א', allowGidon: true }] });
  await ca.collection('users').doc('a@x').set({ role: 'admin' });
  await ca.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: 'אדם', nextNumber: 80 } });
  await ca.collection('farmers').doc('א').collection('records').doc('r1').set({ palletNumber: 1, boxes: 40, cardId: 79, sent: true, weight: 700 });
  await ca.collection('farmers').doc('א').collection('records').doc('r2').set({ palletNumber: 2, deleted: true, deletedBy: 'a@x', deletedAt: '2026-10-10T00:00:00Z' });
  await ca.collection('farmers').doc('א').collection('audit').doc('a1').set({ recordId: 'r1', action: 'קליטה', editedAt: '2026-10-01T00:00:00Z' });
  await ca.collection('farmers').doc('ב').collection('records').doc('r3').set({ palletNumber: 3 });
  const cert = ca.collection('certificates').doc('א__79');
  await cert.set({ farmer: 'א', number: 79, currentVersion: 2, recordIds: ['r1'] });
  await cert.collection('versions').doc('1').set({ issuedAt: '2026-10-01T00:00:00Z', rows: [{ palletNumber: 1 }] });
  await cert.collection('versions').doc('2').set({ issuedAt: '2026-10-02T00:00:00Z', rows: [{ palletNumber: 1 }] });
}
// Everything restore must bring back, normalized for comparison
async function snapshot(center) {
  const out = { farmerDocs: {}, records: {}, audit: {}, certs: {} };
  for (const ref of await center.collection('farmers').listDocuments()) {
    const d = await ref.get();
    if (d.exists) out.farmerDocs[ref.id] = d.data();
    out.records[ref.id] = Object.fromEntries((await ref.collection('records').get()).docs.map(x => [x.id, x.data()]));
    out.audit[ref.id] = Object.fromEntries((await ref.collection('audit').get()).docs.map(x => [x.id, x.data()]));
  }
  for (const c of (await center.collection('certificates').get()).docs) {
    out.certs[c.id] = { ...c.data(), versions: Object.fromEntries((await c.ref.collection('versions').get()).docs.map(v => [v.id, v.data()])) };
  }
  return out;
}
const asFile = async (center) => JSON.parse(JSON.stringify(await buildBackupPayload(db, center)));

beforeEach(seed);
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

describe('restoreBackup', () => {
  it('backup → wipe → restore brings back records (incl. deleted and unlisted farmers), audit, certificates and profiles', async () => {
    const before = await snapshot(ca);
    const payload = await asFile(A);
    await resetSeason(db, A, { execute: true, skipBackupCheck: true });
    await ca.collection('farmers').doc('א').update({ certificateProfile: admin.firestore.FieldValue.delete() });

    const dry = await restoreBackup(db, A, payload);
    expect(dry).toMatchObject({ executed: false, version: 2, blockers: [], certificates: 1, certificateVersions: 2, farmerDocs: 1, config: false, users: 0 });
    expect(dry.farmers).toEqual({ 'א': { records: 2, audit: 1 }, 'ב': { records: 1, audit: 0 } });
    expect((await ca.collection('farmers').doc('א').collection('records').get()).size).toBe(0);

    const done = await restoreBackup(db, A, payload, { execute: true });
    expect(done.executed).toBe(true);
    expect(await snapshot(ca)).toEqual(before);
  });

  it('refuses to restore over existing data and writes nothing', async () => {
    const payload = await asFile(A);
    const dry = await restoreBackup(db, A, payload);
    expect(dry.blockers.length).toBeGreaterThan(0);
    await expect(restoreBackup(db, A, payload, { execute: true })).rejects.toThrow(/not empty|exists/i);
    expect((await ca.collection('farmers').doc('א').collection('records').get()).size).toBe(2);
  });

  it('restores a single farmer (records, audit, farmer doc, its certificates) into another center', async () => {
    const payload = await asFile(A);
    await restoreBackup(db, B, payload, { execute: true, farmer: 'א' });
    expect((await cb.collection('farmers').doc('א').collection('records').get()).size).toBe(2);
    expect((await cb.collection('farmers').doc('ב').collection('records').get()).size).toBe(0);
    expect((await cb.collection('certificates').doc('א__79').get()).exists).toBe(true);
    expect((await cb.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(80);
    expect((await cb.collection('config').doc('global').get()).exists).toBe(false);
    await expect(restoreBackup(db, B, payload, { farmer: 'אין-כזה' })).rejects.toThrow();
  });

  it('--with-config also restores config and users (full scope, v2 only)', async () => {
    const payload = await asFile(A);
    await restoreBackup(db, B, payload, { execute: true, withConfig: true });
    expect((await cb.collection('config').doc('global').get()).data().kinds).toEqual(['שלי']);
    expect((await cb.collection('users').doc('a@x').get()).data()).toEqual({ role: 'admin' });
    await expect(restoreBackup(db, B, payload, { withConfig: true, farmer: 'א' })).rejects.toThrow();
  });

  it('restores an old v1 file (records only)', async () => {
    const v1 = { timestamp: '2026-07-01T23:00:00.000Z', farmers: { 'ג': [{ id: 'x1', palletNumber: 9, boxes: 1 }] } };
    const out = await restoreBackup(db, B, v1, { execute: true });
    expect(out.version).toBe(1);
    expect((await cb.collection('farmers').doc('ג').collection('records').doc('x1').get()).data()).toEqual({ palletNumber: 9, boxes: 1 });
    await expect(restoreBackup(db, B, v1, { withConfig: true })).rejects.toThrow();
  });

  it('rejects a payload that is not a backup', async () => {
    await expect(restoreBackup(db, B, { hello: 1 })).rejects.toThrow(/not a backup/i);
  });
});
```

Run (from `backend/`): `npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/backupRestore.test.js"` → FAIL (module missing).

- [ ] **Step 2: `backend/services/backupRestore.js`**

```js
// Restore a backup payload (v1: { timestamp, farmers }, v2: see backupService.buildBackupPayload)
// into a center. Dry run unless { execute: true }. Never overwrites: a farmer whose records/audit
// already exist, or a certificate id that exists, is a blocker and execute refuses.
// Ids are preserved. No realtime events are written — clients reload.
const logger = require('../utils/logger');

function stripId({ id, ...rest }) { return rest; }

async function restoreBackup(db, centerId, payload, { execute = false, farmer = null, withConfig = false } = {}) {
  if (!payload || typeof payload !== 'object' || typeof payload.timestamp !== 'string'
      || !payload.farmers || typeof payload.farmers !== 'object') {
    throw new Error('Input is not a backup (needs timestamp + farmers)');
  }
  const version = payload.version === 2 ? 2 : 1;
  if (withConfig && (farmer || version !== 2)) throw new Error('--with-config needs a full (no --farmer) restore of a v2 backup');
  if (farmer && !(farmer in payload.farmers)) throw new Error(`Farmer "${farmer}" is not in this backup`);

  const center = db.collection('centers').doc(centerId);
  const names = farmer ? [farmer] : Object.keys(payload.farmers);
  const audit = payload.audit || {};
  const farmerDocs = payload.farmerDocs || {};
  const certificates = (payload.certificates || []).filter(c => !farmer || c.farmer === farmer);

  const blockers = [];
  const farmers = {};
  for (const name of names) {
    const ref = center.collection('farmers').doc(name);
    farmers[name] = { records: payload.farmers[name].length, audit: (audit[name] || []).length };
    const [r, a] = await Promise.all([ref.collection('records').limit(1).get(), ref.collection('audit').limit(1).get()]);
    if (!r.empty) blockers.push(`farmer "${name}": records not empty`);
    if (!a.empty) blockers.push(`farmer "${name}": audit not empty`);
  }
  for (const c of certificates) {
    if ((await center.collection('certificates').doc(c.id).get()).exists) blockers.push(`certificate ${c.id} exists`);
  }
  const summary = {
    executed: false, version, backupTimestamp: payload.timestamp, farmers,
    farmerDocs: names.filter(n => farmerDocs[n]).length,
    certificates: certificates.length,
    certificateVersions: certificates.reduce((s, c) => s + (c.versions || []).length, 0),
    config: withConfig, users: withConfig ? Object.keys(payload.users || {}).length : 0,
    blockers,
  };
  logger.info(`[backupRestore] ${centerId} ${execute ? 'EXECUTE' : 'dry run'} from ${payload.timestamp}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;
  if (blockers.length) throw new Error(`Target is not empty — nothing written: ${blockers.join('; ')}`);

  const writer = db.bulkWriter();
  for (const name of names) {
    const ref = center.collection('farmers').doc(name);
    if (farmerDocs[name]) writer.set(ref, farmerDocs[name], { merge: true });
    for (const rec of payload.farmers[name]) writer.set(ref.collection('records').doc(rec.id), stripId(rec));
    for (const e of audit[name] || []) writer.set(ref.collection('audit').doc(e.id), stripId(e));
  }
  for (const c of certificates) {
    const { versions = [], ...cert } = stripId(c);
    const certRef = center.collection('certificates').doc(c.id);
    writer.set(certRef, cert);
    for (const { n, ...v } of versions) writer.set(certRef.collection('versions').doc(String(n)), v);
  }
  if (withConfig) {
    if (payload.config) writer.set(center.collection('config').doc('global'), payload.config);
    for (const [email, data] of Object.entries(payload.users || {})) writer.set(center.collection('users').doc(email), data);
  }
  await writer.close();
  logger.info(`[backupRestore] ${centerId}: restored backup from ${payload.timestamp}`);
  return { ...summary, executed: true };
}

module.exports = { restoreBackup };
```

Note for the implementer: v1 records always carry `id` (backups have included it since May); a record without `id` is a corrupt file — throw `Error('Record without id in farmer "…"')` during the blocker phase rather than inventing ids.

- [ ] **Step 3: CLI `backend/scripts/restoreBackup.js`**

```js
// Restore a backup into the center in CENTER_ID. Dry run by default (prints what would be written
// and any blockers). Source: --file <path> or --gcs <latest|YYYY-MM-DD|backups/…json> (bucket GCS_BACKUP_BUCKET).
//   node scripts/restoreBackup.js --gcs latest
//   node scripts/restoreBackup.js --gcs 2026-12-14 --execute --center <CENTER_ID> [--farmer <name>] [--with-config]
// Refuses to overwrite existing data — clear first (scripts/clearSeason.js) or restore into an empty center.
// Restore drill (no production writes): set FIRESTORE_EMULATOR_HOST and CENTER_ID=drill — see NEW_SEASON.md.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');
const { restoreBackup } = require('../services/backupRestore');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const keyFile = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');

async function readSource() {
  if (value('--file')) return JSON.parse(fs.readFileSync(value('--file'), 'utf8'));
  const which = value('--gcs');
  if (!which) throw new Error('Give --file <path> or --gcs <latest|YYYY-MM-DD|backups/…json>');
  const bucketName = process.env.GCS_BACKUP_BUCKET;
  if (!bucketName) throw new Error('GCS_BACKUP_BUCKET is not set');
  const bucket = new Storage(fs.existsSync(keyFile) ? { keyFilename: keyFile } : {}).bucket(bucketName);
  let name = which;
  if (which === 'latest') {
    const [files] = await bucket.getFiles({ prefix: 'backups/' });
    if (!files.length) throw new Error('No backups in the bucket');
    name = files.map(f => f.name).sort().pop();
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(which)) {
    name = `backups/${which}.json`;
  }
  logger.info(`[restoreBackup] reading gs://${bucketName}/${name}`);
  const [buf] = await bucket.file(name).download();
  return JSON.parse(buf.toString('utf8'));
}

(async () => {
  if (!admin.apps.length) {
    admin.initializeApp(fs.existsSync(keyFile)
      ? { credential: admin.credential.cert(require(keyFile)), projectId: process.env.FIREBASE_PROJECT_ID }
      : { projectId: process.env.FIREBASE_PROJECT_ID || 'demo-tsuber' });
  }
  const execute = flag('--execute') && value('--center') === CENTER_ID;
  if (flag('--execute') && !execute) {
    logger.error(`[restoreBackup] --execute needs --center ${CENTER_ID} (the resolved CENTER_ID) — running as a dry run instead`);
  }
  const payload = await readSource();
  const out = await restoreBackup(admin.firestore(), CENTER_ID, payload,
    { execute, farmer: value('--farmer') || null, withConfig: flag('--with-config') });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((err) => { logger.error(`[restoreBackup] ${err.message}`); process.exit(1); });
```

- [ ] **Step 4: Run** the restore test file (Step 1 command) → PASS; then `cd backend && npm test` → all pass. Also smoke the CLI against the emulator only, with a file: inside `npx firebase emulators:exec --only firestore --project demo-tsuber "…"` write a tiny v1 JSON to the scratchpad and run `node scripts/restoreBackup.js --file <it>` (dry run) — expect the JSON summary with `executed: false`. Put the exact command and output in the report. Never point it at production.

- [ ] **Step 5: Docs**
  - `NEW_SEASON.md`: (a) update the backup description (v2: complete — config, users, farmer certificate details, every farmer incl. ones not in the list, deleted pallets, history, certificates; a failed read fails the whole backup, so a backup in the list is complete); (b) simplify §3's row-count step accordingly — keep "rows must equal the dry run's total", drop cause (a)/(b) and say instead: if they differ, a pallet was added or changed after the backup; take a fresh backup; (c) add a new section "Restoring from a backup" with: when (data lost/corrupted), dry run `node scripts/restoreBackup.js --gcs latest`, clear first if needed (`clearSeason.js`), execute `--execute --center tsuberi`, single farmer `--farmer`, `--with-config` only when settings/users were lost too, and the **restore drill** (rehearse before April without touching production: `gcloud storage cp gs://tsuberi-mangos-backups/backups/<date>.json .` then, from `backend/`, `npx firebase emulators:exec --only firestore --project demo-tsuber "set CENTER_ID=drill&& node scripts/restoreBackup.js --file <file> --execute --center drill"` — on Windows PowerShell use the npm-free form shown in the script header if `set` misbehaves; the implementer must make the documented command actually work on this Windows machine and paste its output in the report).
  - `backend/CLOUD_SCHEDULER.md`: one paragraph on the v2 payload contents, the all-or-nothing rule, and `restoreBackup.js`.
  - `docs/architecture.md`: file map lines for `services/backupRestore.js`, `scripts/restoreBackup.js`, and update the backupService line (v2).
  - `docs/redesign-plan.md`: in Pre-season ops add "run a restore drill (NEW_SEASON.md) before the April dry run"; in the P2 list mark task 12 (daily backup) as shipped/verified (job `tsuberi-daily-backup`, nightly since May).
  - `done.md`: new entry at the top of "## October 2026 — Pre-season push": `### ✅ Backups you can restore` (3–4 bullets: verified nightly job; v2 payload; restore tool + guards; drill).

- [ ] **Step 6: Commit**
```bash
git add backend/services/backupRestore.js backend/scripts/restoreBackup.js backend/tests/backupRestore.test.js NEW_SEASON.md backend/CLOUD_SCHEDULER.md docs/architecture.md docs/redesign-plan.md done.md
git commit -m "feat(backup): restoreBackup tool (dry run default, never overwrites, v1+v2) + restore drill docs"
```
