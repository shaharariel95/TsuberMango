# Season Reset Tooling + NEW_SEASON.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A safe, tested script that clears one season's operational data (or pre-season test data) from Firestore, and a `NEW_SEASON.md` that describes the Firestore-era season ritual.

**Architecture:** `backend/services/seasonReset.js` holds the logic (pure Firestore Admin calls, injectable `db`/`now`, dry-run by default) so the emulator tests exercise exactly what the CLI runs. `backend/scripts/clearSeason.js` is a thin CLI over it with double confirmation and a "recent backup" guard.

**Tech Stack:** Node (CommonJS), firebase-admin, Vitest on the Firestore emulator.

**Spec (controller-authored, owner delegated decisions overnight 2026-10-09):** the board's pre-season ops item says "clear test farmers/data from production (including `centers/tsuberi/certificates/**`, and BEFORE seeding — never delete `farmers/{name}` docs afterwards, they hold `certificateProfile`)" and "rewrite `NEW_SEASON.md` for the Firestore era". Task 11 (real season management/archival) stays the long-term fix; this is the manual ritual's tooling.
Decisions:
- Deleted by a reset: every farmer's `records` and `audit` subcollections, the whole `certificates` collection (with `versions`), all `farmer_events` docs. Kept: `config/**`, `users/**`, the `farmers/{name}` documents themselves and their fields (`certificateProfile` — certificate numbers continue across seasons), the top-level `backups` metadata, GCS backup files.
- Execute requires `--execute` AND `--center <id>` equal to the resolved `CENTER_ID`; otherwise it is a dry run that only prints counts.
- Execute refuses unless a `backups` metadata doc with `timestamp` within the last 24 h exists; `--skip-backup-check` overrides (for wiping pre-season test data), and the script logs loudly when used.
- The script never touches farmer names it can't find: it enumerates `centers/{c}/farmers` with `listDocuments()` (includes docs that exist only as parents of subcollections).

## Global Constraints
- Branch `arch-redesign`; no push, deploy, or `main`. Never run the script against production — tests use the emulator only.
- Dev-facing text English. `logger.info`/`logger.error` in the service.
- Gates: `cd backend && npm test` (baseline: whatever HEAD has — 141 at plan time). Frontend untouched.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus
1. A farmer that has records but no `farmers/{name}` document (parent-only) → its records are still found and deleted (`listDocuments`).
2. Dry run (the default) deletes nothing at all, even when `--execute` is given without a matching `--center`.
3. A backup older than 24 h, or none at all → execute refuses with a clear message, nothing deleted.
4. `certificateProfile` (and any other field on the farmer doc) survives an execute.
5. Another center's data is never touched.

---

### Task 1: `seasonReset` service + `clearSeason.js` CLI

**Files:**
- Create: `backend/services/seasonReset.js`, `backend/scripts/clearSeason.js`, `backend/tests/seasonReset.test.js`

**Interfaces:**
- Produces: `resetSeason(db, centerId, { execute = false, skipBackupCheck = false, now = new Date() } = {})` → `Promise<{ executed: boolean, farmers: { [name]: { records: number, audit: number } }, certificates: number, certificateVersions: number, farmerEvents: number }>`; throws `Error('No backup in the last 24 hours …')` when executing without a recent backup (and without `skipBackupCheck`).

- [ ] **Step 1: Failing tests** — `backend/tests/seasonReset.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { createRequire } from 'node:module';

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { resetSeason } = createRequire(import.meta.url)('../services/seasonReset');

const C = 'resettest';
const OTHER = 'resetother';
const center = db.collection('centers').doc(C);
const NOW = new Date('2026-12-01T10:00:00Z');

async function seed() {
  await db.recursiveDelete(center);
  await db.recursiveDelete(db.collection('centers').doc(OTHER));
  await db.recursiveDelete(db.collection('backups'));
  await center.collection('config').doc('global').set({ farmers: [{ name: 'א', allowGidon: false }] });
  await center.collection('users').doc('a@x').set({ role: 'admin' });
  await center.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: '', nextNumber: 77 } });
  await center.collection('farmers').doc('א').collection('records').add({ palletNumber: 1 });
  await center.collection('farmers').doc('א').collection('records').add({ palletNumber: 2 });
  await center.collection('farmers').doc('א').collection('audit').add({ action: 'קליטה' });
  // Parent-only farmer: records exist but no farmers/ב document
  await center.collection('farmers').doc('ב').collection('records').add({ palletNumber: 3 });
  const cert = center.collection('certificates').doc('א__76');
  await cert.set({ number: 76 });
  await cert.collection('versions').doc('1').set({ n: 1 });
  await cert.collection('versions').doc('2').set({ n: 2 });
  await center.collection('farmer_events').doc('א').set({ type: 'create' });
  await db.collection('centers').doc(OTHER).collection('farmers').doc('ג').collection('records').add({ palletNumber: 9 });
}
const count = async (ref) => (await ref.get()).size;

beforeEach(seed);
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

describe('resetSeason', () => {
  it('dry run (default) reports counts and deletes nothing', async () => {
    const out = await resetSeason(db, C, { now: NOW });
    expect(out).toEqual({ executed: false, farmers: { 'א': { records: 2, audit: 1 }, 'ב': { records: 1, audit: 0 } },
      certificates: 1, certificateVersions: 2, farmerEvents: 1 });
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(2);
    expect(await count(center.collection('certificates'))).toBe(1);
  });

  it('execute without a backup in the last 24h refuses and deletes nothing', async () => {
    await expect(resetSeason(db, C, { execute: true, now: NOW })).rejects.toThrow(/backup/i);
    await db.collection('backups').add({ timestamp: admin.firestore.Timestamp.fromDate(new Date('2026-11-29T10:00:00Z')) });
    await expect(resetSeason(db, C, { execute: true, now: NOW })).rejects.toThrow(/backup/i);
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(2);
  });

  it('execute with a recent backup clears the season and keeps config, users, profiles and other centers', async () => {
    await db.collection('backups').add({ timestamp: admin.firestore.Timestamp.fromDate(new Date('2026-12-01T08:00:00Z')) });
    const out = await resetSeason(db, C, { execute: true, now: NOW });
    expect(out.executed).toBe(true);
    expect(out.farmers['ב']).toEqual({ records: 1, audit: 0 });
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(0);
    expect(await count(center.collection('farmers').doc('א').collection('audit'))).toBe(0);
    expect(await count(center.collection('farmers').doc('ב').collection('records'))).toBe(0);
    expect(await count(center.collection('certificates'))).toBe(0);
    expect(await count(center.collection('certificates').doc('א__76').collection('versions'))).toBe(0);
    expect(await count(center.collection('farmer_events'))).toBe(0);
    expect((await center.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(77);
    expect((await center.collection('config').doc('global').get()).exists).toBe(true);
    expect((await center.collection('users').doc('a@x').get()).exists).toBe(true);
    expect(await count(db.collection('centers').doc(OTHER).collection('farmers').doc('ג').collection('records'))).toBe(1);
  });

  it('skipBackupCheck allows execute without a backup', async () => {
    const out = await resetSeason(db, C, { execute: true, skipBackupCheck: true, now: NOW });
    expect(out.executed).toBe(true);
    expect(await count(center.collection('certificates'))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — from `backend/`: `npx firebase emulators:exec --only auth,firestore --project demo-tsuber "npx vitest run tests/seasonReset.test.js"` → FAIL (module not found).

- [ ] **Step 3: Implement `backend/services/seasonReset.js`**

```js
// Season reset: clears one center's operational data — every farmer's records + audit, all
// certificates (with versions) and realtime farmer_events. Keeps config, users, the farmers/{name}
// documents (certificateProfile: numbering continues across seasons) and backups.
// Dry run unless { execute: true }. Executing requires a backup from the last 24 h
// (top-level `backups` metadata) unless { skipBackupCheck: true }.
const logger = require('../utils/logger');

const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function assertRecentBackup(db, now) {
  const snap = await db.collection('backups').orderBy('timestamp', 'desc').limit(1).get();
  const latest = snap.empty ? null : snap.docs[0].data().timestamp?.toDate?.();
  if (!latest || now.getTime() - latest.getTime() > BACKUP_MAX_AGE_MS) {
    throw new Error(`No backup in the last 24 hours (latest: ${latest ? latest.toISOString() : 'none'}). Run one from Settings → גיבויים first.`);
  }
}

async function resetSeason(db, centerId, { execute = false, skipBackupCheck = false, now = new Date() } = {}) {
  const center = db.collection('centers').doc(centerId);
  const farmerRefs = await center.collection('farmers').listDocuments();
  const farmers = {};
  for (const ref of farmerRefs) {
    const [records, audit] = await Promise.all([ref.collection('records').count().get(), ref.collection('audit').count().get()]);
    farmers[ref.id] = { records: records.data().count, audit: audit.data().count };
  }
  const certSnap = await center.collection('certificates').get();
  let certificateVersions = 0;
  for (const d of certSnap.docs) certificateVersions += (await d.ref.collection('versions').count().get()).data().count;
  const farmerEvents = (await center.collection('farmer_events').count().get()).data().count;
  const summary = { executed: false, farmers, certificates: certSnap.size, certificateVersions, farmerEvents };
  logger.info(`[seasonReset] ${centerId} ${execute ? 'EXECUTE' : 'dry run'}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;

  if (skipBackupCheck) logger.warn(`[seasonReset] ${centerId}: backup check SKIPPED`);
  else await assertRecentBackup(db, now);

  for (const ref of farmerRefs) {
    await db.recursiveDelete(ref.collection('records'));
    await db.recursiveDelete(ref.collection('audit'));
  }
  await db.recursiveDelete(center.collection('certificates'));
  await db.recursiveDelete(center.collection('farmer_events'));
  logger.info(`[seasonReset] ${centerId}: season data cleared`);
  return { ...summary, executed: true };
}

module.exports = { resetSeason };
```

(If `logger.warn` does not exist on the winston logger in `backend/utils/logger.js`, use `logger.info` with a `WARNING:` prefix.)

- [ ] **Step 4: CLI `backend/scripts/clearSeason.js`**

```js
// Clear one season's operational data (records, audit, certificates, realtime events) for the
// center in CENTER_ID. Keeps config, users, farmer certificate profiles and backups.
// Dry run by default (prints counts). To delete:
//   node scripts/clearSeason.js --execute --center <CENTER_ID> [--skip-backup-check]
// Executing requires a backup from the last 24 h unless --skip-backup-check (pre-season test data).
require('dotenv').config();
const path = require('path');
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');
const { resetSeason } = require('../services/seasonReset');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const centerArg = args[args.indexOf('--center') + 1];
const execute = flag('--execute') && args.includes('--center') && centerArg === CENTER_ID;

if (!admin.apps.length) {
  const keyFile = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');
  admin.initializeApp({ credential: admin.credential.cert(require(keyFile)), projectId: process.env.FIREBASE_PROJECT_ID });
}

(async () => {
  if (flag('--execute') && !execute) {
    logger.error(`[clearSeason] --execute needs --center ${CENTER_ID} (the resolved CENTER_ID) — running as a dry run instead`);
  }
  const out = await resetSeason(admin.firestore(), CENTER_ID, { execute, skipBackupCheck: flag('--skip-backup-check') });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((err) => { logger.error(`[clearSeason] ${err.message}`); process.exit(1); });
```

- [ ] **Step 5: Run tests** — the single file (Step 2 command), then the full backend suite `cd backend && npm test`. Expected: all pass.

- [ ] **Step 6: Commit**
```bash
git add backend/services/seasonReset.js backend/scripts/clearSeason.js backend/tests/seasonReset.test.js
git commit -m "feat(ops): season reset service + clearSeason CLI (dry run default, recent-backup guard)"
```

---

### Task 2: Rewrite `NEW_SEASON.md` for the Firestore era; board + docs

**Files:**
- Modify: `NEW_SEASON.md` (full rewrite), `docs/redesign-plan.md` (pre-season ops item), `docs/architecture.md` (scripts list), `done.md` (new entry)

- [ ] **Step 1: Rewrite `NEW_SEASON.md`** (English, ≤ ~90 lines) with these sections, in order:
  1. **How the data is laid out** — Firestore under `centers/tsuberi/…`: `config/global` (kinds, sizes, destinations, farmers `{name, allowGidon, archived?}`), `users`, `farmers/{name}` (`certificateProfile`) with `records` + `audit`, `certificates/{farmer}__{number}` with `versions`, `farmer_events`. Google Sheets is only a cold archive of past seasons.
  2. **End of season** — (a) Settings → ייצוא נתוני עונה (Excel for the after-season calculations); (b) Settings → גיבויים → run a backup (JSON of all records + certificates to the GCS bucket) and confirm it appears in the list.
  3. **Before the next season** — (a) take a fresh backup (the reset refuses without one from the last 24 h); (b) dry run: `cd backend && node scripts/clearSeason.js` and read the counts; (c) execute: `node scripts/clearSeason.js --execute --center tsuberi`; (d) what it deletes vs keeps (copy the Decisions list from this plan); (e) Settings: hide farmers who left (data stays), add new farmers, check each farmer's פרטי תעודה (header lines, driver, next number — numbering continues from last season); kinds/sizes/destinations lists; users.
  4. **First-time setup only (2026 season)** — clearing pre-season test data uses `--skip-backup-check`; run `scripts/seedCertificateProfiles.js --dry-run` then for real AFTER clearing; enter Avner/Idan/Kopler profiles manually; printer check via Settings → פרטי תעודה → תצוגה מקדימה (never issue a real certificate to test — it consumes a number); then delete `seedCertificateProfiles.js` and the `googleapis` dependency.
  5. **Deploying** — one paragraph pointing to the `deploy` skill (`.claude/skills/deploy/SKILL.md`): backend Cloud Run `backend-service` (project `tsuberi-mangos`, `europe-west1`), frontend Firebase Hosting (`tsuberi-mangos-7e449`); no per-season env vars any more (remove `SPREADSHEET_ID` / `SHIPPING_LABELS_ID_*` from Cloud Run if still set).
- [ ] **Step 2: Board** — `docs/redesign-plan.md` "Pre-season ops" item: replace "rewrite `NEW_SEASON.md` for the Firestore era" with "follow `NEW_SEASON.md`", and "clear test farmers/data from production (…)" with "clear pre-season test data with `scripts/clearSeason.js` (see `NEW_SEASON.md` §4)". Keep the rest of the item.
- [ ] **Step 3: `docs/architecture.md`** — add `services/seasonReset.js` and `scripts/clearSeason.js` to the file map with one line each.
- [ ] **Step 4: `done.md`** — new entry at the top of "## October 2026 — Pre-season push": `### ✅ Pre-season ops tooling — season reset + NEW_SEASON.md` (2–3 bullets: what the script deletes/keeps, guards, docs rewritten).
- [ ] **Step 5: Commit**
```bash
git add NEW_SEASON.md docs/redesign-plan.md docs/architecture.md done.md
git commit -m "docs(ops): NEW_SEASON.md for the Firestore era; board points at clearSeason.js"
```
