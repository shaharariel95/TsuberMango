# Shipping Certificates off Google Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google-Sheets shipping labels with Firestore-backed, versioned shipping certificates. The PDF is rendered client-side with pdfmake, and the system adds auto-split at 13 rows, a "תעודות" archive screen, per-farmer certificate settings, and a season Excel export.

**Architecture:**
- A pure backend module (`certificateCore.js`) chunks pallets and builds snapshots.
- `FirestoreCertificateRepository` owns every Firestore transaction that touches certificates together with pallet records. `certificateService` validates and orchestrates; `certificateController` and routes expose it.
- The frontend renders snapshots with a pure `buildCertificateDoc` (unit-tested) plus a thin pdfmake print wrapper. It adds a `Certificates.vue` screen and a `CertificateProfileEditor.vue` in Settings.

**Tech Stack:**
- Backend: Node/Express 5, firebase-admin Firestore transactions, Vitest + supertest on the auth/Firestore emulators.
- Frontend: Vue 3, pdfmake 0.2 (lazy), xlsx (lazy), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-certificates-design.md`. Read it before any task. Also read `CLAUDE.md` and the `local-dev` skill (`.claude/skills/local-dev/SKILL.md`).

## Global Constraints

- Every Firestore path is under `centers/{CENTER_ID}/` (`require('../config/center').CENTER_ID`).
- Certificate doc id: `` `${farmer}__${number}` ``. A version is a doc in subcollection `versions`, with an id equal to the version number as a string (`'1'`, `'2'`, …).
- Max **13** body rows per certificate. The PDF always renders exactly 13 body rows.
- One certificate = one destination + one shipmentDate (`yyyy-mm-dd`).
- Backend writes emit `firestoreEventService.emitBulkUpdate(farmer, pallets, actorEmail)` **after** commit, and write audit entries via `repo.appendAuditLog` (fire-and-forget).
- Endpoints: `verifyFirebaseToken` + `ensureCenterAccess` (already applied to the whole `/api` router); admin ones also `ensureAdmin`.
- Every new controller/service method calls `logger.info` / `logger.error`.
- UI text is Hebrew/RTL. Code, comments, logs and commits are English. Tailwind only.
- Frontend raw `fetch()` calls must send `Authorization: Bearer ${await getToken()}` (from `src/utils/auth.js`). Base URL: `new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '')`.
- Verification gate for every task: `cd backend && npm test` and `cd frontend && npm run e2e` both green. Never run two test suites at the same time (they share emulator ports).
- Commit only the files you touched: `git add <paths>`, never `-A`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (or the implementing model's).
- No GitHub CI, no pushes, no deploys.

## Review Focus

1. **Concurrent issue for the same farmer.** Two tablets click "צור תעודת משלוח" at once. Expected: distinct consecutive numbers, and no pallet on two certificates. Pinned in Task 3 (parallel issue test, overlapping-selection test).
2. **Hand-editing `cardId` in the row editor** would desync pallets from certificates. Expected: `cardId` is not editable in the row editor, and `PUT /records/:id` preserves the stored `cardId`/`sent` of a certified pallet. Pinned in Task 4 (API test) and Task 6 (editor column read-only).
3. **A farmer with no certificate profile** (Avner/Idan/Kopler before setup). Expected: a clear Hebrew 400 pointing to Settings, with no pallets touched. Pinned in Task 3.
4. **Lowering `nextNumber` in Settings** below an issued number. Expected: 400, no collision. Pinned in Task 4.
5. **PDF generation fails after a successful issue** (share cancelled or blocked). Expected: the certificate is saved and the user is told to print from "תעודות". Pinned in Task 6 (E2E with `navigator.share` throwing).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/services/certificateCore.js` (new) | Pure: `chunkRecords`, `buildRows`, `buildSnapshot`, `snapshotsDiffer`, `validateIssueSelection`. No I/O. |
| `backend/repositories/FirestoreCertificateRepository.js` (new) | All Firestore I/O for certificates and profiles, incl. transactions that also update pallet records. |
| `backend/repositories/index.js` (modify) | Also export `certificates` repo instance. |
| `backend/services/certificateService.js` (new) | Orchestration: validate → repo transaction → audit + events. Throws `CertificateError {status, message, details}`. |
| `backend/controllers/certificateController.js` (new) | HTTP mapping for `/api/certificates/*` and admin profile/export. |
| `backend/routes/certificateRoutes.js` (new) | Routes mounted at `/api/certificates`. |
| `backend/app.js` (modify) | Mount certificate routes; admin profile + export endpoints; remove nothing else. |
| `backend/routes/sheetRoutes.js`, `controllers/sheetController.js` (modify) | Remove `/shipping/newlabel`; `resetSentStatus` routes certified pallets through `removePallet`; `updateRecord` preserves `cardId`/`sent` of certified pallets. |
| `backend/services/shippingLabelsService.js`, `controllers/labelController.js` (delete) | Old Sheets flow. |
| `backend/services/backupService.js` (modify) | Include certificates + versions in the backup JSON. |
| `backend/scripts/seedCertificateProfiles.js` (new) | One-time, read-only on Sheets: seed profiles from `base` tabs. |
| `backend/scripts/seedTestCenter.js` (modify) | Seed a profile for `חקלאי-טסט`. |
| `backend/tests/helpers/apiHarness.js` (new) | Shared `tokenFor`, `clearCollection`, `waitFor`, `makeApi`. |
| `backend/tests/certificateCore.test.js`, `tests/certificates.repo.test.js`, `tests/certificates.api.test.js` (new) | Tests. |
| `frontend/src/data/certificatePdf.js` (new) | `buildCertificateDoc(snapshots)` (pure) + `printCertificates(snapshots, filename)`. |
| `frontend/src/api/certificates.js` (new) | Thin fetch wrappers for certificate endpoints. |
| `frontend/src/components/Certificates.vue` (new) | "תעודות" screen. |
| `frontend/src/components/CertificateProfileEditor.vue` (new) | Per-farmer certificate details modal + preview. |
| `frontend/src/components/PalletTable.vue`, `Settings.vue`, `router.js`, `App.vue` (modify) | Issue flow, cardId link, settings buttons, route, sidebar. |
| `frontend/vitest.config.js`, `frontend/tests/certificatePdf.test.js` (new) | Frontend unit test harness. |
| `frontend/e2e/certificates.spec.js` (new) | E2E. |

---

### Task 1: Pure certificate core (chunking, rows, snapshots, validation)

**Files:**
- Create: `backend/services/certificateCore.js`
- Test: `backend/tests/certificateCore.test.js`

**Interfaces:**
- Produces:
  - `MAX_ROWS = 13`
  - `chunkRecords(records) → Array<Array<record>>`. Throws `Error('PALLET_TOO_LARGE:<palletNumber>')` if one pallet group has more than 13 rows.
  - `buildRows(records) → Array<{recordId, palletNumber, kind, size, boxes, weight, firstOfPallet}>`
  - `buildSnapshot({profile, number, destination, shipmentDate, records}) → {headerLines, driverName, number, shipmentDate, destination, rows, palletCount, totalBoxes, totalWeight}`
  - `snapshotsDiffer(a, b) → boolean`. Compares printed fields only.
  - `validateIssueSelection(records) → {errors: string[], destination, shipmentDate}`. Hebrew error strings.
  - `record` = `{ id, palletNumber, kind, size, boxes, weight, destination, shipmentDate, cardId, ... }`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/certificateCore.test.js`

```js
import { describe, it, expect } from 'vitest';
import core from '../services/certificateCore.js';
const { MAX_ROWS, chunkRecords, buildRows, buildSnapshot, snapshotsDiffer, validateIssueSelection } = core;

let seq = 0;
const rec = (palletNumber, o = {}) => ({
  id: `r${++seq}`, palletNumber, kind: 'שלי', size: '15', boxes: 120, weight: 753,
  destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', cardId: '', ...o,
});
const many = (n, start = 1) => Array.from({ length: n }, (_, i) => rec(start + i));

describe('chunkRecords', () => {
  it('keeps ≤13 rows in one chunk', () => {
    expect(chunkRecords(many(13)).map(c => c.length)).toEqual([13]);
  });
  it('splits 14 single-row pallets into 13 + 1', () => {
    expect(chunkRecords(many(14)).map(c => c.length)).toEqual([13, 1]);
  });
  it('splits 26 into 13 + 13', () => {
    expect(chunkRecords(many(26)).map(c => c.length)).toEqual([13, 13]);
  });
  it('never splits a mixed pallet across certificates', () => {
    const records = [...many(12), rec(100), rec(100), rec(100)]; // 12 singles + one 3-row pallet
    const chunks = chunkRecords(records);
    expect(chunks.map(c => c.length)).toEqual([12, 3]);
    expect(chunks[1].every(r => r.palletNumber === 100)).toBe(true);
  });
  it('orders by pallet number ascending', () => {
    const chunks = chunkRecords([rec(5), rec(2), rec(9)]);
    expect(chunks[0].map(r => r.palletNumber)).toEqual([2, 5, 9]);
  });
  it('throws for a single pallet with more than 13 rows', () => {
    const big = Array.from({ length: MAX_ROWS + 1 }, () => rec(7));
    expect(() => chunkRecords(big)).toThrow('PALLET_TOO_LARGE:7');
  });
});

describe('buildRows / buildSnapshot', () => {
  it('flags only the first row of each pallet', () => {
    const rows = buildRows([rec(3), rec(3), rec(4)]);
    expect(rows.map(r => r.firstOfPallet)).toEqual([true, false, true]);
  });
  it('builds totals and copies the profile header', () => {
    const profile = { headerLines: ['A', 'B', 'C', 'D', 'E'], driverName: 'אדם', nextNumber: 5 };
    const snap = buildSnapshot({ profile, number: 51466, destination: 'X', shipmentDate: '2026-12-01',
      records: [rec(3, { boxes: 10, weight: 100 }), rec(3, { boxes: 5, weight: 50 }), rec(4, { boxes: 1, weight: 9 })] });
    expect(snap).toMatchObject({ number: 51466, destination: 'X', shipmentDate: '2026-12-01',
      headerLines: ['A', 'B', 'C', 'D', 'E'], driverName: 'אדם', palletCount: 2, totalBoxes: 16, totalWeight: 159 });
    expect(snap.rows).toHaveLength(3);
  });
});

describe('snapshotsDiffer', () => {
  const base = { headerLines: ['A'], driverName: '', number: 1, shipmentDate: 'd', destination: 'x',
    rows: [{ recordId: 'a', palletNumber: 1, kind: 'k', size: 's', boxes: 1, weight: 1, firstOfPallet: true }],
    palletCount: 1, totalBoxes: 1, totalWeight: 1 };
  it('ignores metadata fields', () => {
    expect(snapshotsDiffer(base, { ...base, createdAt: 'x', createdBy: 'y', reason: 'issue' })).toBe(false);
  });
  it('detects a weight change', () => {
    expect(snapshotsDiffer(base, { ...base, rows: [{ ...base.rows[0], weight: 2 }] })).toBe(true);
  });
});

describe('validateIssueSelection', () => {
  it('accepts a clean selection', () => {
    const v = validateIssueSelection([rec(1), rec(2)]);
    expect(v.errors).toEqual([]);
    expect(v).toMatchObject({ destination: 'שיווק האיחוד', shipmentDate: '2026-12-01' });
  });
  it('rejects mixed destinations and dates', () => {
    const v = validateIssueSelection([rec(1), rec(2, { destination: 'אחר', shipmentDate: '2026-12-02' })]);
    expect(v.errors).toContain('למשטחים שנבחרו יש יעדים שונים');
    expect(v.errors).toContain('למשטחים שנבחרו יש תאריכי משלוח שונים');
  });
  it('rejects missing weight/boxes/destination/date with pallet numbers', () => {
    const v = validateIssueSelection([rec(8, { weight: '' }), rec(9, { shipmentDate: '' })]);
    expect(v.errors.join(' ')).toMatch(/8/);
    expect(v.errors.join(' ')).toMatch(/9/);
  });
  it('rejects an empty selection', () => {
    expect(validateIssueSelection([]).errors).toEqual(['לא נבחרו משטחים']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test -- certificateCore`
Expected: FAIL, "Cannot find module '../services/certificateCore.js'".

- [ ] **Step 3: Implement** — `backend/services/certificateCore.js`

```js
// Pure certificate logic: chunking, row building, snapshots, selection validation.
// No I/O — unit-tested in tests/certificateCore.test.js.
const MAX_ROWS = 13;

const byPalletNumber = (a, b) => Number(a.palletNumber) - Number(b.palletNumber);

// Group rows by pallet number and pack whole groups into chunks of ≤ MAX_ROWS rows,
// so a mixed pallet never straddles two certificates.
function chunkRecords(records) {
  const groups = new Map();
  [...records].sort(byPalletNumber).forEach(r => {
    const key = String(r.palletNumber);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const chunks = [];
  let current = [];
  for (const [palletNumber, group] of groups) {
    if (group.length > MAX_ROWS) throw new Error(`PALLET_TOO_LARGE:${palletNumber}`);
    if (current.length + group.length > MAX_ROWS) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function buildRows(records) {
  const seen = new Set();
  return records.map(r => {
    const key = String(r.palletNumber);
    const firstOfPallet = !seen.has(key);
    seen.add(key);
    return {
      recordId: r.id, palletNumber: r.palletNumber, kind: r.kind, size: r.size,
      boxes: r.boxes, weight: r.weight, firstOfPallet,
    };
  });
}

function buildSnapshot({ profile, number, destination, shipmentDate, records }) {
  const rows = buildRows([...records].sort(byPalletNumber));
  return {
    headerLines: [...(profile.headerLines || [])],
    driverName: profile.driverName || '',
    number, shipmentDate, destination, rows,
    palletCount: rows.filter(r => r.firstOfPallet).length,
    totalBoxes: rows.reduce((s, r) => s + (Number(r.boxes) || 0), 0),
    totalWeight: rows.reduce((s, r) => s + (Number(r.weight) || 0), 0),
  };
}

const PRINTED_FIELDS = ['headerLines', 'driverName', 'number', 'shipmentDate', 'destination',
  'rows', 'palletCount', 'totalBoxes', 'totalWeight'];

function snapshotsDiffer(a, b) {
  return PRINTED_FIELDS.some(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

function validateIssueSelection(records) {
  if (!records.length) return { errors: ['לא נבחרו משטחים'] };
  const errors = [];
  const missing = records.filter(r => !r.weight || !r.boxes || !r.destination || !r.shipmentDate);
  if (missing.length) {
    errors.push(`חסרים משקל / ארגזים / יעד / תאריך משלוח במשטחים: ${[...new Set(missing.map(r => r.palletNumber))].join(', ')}`);
  }
  const destinations = new Set(records.map(r => r.destination).filter(Boolean));
  const dates = new Set(records.map(r => r.shipmentDate).filter(Boolean));
  if (destinations.size > 1) errors.push('למשטחים שנבחרו יש יעדים שונים');
  if (dates.size > 1) errors.push('למשטחים שנבחרו יש תאריכי משלוח שונים');
  return { errors, destination: [...destinations][0], shipmentDate: [...dates][0] };
}

module.exports = { MAX_ROWS, chunkRecords, buildRows, buildSnapshot, snapshotsDiffer, validateIssueSelection };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test -- certificateCore`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/certificateCore.js backend/tests/certificateCore.test.js
git commit -m "feat(task-20): pure certificate core — chunking, snapshots, validation"
```

---

### Task 2: Firestore certificate repository (profiles + transactions)

**Files:**
- Create: `backend/repositories/FirestoreCertificateRepository.js`
- Modify: `backend/repositories/index.js`
- Test: `backend/tests/certificates.repo.test.js`

**Interfaces:**
- Consumes: `certificateCore` (Task 1).
- Produces a class `FirestoreCertificateRepository(db = null, centerId = CENTER_ID)` with:
  - `getProfile(farmer) → profile | null`
  - `setProfile(farmer, profile) → void`. Merges `certificateProfile` into `farmers/{farmer}`.
  - `maxIssuedNumber(farmer) → number`. 0 if none.
  - `issue({farmer, recordIds, actor}) → [{id, number, snapshot}]`. Transaction. Throws:
    - `CertificateError(400, 'NO_PROFILE')`
    - `CertificateError(409, 'ALREADY_CERTIFIED', {conflicts})`
    - `CertificateError(404, 'RECORD_NOT_FOUND')`
    - `CertificateError(400, 'INVALID_SELECTION', {errors})`
  - `reprint({id, actor}) → {snapshot, version, created: boolean}`
  - `removePallet({id, recordId, actor}) → {snapshot, version, cancelled: boolean, record}`
  - `list(farmer) → certificate docs[]`, sorted by number desc
  - `get(id) → {certificate, versions: [{n, reason, createdBy, createdAt}]} | null`
  - `getVersion(id, n) → snapshot | null`
  - `listAllWithVersions() → [{id, ...doc, versions: [...]}]` (for backup)
- `CertificateError` is exported from the same file: `class CertificateError extends Error { constructor(status, code, details = {}) }`.
- `index.js` exports `module.exports = new FirestoreRepository(); module.exports.certificates = new FirestoreCertificateRepository();`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/certificates.repo.test.js`

```js
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import CertRepoModule from '../repositories/FirestoreCertificateRepository.js';
const { FirestoreCertificateRepository, CertificateError } = CertRepoModule;

const CENTER = 'cert-repo-test';
const FARMER = 'חקלאי-תעודות';
const ACTOR = 'tester@test.local';
let db, repo, records;

const profile = { headerLines: ['צברי', 'משק 10', 'חצבה', 'טל', 'עוסק'], driverName: 'אדם', nextNumber: 51466 };
const recordsCol = () => db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');

async function addRecord(palletNumber, o = {}) {
  const ref = await recordsCol().add({ palletNumber, kind: 'שלי', size: '15', boxes: 10, weight: 100,
    destination: 'יעד', shipmentDate: '2026-12-01', harvestDate: '2026-11-30', cardId: '', sent: false, mark: true,
    gidon: false, editedBy: '', editedAt: '', ...o });
  return ref.id;
}

beforeAll(() => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
  db = admin.firestore();
  repo = new FirestoreCertificateRepository(db, CENTER);
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

beforeEach(async () => {
  await db.recursiveDelete(db.collection('centers').doc(CENTER));
  await repo.setProfile(FARMER, profile);
  records = [await addRecord(1), await addRecord(2)];
});

describe('profiles', () => {
  it('round-trips a profile', async () => {
    expect(await repo.getProfile(FARMER)).toEqual(profile);
    expect(await repo.getProfile('nobody')).toBeNull();
  });
});

describe('issue', () => {
  it('creates certificate + version 1, stamps records, bumps nextNumber', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    expect(c).toMatchObject({ id: `${FARMER}__51466`, number: 51466 });
    expect(c.snapshot.rows).toHaveLength(2);
    const r = (await recordsCol().doc(records[0]).get()).data();
    expect(r).toMatchObject({ cardId: 51466, sent: true, mark: false, editedBy: ACTOR });
    expect((await repo.getProfile(FARMER)).nextNumber).toBe(51467);
    const got = await repo.get(c.id);
    expect(got.certificate).toMatchObject({ status: 'issued', currentVersion: 1, palletCount: 2, recordIds: records });
    expect(got.versions.map(v => v.reason)).toEqual(['issue']);
  });

  it('splits 14 pallets into two consecutive numbers', async () => {
    const ids = [...records];
    for (let p = 3; p <= 14; p++) ids.push(await addRecord(p));
    const certs = await repo.issue({ farmer: FARMER, recordIds: ids, actor: ACTOR });
    expect(certs.map(c => [c.number, c.snapshot.rows.length])).toEqual([[51466, 13], [51467, 1]]);
  });

  it('rejects already-certified records with conflicts', async () => {
    await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await expect(repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR }))
      .rejects.toMatchObject({ status: 409, code: 'ALREADY_CERTIFIED',
        details: { conflicts: [{ recordId: records[0], palletNumber: 1, certificateNumber: 51466, certificateId: `${FARMER}__51466` }] } });
    expect((await recordsCol().doc(records[1]).get()).data().cardId).toBe('');
  });

  it('rejects a farmer with no profile without touching records', async () => {
    await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).update({ certificateProfile: admin.firestore.FieldValue.delete() });
    await expect(repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR }))
      .rejects.toMatchObject({ status: 400, code: 'NO_PROFILE' });
    expect((await recordsCol().doc(records[0]).get()).data().sent).toBe(false);
  });

  it('two concurrent issues get distinct consecutive numbers', async () => {
    const [a, b] = await Promise.all([
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
      repo.issue({ farmer: FARMER, recordIds: [records[1]], actor: ACTOR }),
    ]);
    expect([a[0].number, b[0].number].sort()).toEqual([51466, 51467]);
  });

  it('two concurrent issues of the SAME pallet: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason).toBeInstanceOf(CertificateError);
  });
});

describe('reprint', () => {
  it('no change → no new version; weight change → version 2, version 1 intact', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    const same = await repo.reprint({ id: c.id, actor: ACTOR });
    expect(same).toMatchObject({ version: 1, created: false });

    await recordsCol().doc(records[0]).update({ weight: 555 });
    const changed = await repo.reprint({ id: c.id, actor: 'other@test.local' });
    expect(changed).toMatchObject({ version: 2, created: true });
    expect(changed.snapshot.rows.find(r => r.recordId === records[0]).weight).toBe(555);
    expect((await repo.getVersion(c.id, 1)).rows.find(r => r.recordId === records[0]).weight).toBe(100);
    expect((await repo.get(c.id)).certificate).toMatchObject({ currentVersion: 2, updatedBy: 'other@test.local' });
  });
});

describe('removePallet', () => {
  it('removes one pallet → new version; last pallet → cancelled', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    const r1 = await repo.removePallet({ id: c.id, recordId: records[0], actor: ACTOR });
    expect(r1).toMatchObject({ version: 2, cancelled: false });
    expect(r1.snapshot.rows.map(r => r.recordId)).toEqual([records[1]]);
    expect((await recordsCol().doc(records[0]).get()).data()).toMatchObject({ cardId: '', sent: false, mark: true });

    const r2 = await repo.removePallet({ id: c.id, recordId: records[1], actor: ACTOR });
    expect(r2).toMatchObject({ version: 3, cancelled: true });
    expect((await repo.get(c.id)).certificate).toMatchObject({ status: 'cancelled', recordIds: [], palletCount: 0 });
  });

  it('rejects a record that is not on the certificate', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await expect(repo.removePallet({ id: c.id, recordId: records[1], actor: ACTOR }))
      .rejects.toMatchObject({ status: 400, code: 'NOT_ON_CERTIFICATE' });
  });
});

describe('list / maxIssuedNumber', () => {
  it('lists newest first and reports the max number', async () => {
    await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await repo.issue({ farmer: FARMER, recordIds: [records[1]], actor: ACTOR });
    expect((await repo.list(FARMER)).map(c => c.number)).toEqual([51467, 51466]);
    expect(await repo.maxIssuedNumber(FARMER)).toBe(51467);
    expect(await repo.maxIssuedNumber('nobody')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test -- certificates.repo`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — `backend/repositories/FirestoreCertificateRepository.js`

```js
// Firestore storage for shipping certificates and per-farmer certificate profiles.
// Owns the transactions that update certificates AND pallet records together, so a
// certificate and its pallets can never disagree (no orphans, no duplicate numbers).
const admin = require('firebase-admin');
const { CENTER_ID } = require('../config/center');
const logger = require('../utils/logger');
const core = require('../services/certificateCore');

class CertificateError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const certId = (farmer, number) => `${farmer}__${number}`;

class FirestoreCertificateRepository {
  constructor(db = null, centerId = CENTER_ID) {
    this._db = db;
    this.centerId = centerId;
  }

  get db() { return this._db || admin.firestore(); }
  centerDoc() { return this.db.collection('centers').doc(this.centerId); }
  farmerDoc(farmer) { return this.centerDoc().collection('farmers').doc(farmer); }
  recordsCol(farmer) { return this.farmerDoc(farmer).collection('records'); }
  certsCol() { return this.centerDoc().collection('certificates'); }
  versionsCol(id) { return this.certsCol().doc(id).collection('versions'); }

  async getProfile(farmer) {
    const snap = await this.farmerDoc(farmer).get();
    return (snap.exists && snap.data().certificateProfile) || null;
  }

  async setProfile(farmer, profile) {
    await this.farmerDoc(farmer).set({ certificateProfile: profile }, { merge: true });
  }

  async maxIssuedNumber(farmer) {
    const snap = await this.certsCol().where('farmer', '==', farmer).get();
    return snap.docs.reduce((m, d) => Math.max(m, d.data().number || 0), 0);
  }

  async issue({ farmer, recordIds, actor }) {
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      // --- reads (all before writes) ---
      const farmerSnap = await t.get(this.farmerDoc(farmer));
      const profile = farmerSnap.exists ? farmerSnap.data().certificateProfile : null;
      if (!profile || !Number.isInteger(profile.nextNumber)) throw new CertificateError(400, 'NO_PROFILE');

      const recSnaps = await t.getAll(...recordIds.map(id => this.recordsCol(farmer).doc(id)));
      const missing = recSnaps.find(s => !s.exists);
      if (missing) throw new CertificateError(404, 'RECORD_NOT_FOUND', { recordId: missing.id });
      const records = recSnaps.map(s => ({ id: s.id, ...s.data() }));

      const conflicts = records.filter(r => r.cardId !== '' && r.cardId !== undefined && r.cardId !== null)
        .map(r => ({ recordId: r.id, palletNumber: r.palletNumber, certificateNumber: r.cardId, certificateId: certId(farmer, r.cardId) }));
      if (conflicts.length) throw new CertificateError(409, 'ALREADY_CERTIFIED', { conflicts });

      const { errors, destination, shipmentDate } = core.validateIssueSelection(records);
      if (errors.length) throw new CertificateError(400, 'INVALID_SELECTION', { errors });

      let chunks;
      try { chunks = core.chunkRecords(records); }
      catch (e) { throw new CertificateError(400, 'INVALID_SELECTION', { errors: [`משטח ${e.message.split(':')[1]} חורג מ-13 שורות`] }); }

      // --- writes ---
      let number = profile.nextNumber;
      const issued = [];
      for (const chunk of chunks) {
        const snapshot = core.buildSnapshot({ profile, number, destination, shipmentDate, records: chunk });
        const id = certId(farmer, number);
        t.create(this.certsCol().doc(id), {
          farmer, number, destination, shipmentDate,
          recordIds: chunk.map(r => r.id),
          palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight,
          status: 'issued', currentVersion: 1,
          issuedBy: actor, issuedAt: now, updatedBy: actor, updatedAt: now,
        });
        t.create(this.versionsCol(id).doc('1'), { ...snapshot, reason: 'issue', createdBy: actor, createdAt: now });
        chunk.forEach(r => t.update(this.recordsCol(farmer).doc(r.id),
          { cardId: number, sent: true, mark: false, editedBy: actor, editedAt: now }));
        issued.push({ id, number, snapshot, records: chunk });
        number += 1;
      }
      t.set(this.farmerDoc(farmer), { certificateProfile: { ...profile, nextNumber: number } }, { merge: true });
      return issued.map(({ id, number: n, snapshot, records: rs }) => ({ id, number: n, snapshot, records: rs.map(r => ({ ...r, cardId: n, sent: true, mark: false, editedBy: actor, editedAt: now })) }));
    });
  }

  // Shared by reprint/removePallet: rebuild a snapshot from the current records + profile.
  async _currentSnapshot(t, cert, recordIds) {
    const farmerSnap = await t.get(this.farmerDoc(cert.farmer));
    const profile = (farmerSnap.exists && farmerSnap.data().certificateProfile) || { headerLines: [], driverName: '' };
    const recSnaps = recordIds.length ? await t.getAll(...recordIds.map(id => this.recordsCol(cert.farmer).doc(id))) : [];
    const records = recSnaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
    return { snapshot: core.buildSnapshot({ profile, number: cert.number, destination: cert.destination,
      shipmentDate: cert.shipmentDate, records }), records };
  }

  async reprint({ id, actor }) {
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      const certSnap = await t.get(this.certsCol().doc(id));
      if (!certSnap.exists) throw new CertificateError(404, 'CERTIFICATE_NOT_FOUND');
      const cert = certSnap.data();
      if (cert.status === 'cancelled') throw new CertificateError(409, 'CERTIFICATE_CANCELLED');
      const latestSnap = await t.get(this.versionsCol(id).doc(String(cert.currentVersion)));
      const { snapshot } = await this._currentSnapshot(t, cert, cert.recordIds);
      if (!core.snapshotsDiffer(snapshot, latestSnap.data())) {
        return { snapshot: latestSnap.data(), version: cert.currentVersion, created: false };
      }
      const version = cert.currentVersion + 1;
      t.create(this.versionsCol(id).doc(String(version)), { ...snapshot, reason: 'reprint', createdBy: actor, createdAt: now });
      t.update(this.certsCol().doc(id), { currentVersion: version, updatedBy: actor, updatedAt: now,
        palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight });
      return { snapshot, version, created: true };
    });
  }

  async removePallet({ id, recordId, actor }) {
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      const certSnap = await t.get(this.certsCol().doc(id));
      if (!certSnap.exists) throw new CertificateError(404, 'CERTIFICATE_NOT_FOUND');
      const cert = certSnap.data();
      if (!cert.recordIds.includes(recordId)) throw new CertificateError(400, 'NOT_ON_CERTIFICATE');
      const remaining = cert.recordIds.filter(r => r !== recordId);
      const removedSnap = await t.get(this.recordsCol(cert.farmer).doc(recordId));
      const { snapshot } = await this._currentSnapshot(t, cert, remaining);
      const version = cert.currentVersion + 1;
      const cancelled = remaining.length === 0;
      t.create(this.versionsCol(id).doc(String(version)), { ...snapshot, reason: 'remove-pallet', createdBy: actor, createdAt: now });
      t.update(this.certsCol().doc(id), { recordIds: remaining, currentVersion: version,
        status: cancelled ? 'cancelled' : cert.status, updatedBy: actor, updatedAt: now,
        palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight });
      const patch = { cardId: '', sent: false, mark: true, editedBy: actor, editedAt: now };
      if (removedSnap.exists) t.update(this.recordsCol(cert.farmer).doc(recordId), patch);
      return { snapshot, version, cancelled, farmer: cert.farmer,
        record: removedSnap.exists ? { id: recordId, ...removedSnap.data(), ...patch } : null };
    });
  }

  async list(farmer) {
    const snap = await this.certsCol().where('farmer', '==', farmer).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.number - a.number);
  }

  async get(id) {
    const snap = await this.certsCol().doc(id).get();
    if (!snap.exists) return null;
    const vs = await this.versionsCol(id).get();
    const versions = vs.docs.map(d => ({ n: Number(d.id), reason: d.data().reason, createdBy: d.data().createdBy, createdAt: d.data().createdAt }))
      .sort((a, b) => a.n - b.n);
    return { certificate: { id, ...snap.data() }, versions };
  }

  async getVersion(id, n) {
    const snap = await this.versionsCol(id).doc(String(n)).get();
    return snap.exists ? snap.data() : null;
  }

  async listAllWithVersions() {
    const snap = await this.certsCol().get();
    return Promise.all(snap.docs.map(async d => {
      const vs = await this.versionsCol(d.id).get();
      return { id: d.id, ...d.data(), versions: vs.docs.map(v => ({ n: Number(v.id), ...v.data() })) };
    }));
  }
}

module.exports = { FirestoreCertificateRepository, CertificateError };
```

Note: `logger` is imported for parity with other repos; the service layer does the logging.

- [ ] **Step 4: Wire into `backend/repositories/index.js`**

```js
// Selects the active RecordRepository implementation. Future impls (Postgres,
// behind an explicit trigger) swap here only.
const FirestoreRepository = require('./FirestoreRepository');
const { FirestoreCertificateRepository } = require('./FirestoreCertificateRepository');

module.exports = new FirestoreRepository();
module.exports.certificates = new FirestoreCertificateRepository();
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && npm test -- certificates.repo`
Expected: PASS. Then run the whole `npm test`; everything must stay green.

- [ ] **Step 6: Commit**

```bash
git add backend/repositories/FirestoreCertificateRepository.js backend/repositories/index.js backend/tests/certificates.repo.test.js
git commit -m "feat(task-20): Firestore certificate repository with atomic issue/reprint/remove"
```

---

### Task 3: Certificate service, controller and `/api/certificates` routes

**Files:**
- Create: `backend/services/certificateService.js`, `backend/controllers/certificateController.js`, `backend/routes/certificateRoutes.js`, `backend/tests/helpers/apiHarness.js`, `backend/tests/certificates.api.test.js`
- Modify: `backend/app.js` (mount routes)

**Interfaces:**
- Consumes: `require('../repositories').certificates`, `CertificateError` (Task 2), `certificateCore` (Task 1).
- Produces these HTTP endpoints (all JSON):
  - `POST /api/certificates/preview {farmer, recordIds}` → `200 {destination, shipmentDate, chunks: [{rows, pallets}]}`; validation errors as below.
  - `POST /api/certificates {farmer, recordIds}` → `201 {certificates: [{id, number, snapshot}]}`
  - `POST /api/certificates/:id/reprint` → `200 {snapshot, version, created}`
  - `POST /api/certificates/:id/remove-pallet {recordId}` → `200 {snapshot, version, cancelled}`
  - `GET /api/certificates?farmer=&from=&to=` → `200 {certificates: [...]}`. `farmer` is required (400 otherwise).
  - `GET /api/certificates/:id` → `200 {certificate, versions}` | 404
  - `GET /api/certificates/:id/versions/:n` → `200 {snapshot}` | 404
- Error body: `{ error: <Hebrew message>, code, ...details }`. Hebrew messages by code:
  - `NO_PROFILE`: 'חסרים פרטי תעודה לחקלאי — הגדר בהגדרות'
  - `ALREADY_CERTIFIED`: `משטח ${p} כבר בתעודה ${n} — הסר אותו מהתעודה כדי להפיק חדשה` (joined for multiple conflicts)
  - `INVALID_SELECTION`: `errors.join(' · ')`
  - `RECORD_NOT_FOUND`: 'משטח לא נמצא'
  - `CERTIFICATE_NOT_FOUND`: 'התעודה לא נמצאה'
  - `CERTIFICATE_CANCELLED`: 'התעודה בוטלה'
  - `NOT_ON_CERTIFICATE`: 'המשטח אינו בתעודה זו'
  - Unknown farmer → 400 'Unknown farmer: …'. Reuse `assertKnownFarmer`: export it from `sheetController.js` as `module.exports.assertKnownFarmer = assertKnownFarmer;`.
- `certificateService` exports `{ preview, issue, reprint, removePallet, list, get, getVersion, toHttpError }`.
- `apiHarness.js` exports `{ tokenFor(email, {centers}), clearCollection(ref), waitFor(fn, ms), makeApi(app, tokens) }`, moved verbatim from `api.test.js`. Then change `api.test.js` to import them, with no behavior change.

- [ ] **Step 1: Extract the harness.** Move `clearCollection`, `tokenFor`, `waitFor` from `backend/tests/api.test.js` into `backend/tests/helpers/apiHarness.js` (ESM `export`). `tokenFor` takes `centers` explicitly, with no default center:

```js
import admin from 'firebase-admin';
import request from 'supertest';

export async function clearCollection(ref) {
  const snap = await ref.get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

export async function tokenFor(email, { centers } = {}) {
  const password = 'secret123';
  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch { user = await admin.auth().createUser({ email, password }); }
  await admin.auth().setCustomUserClaims(user.uid, centers ? { centers } : null);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await res.json();
  if (!body.idToken) throw new Error(`emulator sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.idToken;
}

export const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise(r => setTimeout(r, 100));
  }
};

export const makeApi = (app, tokens) => (method, url, who = 'admin') => {
  const req = request(app)[method](url);
  return tokens[who] ? req.set('Authorization', `Bearer ${tokens[who]}`) : req;
};
```

In `api.test.js`:
- Replace the local definitions with `import { clearCollection, tokenFor as rawTokenFor, waitFor, makeApi } from './helpers/apiHarness.js';`
- Add `const tokenFor = (email, o = {}) => rawTokenFor(email, { centers: 'centers' in o ? o.centers : [CENTER] });` and `const api = makeApi(app, tokens);`

Run `cd backend && npm test`: must stay green.

- [ ] **Step 2: Write the failing API tests** — `backend/tests/certificates.api.test.js`

```js
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { clearCollection, tokenFor, waitFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'certapi';
const FARMER = 'חקלאי-תעודה';
const ADMIN = 'cert-admin@test.local';
const USER = 'cert-user@test.local';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const farmerDoc = center.collection('farmers').doc(FARMER);
const tokens = {};
const api = makeApi(app, tokens);
const enc = encodeURIComponent;
const profile = { headerLines: ['צברי נורית וגבריאל', "משק מס' 10", 'חצבה', 'נייד', 'עוסק'], driverName: 'אדם', nextNumber: 51466 };

async function addRecord(palletNumber, o = {}) {
  const ref = await farmerDoc.collection('records').add({ palletNumber, kind: 'שלי', size: '15', boxes: 120, weight: 753,
    destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', harvestDate: '2026-11-30', cardId: '', sent: false,
    mark: true, gidon: false, editedBy: '', editedAt: '', ...o });
  return ref.id;
}

beforeAll(async () => {
  await center.collection('config').doc('global').set({ kinds: ['שלי'], sizes: ['15'], destinations: ['שיווק האיחוד'],
    farmers: [{ name: FARMER, allowGidon: false }], farmerConfigs: {} });
  await center.collection('users').doc(ADMIN).set({ role: 'admin' });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.admin = await tokenFor(ADMIN, { centers: [CENTER] });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });
beforeEach(async () => {
  await db.recursiveDelete(center.collection('certificates'));
  await clearCollection(farmerDoc.collection('records'));
  await farmerDoc.set({ certificateProfile: profile });
});

describe('issue', () => {
  it('a regular user can preview and issue; pallets are stamped; event + audit emitted', async () => {
    const ids = [await addRecord(421), await addRecord(422)];
    const pv = await api('post', '/api/certificates/preview', 'user').send({ farmer: FARMER, recordIds: ids });
    expect(pv.status).toBe(200);
    expect(pv.body).toMatchObject({ destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', chunks: [{ rows: 2, pallets: 2 }] });

    const res = await api('post', '/api/certificates', 'user').send({ farmer: FARMER, recordIds: ids });
    expect(res.status).toBe(201);
    expect(res.body.certificates).toHaveLength(1);
    expect(res.body.certificates[0]).toMatchObject({ id: `${FARMER}__51466`, number: 51466 });
    expect((await farmerDoc.collection('records').doc(ids[0]).get()).data()).toMatchObject({ cardId: 51466, sent: true, mark: false, editedBy: USER });

    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.data()?.type === 'bulk_update' ? s.data() : null;
    });
    expect(evt.pallets.map(p => p.id).sort()).toEqual([...ids].sort());
    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('recordId', '==', ids[0]).get();
      return s.empty ? null : s.docs[0].data();
    });
    expect(audit.action).toBe('הפקת תעודה 51466');
  });

  it('14 pallets → two certificates 13 + 1', async () => {
    const ids = [];
    for (let p = 1; p <= 14; p++) ids.push(await addRecord(p));
    const pv = await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: ids });
    expect(pv.body.chunks.map(c => c.rows)).toEqual([13, 1]);
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: ids });
    expect(res.body.certificates.map(c => c.number)).toEqual([51466, 51467]);
  });

  it('mixed destination → 400 Hebrew', async () => {
    const ids = [await addRecord(1), await addRecord(2, { destination: 'אחר' })];
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: ids });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch('יעדים שונים');
  });

  it('already certified → 409 naming the certificate', async () => {
    const id = await addRecord(421);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('משטח 421 כבר בתעודה 51466 — הסר אותו מהתעודה כדי להפיק חדשה');
    expect(res.body.conflicts[0]).toMatchObject({ certificateId: `${FARMER}__51466` });
  });

  it('no profile → 400 pointing to settings, nothing stamped', async () => {
    await farmerDoc.set({});
    const id = await addRecord(1);
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('חסרים פרטי תעודה לחקלאי — הגדר בהגדרות');
    expect((await farmerDoc.collection('records').doc(id).get()).data().sent).toBe(false);
  });

  it('unknown farmer → 400', async () => {
    const res = await api('post', '/api/certificates').send({ farmer: 'לא-קיים', recordIds: ['x'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown farmer/);
  });

  it('parallel issues over HTTP get distinct numbers', async () => {
    const a = await addRecord(1); const b = await addRecord(2);
    const [r1, r2] = await Promise.all([
      api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [a] }),
      api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [b] }),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect([r1.body.certificates[0].number, r2.body.certificates[0].number].sort()).toEqual([51466, 51467]);
  });
});

describe('reprint / remove / reads', () => {
  it('reprint after weight edit creates version 2; reads expose history', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    await farmerDoc.collection('records').doc(id).update({ weight: 700 });
    const rp = await api('post', `/api/certificates/${enc(issued.id)}/reprint`);
    expect(rp.body).toMatchObject({ version: 2, created: true });

    const got = await api('get', `/api/certificates/${enc(issued.id)}`);
    expect(got.body.versions.map(v => v.reason)).toEqual(['issue', 'reprint']);
    const v1 = await api('get', `/api/certificates/${enc(issued.id)}/versions/1`);
    expect(v1.body.snapshot.rows[0].weight).toBe(753);
    expect((await api('get', `/api/certificates/${enc(issued.id)}/versions/9`)).status).toBe(404);
  });

  it('remove-pallet returns the pallet to shipment prep and cancels when empty', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    const rm = await api('post', `/api/certificates/${enc(issued.id)}/remove-pallet`).send({ recordId: id });
    expect(rm.body).toMatchObject({ version: 2, cancelled: true });
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false, mark: true });
    expect((await api('post', `/api/certificates/${enc(issued.id)}/reprint`)).status).toBe(409);
  });

  it('list requires farmer and filters by date range', async () => {
    const a = await addRecord(1, { shipmentDate: '2026-12-01' });
    const b = await addRecord(2, { shipmentDate: '2026-12-05' });
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [a] });
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [b] });
    expect((await api('get', '/api/certificates')).status).toBe(400);
    const all = await api('get', `/api/certificates?farmer=${enc(FARMER)}`);
    expect(all.body.certificates.map(c => c.number)).toEqual([51467, 51466]);
    const ranged = await api('get', `/api/certificates?farmer=${enc(FARMER)}&from=2026-12-02&to=2026-12-31`);
    expect(ranged.body.certificates.map(c => c.number)).toEqual([51467]);
  });
});
```

- [ ] **Step 3: Run to verify failure.** Run `cd backend && npm test -- certificates.api`. Expected: 404s / FAIL.

- [ ] **Step 4: Implement the service** — `backend/services/certificateService.js`

```js
// Orchestrates certificate operations: validation, repository transactions, then the
// side effects every write owes (audit entries + realtime event), in that order.
const repo = require('../repositories');
const { CertificateError } = require('../repositories/FirestoreCertificateRepository');
const core = require('./certificateCore');
const firestoreEventService = require('./firestoreEventService');
const logger = require('../utils/logger');

const MESSAGES = {
  NO_PROFILE: () => 'חסרים פרטי תעודה לחקלאי — הגדר בהגדרות',
  ALREADY_CERTIFIED: (d) => d.conflicts.map(c => `משטח ${c.palletNumber} כבר בתעודה ${c.certificateNumber} — הסר אותו מהתעודה כדי להפיק חדשה`).join(' · '),
  INVALID_SELECTION: (d) => d.errors.join(' · '),
  RECORD_NOT_FOUND: () => 'משטח לא נמצא',
  CERTIFICATE_NOT_FOUND: () => 'התעודה לא נמצאה',
  CERTIFICATE_CANCELLED: () => 'התעודה בוטלה',
  NOT_ON_CERTIFICATE: () => 'המשטח אינו בתעודה זו',
};

function toHttpError(err) {
  if (err instanceof CertificateError) {
    return { status: err.status, body: { error: (MESSAGES[err.code] || (() => err.code))(err.details), code: err.code, ...err.details } };
  }
  return null;
}

function sideEffects(farmer, records, action, actor) {
  const editedAt = new Date().toISOString();
  Promise.allSettled(records.map(r => repo.appendAuditLog(farmer, {
    recordId: r.id, palletNumber: r.palletNumber, action, editedBy: actor, editedAt,
  })));
  firestoreEventService.emitBulkUpdate(farmer, records, actor);
}

async function preview({ farmer, recordIds }) {
  const records = (await repo.getRecords(farmer)).filter(r => recordIds.includes(r.id));
  if (records.length !== recordIds.length) throw new CertificateError(404, 'RECORD_NOT_FOUND');
  const conflicts = records.filter(r => r.cardId !== '' && r.cardId != null)
    .map(r => ({ recordId: r.id, palletNumber: r.palletNumber, certificateNumber: r.cardId, certificateId: `${farmer}__${r.cardId}` }));
  if (conflicts.length) throw new CertificateError(409, 'ALREADY_CERTIFIED', { conflicts });
  const { errors, destination, shipmentDate } = core.validateIssueSelection(records);
  if (errors.length) throw new CertificateError(400, 'INVALID_SELECTION', { errors });
  let chunks;
  try { chunks = core.chunkRecords(records); }
  catch (e) { throw new CertificateError(400, 'INVALID_SELECTION', { errors: [`משטח ${e.message.split(':')[1]} חורג מ-13 שורות`] }); }
  return { destination, shipmentDate,
    chunks: chunks.map(c => ({ rows: c.length, pallets: new Set(c.map(r => String(r.palletNumber))).size })) };
}

async function issue({ farmer, recordIds, actor }) {
  logger.info(`[certificateService.issue] farmer=${farmer} records=${recordIds.length} by=${actor}`);
  const issued = await repo.certificates.issue({ farmer, recordIds, actor });
  issued.forEach(c => sideEffects(farmer, c.records, `הפקת תעודה ${c.number}`, actor));
  logger.info(`[certificateService.issue] issued ${issued.map(c => c.number).join(', ')}`);
  return issued.map(({ id, number, snapshot }) => ({ id, number, snapshot }));
}

async function reprint({ id, actor }) {
  const result = await repo.certificates.reprint({ id, actor });
  logger.info(`[certificateService.reprint] ${id} version=${result.version} created=${result.created}`);
  return result;
}

async function removePallet({ id, recordId, actor }) {
  const result = await repo.certificates.removePallet({ id, recordId, actor });
  if (result.record) sideEffects(result.farmer, [result.record], `הוסר מתעודה ${result.snapshot.number}`, actor);
  logger.info(`[certificateService.removePallet] ${id} record=${recordId} cancelled=${result.cancelled}`);
  return { snapshot: result.snapshot, version: result.version, cancelled: result.cancelled };
}

async function list({ farmer, from, to }) {
  return (await repo.certificates.list(farmer))
    .filter(c => (!from || c.shipmentDate >= from) && (!to || c.shipmentDate <= to));
}

module.exports = {
  preview, issue, reprint, removePallet, list,
  get: (id) => repo.certificates.get(id),
  getVersion: (id, n) => repo.certificates.getVersion(id, n),
  toHttpError,
};
```

- [ ] **Step 5: Implement the controller + routes**

`backend/controllers/certificateController.js`:

```js
const service = require('../services/certificateService');
const { assertKnownFarmer } = require('./sheetController');
const logger = require('../utils/logger');

const actorOf = (req) => req.user?.email || 'unknown';

async function handle(res, label, fn) {
  try {
    return await fn();
  } catch (err) {
    const mapped = service.toHttpError(err);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    logger.error(`[certificateController.${label}] ${err.message}`);
    return res.status(500).json({ error: 'שגיאה בתעודות', details: err.message });
  }
}

async function requireFarmerAndIds(req, res) {
  const { farmer, recordIds } = req.body || {};
  if (!farmer || !Array.isArray(recordIds) || !recordIds.length) {
    res.status(400).json({ error: 'farmer and recordIds are required' });
    return null;
  }
  const farmerError = await assertKnownFarmer(farmer);
  if (farmerError) { res.status(400).json({ error: farmerError }); return null; }
  return { farmer, recordIds };
}

module.exports = {
  preview: (req, res) => handle(res, 'preview', async () => {
    const body = await requireFarmerAndIds(req, res); if (!body) return;
    res.json(await service.preview(body));
  }),
  issue: (req, res) => handle(res, 'issue', async () => {
    const body = await requireFarmerAndIds(req, res); if (!body) return;
    res.status(201).json({ certificates: await service.issue({ ...body, actor: actorOf(req) }) });
  }),
  reprint: (req, res) => handle(res, 'reprint', async () => {
    res.json(await service.reprint({ id: req.params.id, actor: actorOf(req) }));
  }),
  removePallet: (req, res) => handle(res, 'removePallet', async () => {
    if (!req.body?.recordId) return res.status(400).json({ error: 'recordId is required' });
    res.json(await service.removePallet({ id: req.params.id, recordId: req.body.recordId, actor: actorOf(req) }));
  }),
  list: (req, res) => handle(res, 'list', async () => {
    const { farmer, from, to } = req.query;
    if (!farmer) return res.status(400).json({ error: 'farmer is required' });
    res.json({ certificates: await service.list({ farmer, from, to }) });
  }),
  get: (req, res) => handle(res, 'get', async () => {
    const got = await service.get(req.params.id);
    if (!got) return res.status(404).json({ error: 'התעודה לא נמצאה' });
    res.json(got);
  }),
  getVersion: (req, res) => handle(res, 'getVersion', async () => {
    const snapshot = await service.getVersion(req.params.id, Number(req.params.n));
    if (!snapshot) return res.status(404).json({ error: 'הגרסה לא נמצאה' });
    res.json({ snapshot });
  }),
};
```

`backend/routes/certificateRoutes.js`:

```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/certificateController');

router.post('/preview', c.preview);
router.post('/', c.issue);
router.get('/', c.list);
router.get('/:id', c.get);
router.get('/:id/versions/:n', c.getVersion);
router.post('/:id/reprint', c.reprint);
router.post('/:id/remove-pallet', c.removePallet);

module.exports = router;
```

In `backend/controllers/sheetController.js`, append at the end: `module.exports.assertKnownFarmer = assertKnownFarmer;`

In `backend/app.js`, right after the `app.use("/api", verifyFirebaseToken, ensureCenterAccess, …, sheetRoutes)` block, add:

```js
// 📄 Shipping certificates (task 20) — same auth chain as the rest of /api.
app.use("/api/certificates", verifyFirebaseToken, ensureCenterAccess, require("./routes/certificateRoutes"));
```

- [ ] **Step 6: Run to verify pass.** `cd backend && npm test`. Expected: all green, including the new `certificates.api` file.

- [ ] **Step 7: Commit**

```bash
git add backend/services/certificateService.js backend/controllers/certificateController.js backend/routes/certificateRoutes.js backend/app.js backend/controllers/sheetController.js backend/tests/helpers/apiHarness.js backend/tests/api.test.js backend/tests/certificates.api.test.js
git commit -m "feat(task-20): /api/certificates — preview, issue, reprint, remove-pallet, reads"
```

---

### Task 4: Admin profile + export, record-path integration, retire the Sheets label flow, backup, seeds

**Files:**
- Modify: `backend/app.js`, `backend/controllers/sheetController.js`, `backend/routes/sheetRoutes.js`, `backend/services/backupService.js`, `backend/scripts/seedTestCenter.js`, `backend/tests/api.test.js`, `backend/tests/certificates.api.test.js`
- Delete: `backend/services/shippingLabelsService.js`, `backend/controllers/labelController.js`
- Create: `backend/scripts/seedCertificateProfiles.js`

**Interfaces:**
- Consumes: `repo.certificates.{getProfile,setProfile,maxIssuedNumber,listAllWithVersions}` (Task 2) and `certificateService.removePallet` (Task 3).
- Produces:
  - `GET /api/admin/farmers/:farmer/certificate-profile` → `{profile}` (`profile` may be null)
  - `PUT /api/admin/farmers/:farmer/certificate-profile {headerLines[5], driverName, nextNumber}` → `{profile}`
  - `GET /api/admin/export/records` → `{farmers: {[name]: records[]}}`

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/certificates.api.test.js`)

```js
describe('admin: certificate profile + export', () => {
  const url = `/api/admin/farmers/${enc(FARMER)}/certificate-profile`;
  it('admin reads and writes the profile; user is forbidden', async () => {
    expect((await api('get', url, 'user')).status).toBe(403);
    const put = await api('put', url).send({ ...profile, nextNumber: 60000 });
    expect(put.status).toBe(200);
    expect((await api('get', url)).body.profile.nextNumber).toBe(60000);
  });
  it('validates shape: 5 header lines, integer nextNumber ≥ 1', async () => {
    expect((await api('put', url).send({ ...profile, headerLines: ['a'] })).status).toBe(400);
    expect((await api('put', url).send({ ...profile, nextNumber: 0 })).status).toBe(400);
    expect((await api('put', url).send({ ...profile, nextNumber: 1.5 })).status).toBe(400);
  });
  it('rejects nextNumber ≤ highest issued number', async () => {
    const id = await addRecord(1);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] }); // issues 51466
    const res = await api('put', url).send({ ...profile, nextNumber: 51466 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch('51466');
  });
  it('season export is admin-only and returns records per farmer', async () => {
    await addRecord(1);
    expect((await api('get', '/api/admin/export/records', 'user')).status).toBe(403);
    const res = await api('get', '/api/admin/export/records');
    expect(res.status).toBe(200);
    expect(res.body.farmers[FARMER]).toHaveLength(1);
  });
});

describe('record paths stay consistent with certificates', () => {
  it('resetPallets on a certified pallet removes it from its certificate', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    const res = await api('put', `/api/farmers/${enc(FARMER)}/records/resetPallets`).send({ palletIds: [id] });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false });
    const got = await api('get', `/api/certificates/${enc(issued.id)}`);
    expect(got.body.certificate.status).toBe('cancelled');
  });
  it('single-record edit cannot change cardId/sent of a certified pallet', async () => {
    const id = await addRecord(421);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    const res = await api('put', `/api/farmers/${enc(FARMER)}/records/${id}`).send({
      farmer: FARMER, harvestDate: '2026-11-30', palletNumber: 421, boxes: 120, kind: 'שלי', size: '15',
      weight: 760, destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', cardId: '', sent: false, mark: false,
    });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ weight: 760, cardId: 51466, sent: true });
  });
  it('the old Sheets label endpoint is gone', async () => {
    expect((await api('post', '/api/shipping/newlabel').send({ farmer: FARMER, pallets: [] })).status).toBe(404);
  });
});
```

Also in `backend/tests/api.test.js`:
- Delete the test `'certificate creation fails loudly instead of writing a real spreadsheet'` and the test `'an unknown farmer has no label spreadsheet (no silent fallback to Tsuberi)'`.
- Delete the `shippingLabelsService` import.
- Keep the create-sheet test (`googleSheetsService` stays until task 6).

- [ ] **Step 2: Run to verify failure.** `cd backend && npm test -- certificates.api`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement the admin endpoints in `backend/app.js`** (next to the user-management endpoints)

```js
// 📄 Certificate profile per farmer (header lines, driver, next number) — task 20.
const certRepo = require('./repositories').certificates;

app.get("/api/admin/farmers/:farmer/certificate-profile", ensureAdmin, async (req, res) => {
  try {
    res.json({ profile: await certRepo.getProfile(req.params.farmer) });
  } catch (err) {
    logger.error(`[GET certificate-profile] ${err.message}`);
    res.status(500).json({ error: "Failed to load profile", details: err.message });
  }
});

app.put("/api/admin/farmers/:farmer/certificate-profile", ensureAdmin, async (req, res) => {
  const { farmer } = req.params;
  const { headerLines, driverName = '', nextNumber } = req.body || {};
  if (!Array.isArray(headerLines) || headerLines.length !== 5 || headerLines.some(l => typeof l !== 'string')) {
    return res.status(400).json({ error: "נדרשות בדיוק 5 שורות כותרת" });
  }
  if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    return res.status(400).json({ error: "מספר התעודה הבא חייב להיות מספר שלם חיובי" });
  }
  try {
    const maxIssued = await certRepo.maxIssuedNumber(farmer);
    if (nextNumber <= maxIssued) {
      return res.status(400).json({ error: `מספר התעודה הבא חייב להיות גדול מ-${maxIssued} (התעודה האחרונה שהונפקה)` });
    }
    const profile = { headerLines, driverName: String(driverName), nextNumber };
    await certRepo.setProfile(farmer, profile);
    logger.info(`[PUT certificate-profile] ${farmer} nextNumber=${nextNumber} by ${req.user.email}`);
    res.json({ profile });
  } catch (err) {
    logger.error(`[PUT certificate-profile] ${err.message}`);
    res.status(500).json({ error: "Failed to save profile", details: err.message });
  }
});

// 📤 Season export — all farmers' pallet records (the frontend builds the Excel file).
app.get("/api/admin/export/records", ensureAdmin, async (req, res) => {
  try {
    const recordsRepo = require('./repositories');
    const snap = await configDoc().get();
    const names = ((snap.exists && snap.data().farmers) || []).map(f => f.name).filter(Boolean);
    const farmers = {};
    for (const name of names) farmers[name] = await recordsRepo.getRecords(name);
    logger.info(`[GET export/records] ${names.length} farmers by ${req.user.email}`);
    res.json({ farmers });
  } catch (err) {
    logger.error(`[GET export/records] ${err.message}`);
    res.status(500).json({ error: "Failed to export", details: err.message });
  }
});
```

- [ ] **Step 4: Record-path integration in `backend/controllers/sheetController.js`**

At the top, add:

```js
const certificateService = require("../services/certificateService");
```

**a.** In `resetSentStatus`, replace the "Bulk update logic" lines (`const results = await repo.updateSentStatus(...)` + `emitResetSent`) with the following. Certified pallets go through remove-pallet, which keeps certificate and pallet in sync and emits its own event:

```js
      const all = await repo.getRecords(farmer);
      const certified = all.filter(r => palletIds.includes(r.id) && r.cardId !== '' && r.cardId != null);
      const plain = palletIds.filter(id => !certified.some(r => r.id === id));
      for (const r of certified) {
        await certificateService.removePallet({ id: `${farmer}__${r.cardId}`, recordId: r.id, actor: req.user?.email || 'unknown' });
      }
      const results = plain.length ? await repo.updateSentStatus(farmer, plain, false) : [];
      if (plain.length) firestoreEventService.emitResetSent(farmer, plain, req.user?.email || 'unknown');
      logger.info(`[resetSentStatus] ${farmer}: ${certified.length} removed from certificates, ${plain.length} reset`);
```

**b.** In `updateRecord`, before building `sheetRecord`, preserve the certificate fields of a certified pallet:

```js
      const existing = (await repo.getRecords(farmer)).find(r => r.id === id);
      const certified = existing && existing.cardId !== '' && existing.cardId != null;
      const effectiveCardId = certified ? existing.cardId : cardId;
      const effectiveSent = certified ? existing.sent : sent;
```

Then pass `effectiveCardId` / `effectiveSent` to the `SheetModel` constructor in place of `cardId` / `sent`.

**c.** Delete the `labelController` import and the `router.post('/shipping/newlabel/', …)` route in `backend/routes/sheetRoutes.js`. Delete the files `backend/controllers/labelController.js` and `backend/services/shippingLabelsService.js`. Then `grep -rn "shippingLabelsService\|labelController\|SHIPPING_LABELS_ID" backend --include=*.js | grep -v node_modules` must return nothing. `utils/sheetsGuard.js` and the `googleSheetsService` guard stay.

- [ ] **Step 5: Backup includes certificates.** In `backend/services/backupService.js` `runBackup`:
  - After step 2 (fetching records), add:
    ```js
    let certificates = [];
    try { certificates = await repo.certificates.listAllWithVersions(); }
    catch (err) { logger.error(`[backupService] Failed to fetch certificates: ${err.message}`); }
    ```
  - In step 3, serialize `{ timestamp, farmers: farmersData, certificates }`.

- [ ] **Step 6: Seeds.**

In `backend/scripts/seedTestCenter.js`, after the config `set`, add:

```js
  await center.collection('farmers').doc('חקלאי-טסט').set({
    certificateProfile: {
      headerLines: ['חקלאי טסט', "משק מס' 1", 'מושב טסט', 'נייד: 050-0000000', 'עוסק מורשה 000000000'],
      driverName: 'אדם', nextNumber: 1000,
    },
  }, { merge: true });
```

Create `backend/scripts/seedCertificateProfiles.js`:

```js
// One-time, idempotent: seed centers/{CENTER_ID}/farmers/{name}.certificateProfile from each
// farmer's legacy label spreadsheet (read-only on Sheets). Skips farmers that already have a
// profile or whose sheet is not readable. Run: node scripts/seedCertificateProfiles.js [--dry-run]
require('dotenv').config();
const path = require('path');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const LEGACY = {
  'גבי צוברי': 'SHIPPING_LABELS_ID_TSUBERI', 'אבנר לוי': 'SHIPPING_LABELS_ID_AVNER', 'עידן לוי': 'SHIPPING_LABELS_ID_IDAN',
  'גמליאל': 'SHIPPING_LABELS_ID_PESAH', 'קופלר': 'SHIPPING_LABELS_ID_KOPLER', 'עטר שחק': 'SHIPPING_LABELS_ID_SHAHAK',
  'ברק מלצר': 'SHIPPING_LABELS_ID_MELTZER',
};
const dryRun = process.argv.includes('--dry-run');
const keyFile = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(require(keyFile)), projectId: process.env.FIREBASE_PROJECT_ID });

(async () => {
  const db = admin.firestore();
  const sheets = google.sheets({ version: 'v4', auth: await new google.auth.GoogleAuth({ keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }).getClient() });
  for (const [farmer, envVar] of Object.entries(LEGACY)) {
    const ref = db.collection('centers').doc(CENTER_ID).collection('farmers').doc(farmer);
    const existing = await ref.get();
    if (existing.exists && existing.data().certificateProfile) { logger.info(`[seed] ${farmer}: has profile — skip`); continue; }
    const spreadsheetId = process.env[envVar];
    if (!spreadsheetId) { logger.warn(`[seed] ${farmer}: ${envVar} unset — enter in Settings`); continue; }
    try {
      const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: ['base!A1:A5', 'base!D7', 'base!A26:L26'] }, { timeout: 20000 });
      const [header, num, driverRow] = res.data.valueRanges.map(v => v.values || []);
      const headerLines = [0, 1, 2, 3, 4].map(i => String((header[i] || [])[0] || '').trim());
      const current = parseInt((num[0] || [])[0], 10);
      const driverCells = (driverRow[0] || []).map(c => String(c).trim()).filter(Boolean);
      const driverName = driverCells.includes('אדם') ? 'אדם' : '';
      if (!Number.isInteger(current)) throw new Error(`base!D7 is not a number`);
      const profile = { headerLines, driverName, nextNumber: current + 1 };
      logger.info(`[seed] ${farmer}: ${JSON.stringify(profile)}${dryRun ? ' (dry run)' : ''}`);
      if (!dryRun) await ref.set({ certificateProfile: profile }, { merge: true });
    } catch (err) {
      logger.warn(`[seed] ${farmer}: cannot read sheet (${err.message}) — enter in Settings`);
    }
  }
  process.exit(0);
})();
```

The seed is not run against production in this task. It is run at deploy time and listed in the rollout checklist (Task 9).

- [ ] **Step 7: Run all backend tests.** `cd backend && npm test`. Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/app.js backend/controllers/sheetController.js backend/routes/sheetRoutes.js backend/services/backupService.js backend/scripts/seedTestCenter.js backend/scripts/seedCertificateProfiles.js backend/tests/api.test.js backend/tests/certificates.api.test.js
git rm backend/services/shippingLabelsService.js backend/controllers/labelController.js
git commit -m "feat(task-20): certificate profile admin + season export; retire Sheets labels"
```

---

### Task 5: Certificate PDF builder (frontend, pure + print wrapper) with unit tests

**Files:**
- Create: `frontend/src/data/certificatePdf.js`, `frontend/vitest.config.js`, `frontend/tests/certificatePdf.test.js`
- Modify: `frontend/package.json` (devDependency `vitest`, script `"test": "vitest run"`)

**Interfaces:**
- Produces:
  - `buildCertificateDoc(snapshots: Snapshot[]) → pdfmake docDefinition`. Pure; no pdfmake import.
  - `printCertificates(snapshots, filename) → Promise<'shared'|'opened'|'downloaded'>`. Throws on render failure.
  - `previewSnapshot(profile) → Snapshot` (sample data for the Settings preview).
- `Snapshot` = backend `buildSnapshot` output (Task 1).

- [ ] **Step 1: Check how stickers handle RTL.** `printData.js` sets `textDirection: "rtl"` and right alignment on Hebrew strings, and pdfmake renders them in order. Confirm by generating one sticker in the dev stack. Use the same `defaultStyle`/`textDirection` approach here. **Table columns are given right-to-left by reversing the column order in the `body` array**, because pdfmake lays tables out left-to-right.

- [ ] **Step 2: Add Vitest to the frontend.**

```bash
cd frontend && npm i -D vitest@^4
```

`frontend/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.js'] } });
```

Add `"test": "vitest run"` to `frontend/package.json` scripts.

- [ ] **Step 3: Write the failing test** — `frontend/tests/certificatePdf.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildCertificateDoc, previewSnapshot } from '../src/data/certificatePdf.js';

const snap = {
  headerLines: ['צברי נורית וגבריאל', "משק מס' 10", 'מושב חצבה', 'נייד: 052', 'עוסק מורשה 054897764'],
  driverName: 'אדם', number: 51219, shipmentDate: '2025-07-09', destination: 'שיווק האיחוד- פתח תקווה',
  rows: [{ recordId: 'a', palletNumber: 421, kind: 'שלי', size: '15', boxes: 120, weight: 753, firstOfPallet: true },
         { recordId: 'b', palletNumber: 421, kind: 'שלי', size: '16', boxes: 10, weight: 60, firstOfPallet: false }],
  palletCount: 1, totalBoxes: 130, totalWeight: 813,
};

const findTable = (doc) => doc.content.find(n => n.table && n.table.body[0].some(c => (c.text || c) === 'משטח מס\''));

describe('buildCertificateDoc', () => {
  it('renders one page per snapshot', () => {
    const doc = buildCertificateDoc([snap, { ...snap, number: 51220 }]);
    expect(doc.content.filter(n => n.pageBreak === 'before')).toHaveLength(1);
  });
  it('has the 9 columns right-to-left and exactly 13 body rows', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const header = table.table.body[0].map(c => c.text);
    expect(header).toEqual(['מחיר', 'כמות משטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"]);
    expect(table.table.body).toHaveLength(1 + 13);
  });
  it('fills rows with pallet count 1 only on the first row of a pallet', () => {
    const table = buildCertificateDoc([snap]).content.find(n => n.table && n.table.widths?.length === 9);
    const [r1, r2] = table.table.body.slice(1, 3).map(r => r.map(c => c.text));
    expect(r1).toEqual(['', '1', '753', '120', '', '', '15', 'שלי', '421']);
    expect(r2[1]).toBe('');
  });
  it('shows the number in red, the header lines, the destination and totals', () => {
    const json = JSON.stringify(buildCertificateDoc([snap]));
    expect(json).toContain('"text":"51219"');
    expect(json).toMatch(/"51219","bold":true,"color":"#dc2626"|"color":"#dc2626"[^}]*"51219"/);
    snap.headerLines.forEach(l => expect(json).toContain(l));
    expect(json).toContain('שיווק האיחוד- פתח תקווה');
    expect(json).toContain('2025-07-09');
    expect(json).toContain('"text":"אדם"');
  });
  it('previewSnapshot builds a printable sample from a profile', () => {
    const s = previewSnapshot({ headerLines: ['a', 'b', 'c', 'd', 'e'], driverName: '', nextNumber: 7 });
    expect(s.number).toBe(7);
    expect(() => buildCertificateDoc([s])).not.toThrow();
  });
});
```

(The red-number assertion is deliberately loose about key order. The `"text":"51219"` check plus the color regex together pin it.)

- [ ] **Step 4: Run to verify failure.** `cd frontend && npm test`. Expected: FAIL, module not found.

- [ ] **Step 5: Implement** — `frontend/src/data/certificatePdf.js`

```js
// Shipping certificate (תעודת משלוח) PDF. buildCertificateDoc is pure (unit-tested);
// printCertificates lazy-loads pdfmake + the Rubik font like the sticker printer does.
const RED = '#dc2626';
const BODY_ROWS = 13;
const COLUMNS = ['מחיר', 'כמות משטחים', 'משקל', 'כמות', 'אריזה', 'איכות', 'גודל', 'מוצר/זן', "משטח מס'"]; // left→right on paper = right-to-left reading
const WIDTHS = [45, 50, 50, 45, 65, 55, 35, 70, 60];

const cell = (text, extra = {}) => ({ text: text === undefined || text === null ? '' : String(text), alignment: 'center', ...extra });

function rowCells(row) {
  if (!row) return COLUMNS.map(() => cell(''));
  return [cell(''), cell(row.firstOfPallet ? 1 : ''), cell(row.weight), cell(row.boxes), cell(''), cell(''),
    cell(row.size), cell(row.kind), cell(row.palletNumber)];
}

function certificatePage(s, index) {
  const [title = '', ...lines] = s.headerLines || [];
  const body = [COLUMNS.map(h => cell(h, { bold: true, fillColor: '#f1f5f9' }))];
  for (let i = 0; i < BODY_ROWS; i++) body.push(rowCells(s.rows[i]));
  return [
    { text: title, fontSize: 30, bold: true, alignment: 'center', ...(index > 0 ? { pageBreak: 'before' } : {}) },
    ...lines.map((l, i) => ({ text: l, fontSize: i === 0 ? 11 : 9, bold: i === 0, alignment: 'center', margin: [0, 1, 0, 1] })),
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 1 }, { type: 'line', x1: 0, y1: 7, x2: 515, y2: 7, lineWidth: 1 }], margin: [0, 2, 0, 8] },
    { columns: [
      { text: [{ text: s.shipmentDate || '' }, { text: '   תאריך', bold: true }], alignment: 'left' },
      { text: [{ text: "מגדל מס':", bold: true }], alignment: 'right' },
    ], margin: [0, 0, 0, 6] },
    { text: [{ text: String(s.number), bold: true, color: RED, fontSize: 18 }, { text: "   סמ'   " }, { text: 'תעודת משלוח', bold: true, fontSize: 14 }], alignment: 'center', margin: [0, 0, 0, 6] },
    { text: [{ text: s.destination || '', bold: true, fontSize: 15, decoration: 'underline' }, { text: '  :עבור', fontSize: 10 }], alignment: 'right', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: WIDTHS, heights: (i) => (i === 0 ? 28 : 22), body }, layout: { hLineWidth: () => 1, vLineWidth: () => 1 } },
    { table: { widths: [45, 50, 50, '*'], body: [[cell(''), cell(s.palletCount, { bold: true }), cell('סה"כ משטחים', { fontSize: 9 }), cell('תוצרת מעושרת / נשלח מעשר', { alignment: 'right' })]] },
      layout: 'noBorders', margin: [0, 4, 0, 4] },
    { text: 'כמות מעשר', alignment: 'right', fontSize: 10, margin: [0, 2, 0, 6] },
    { columns: [
      { text: 'שעת יציאה', fontSize: 10 }, { text: 'רכב מס', fontSize: 10 },
      { text: s.driverName || '', alignment: 'center', fontSize: 11 }, { text: 'שם המוביל', alignment: 'right', fontSize: 10 },
    ], margin: [0, 6, 0, 6] },
    { columns: [
      { text: 'שעה', fontSize: 10 }, { text: 'חתימה', fontSize: 10 }, { text: '' }, { text: 'נפרק על-ידי', alignment: 'right', fontSize: 10 },
    ] },
  ];
}

export function buildCertificateDoc(snapshots) {
  return {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: 'Rubik', fontSize: 11, alignment: 'right' },
    textDirection: 'rtl',
    content: snapshots.flatMap((s, i) => certificatePage(s, i)),
  };
}

export function previewSnapshot(profile) {
  return {
    headerLines: profile.headerLines, driverName: profile.driverName || '', number: profile.nextNumber,
    shipmentDate: new Date().toISOString().slice(0, 10), destination: 'יעד לדוגמה',
    rows: [{ recordId: 'p1', palletNumber: 1, kind: 'זן', size: '12', boxes: 100, weight: 600, firstOfPallet: true }],
    palletCount: 1, totalBoxes: 100, totalWeight: 600,
  };
}

async function loadPdfMake() {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('../../fonts/vfs_fonts.js'),
  ]);
  pdfMake.vfs = pdfFonts;
  pdfMake.fonts = { Rubik: { normal: 'Rubik-VariableFont_wght.ttf', bold: 'Rubik-Bold.ttf' } };
  return pdfMake;
}

// Tablet: native share sheet (→ Wi-Fi printer). PC: open in a new tab; fallback download.
export async function printCertificates(snapshots, filename) {
  const pdfMake = await loadPdfMake();
  const pdf = pdfMake.createPdf(buildCertificateDoc(snapshots));
  const blob = await new Promise((resolve) => pdf.getBlob(resolve));
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename }); // throws on cancel/failure — caller decides
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) return 'opened';
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  return 'downloaded';
}
```

The exact visual tuning (font sizes, widths) is adjusted in Task 6, Step 6, by comparing a printout with `תעודות משלוח צוברי - 51219.pdf`. The tests pin structure, not pixels.

- [ ] **Step 6: Run to verify pass.** `cd frontend && npm test`. Expected: PASS (5 tests). Also run `npm run build`; it must pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/data/certificatePdf.js frontend/vitest.config.js frontend/tests/certificatePdf.test.js frontend/package.json frontend/package-lock.json
git commit -m "feat(task-20): certificate PDF builder + frontend unit tests"
```

---

### Task 6: Issue flow in PalletTable (preview → confirm → issue → print), cardId link, read-only cardId

**Files:**
- Create: `frontend/src/api/certificates.js`, `frontend/e2e/certificates.spec.js`
- Modify: `frontend/src/components/PalletTable.vue`, `frontend/e2e/season-flow.spec.js`

**Interfaces:**
- Consumes: the endpoints from Task 3 and `printCertificates` (Task 5).
- Produces `frontend/src/api/certificates.js`:

```js
import { getToken } from '../utils/auth';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

export const previewCertificates = (farmer, recordIds) => call('POST', '/certificates/preview', { farmer, recordIds });
export const issueCertificates = (farmer, recordIds) => call('POST', '/certificates', { farmer, recordIds });
export const reprintCertificate = (id) => call('POST', `/certificates/${encodeURIComponent(id)}/reprint`);
export const removePalletFromCertificate = (id, recordId) => call('POST', `/certificates/${encodeURIComponent(id)}/remove-pallet`, { recordId });
export const listCertificates = (farmer, { from, to } = {}) => {
  const q = new URLSearchParams({ farmer, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  return call('GET', `/certificates?${q}`);
};
export const getCertificate = (id) => call('GET', `/certificates/${encodeURIComponent(id)}`);
export const getCertificateVersion = (id, n) => call('GET', `/certificates/${encodeURIComponent(id)}/versions/${n}`);
export const getCertificateProfile = (farmer) => call('GET', `/admin/farmers/${encodeURIComponent(farmer)}/certificate-profile`);
export const saveCertificateProfile = (farmer, profile) => call('PUT', `/admin/farmers/${encodeURIComponent(farmer)}/certificate-profile`, profile);
export const exportSeasonRecords = () => call('GET', '/admin/export/records');
```

- [ ] **Step 1: Write the failing E2E** — `frontend/e2e/certificates.spec.js` (first test; Task 7 adds more)

```js
import { test, expect } from '@playwright/test';
import { navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber, DESTINATION } from './helpers.js';

// Capture the generated PDF instead of a real share sheet / new tab.
async function stubPrinting(page, { failShare = false } = {}) {
  await page.addInitScript((failShare) => {
    window.__printed = [];
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => {
      if (failShare) throw new Error('share blocked');
      window.__printed.push(files[0].name);
    };
  }, failShare);
}

export async function preparePallet(page, pallet) {
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  const editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2026-12-01');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('480');
}

test('issue a certificate from shipment prep: confirm shows split, PDF printed, row stamped', async ({ page }) => {
  await stubPrinting(page);
  const pallet = uniquePalletNumber();
  await signIn(page);
  await preparePallet(page, pallet);
  const row = rowByPallet(page, pallet);
  await row.locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await expect(page.getByText('תיווצר תעודה אחת')).toBeVisible();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  await expect(row.locator('td[data-col="cardId"]')).toHaveText(/^\d+$/);
  await expect(row.locator('td[data-col="cardId"] a')).toHaveAttribute('href', /\/Certificates\?/);
});

test('a failed print still keeps the certificate and says where to reprint', async ({ page }) => {
  await stubPrinting(page, { failShare: true });
  const pallet = uniquePalletNumber();
  await signIn(page);
  await preparePallet(page, pallet);
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(page.getByText(/התעודה נשמרה/)).toBeVisible();
  await page.getByRole('button', { name: 'הבנתי' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="cardId"]')).toHaveText(/^\d+$/);
});
```

Also update `frontend/e2e/season-flow.spec.js`. The old final section asserting "Google Sheets access is disabled" no longer applies:
- Replace that block (from `// Certificate creation must fail loudly…` through the `cardId` empty assertion) with a stubbed print and an assertion that the cardId becomes a number.
- Rename the test to `'intake → weigh → mark for shipment → certificate'`.
- Add `await page.addInitScript(() => { navigator.canShare = () => true; navigator.share = async () => {}; });` at the start of the test.

- [ ] **Step 2: Run to verify failure.** `cd frontend && npm run e2e`. Expected: the new tests FAIL (the confirm text "תיווצר תעודה אחת" is not found).

- [ ] **Step 3: Implement in `PalletTable.vue`.**

**a.** Imports:

```js
import { previewCertificates, issueCertificates } from '../api/certificates';
import { printCertificates } from '../data/certificatePdf';
```

**b.** `isCreateLabelAllowed()` (the misnamed "disabled" computed) becomes `return this.selectedPallets.length === 0`.

**c.** Replace the body of `sendSelectedPallets()` with:

```js
        async sendSelectedPallets() {
            const ids = [...this.selectedPallets];
            this.isCreatingLabel = true;
            try {
                const pv = await previewCertificates(this.farmer, ids);
                const sizes = pv.chunks.map(c => c.rows);
                const summary = sizes.length === 1
                    ? `תיווצר תעודה אחת (${sizes[0]} שורות)`
                    : `ייווצרו ${sizes.length} תעודות: ${sizes.join(' + ')}`;
                const ok = await requestConfirm({
                    title: 'הפקת תעודת משלוח',
                    message: `${summary}\nיעד: ${pv.destination} · תאריך: ${pv.shipmentDate}`,
                    confirmLabel: 'אשר',
                });
                if (!ok) return;
                const { certificates } = await issueCertificates(this.farmer, ids);
                const byRecord = new Map();
                certificates.forEach(c => c.snapshot.rows.forEach(r => byRecord.set(r.recordId, c.number)));
                const updated = this.pallets.map(p => byRecord.has(p.id)
                    ? { ...p, cardId: byRecord.get(p.id), sent: true, mark: false } : p);
                this.$emit('update:pallets', updated);
                this.selectedPallets = [];
                const numbers = certificates.map(c => c.number).join('-');
                try {
                    await printCertificates(certificates.map(c => c.snapshot), `תעודת-משלוח-${numbers}.pdf`);
                } catch {
                    await requestAlert({ title: 'ההדפסה לא הושלמה',
                        message: `התעודה נשמרה (${numbers}). ניתן להדפיס אותה שוב ממסך "תעודות".`, variant: 'warning' });
                }
            } catch (err) {
                await requestAlert({ title: err.status === 400 || err.status === 409 ? 'לא ניתן להפיק תעודה' : 'שגיאה',
                    message: err.message, variant: err.status === 400 || err.status === 409 ? 'warning' : 'error' });
            } finally {
                this.isCreatingLabel = false;
            }
        },
```

Delete the now-unused `validatePallet` method only if nothing else references it (`grep -n validatePallet`).

**d.** Check the `requestConfirm` option names in `src/composables/useDialogs.js` (`title`, `message`, and the confirm-label key) and use the exact names there. If the message renders `\n` literally, use two separate sentences instead.

**e.** Make the certificate number read-only and a link. In the `columns` array, set the `cardId` column to `editable: false`. In the non-editing row template, where `<template v-else>{{ pallet[col.key] }}</template>` renders cells, add a branch before it:

```html
<template v-else-if="col.key === 'cardId' && pallet.cardId !== '' && pallet.cardId != null">
    <router-link :to="{ path: '/Certificates', query: { farmer, number: String(pallet.cardId) } }"
        class="text-mango-700 underline font-medium" @click.stop>{{ pallet.cardId }}</router-link>
</template>
```

**f.** Remove the old label-creation code path entirely: the `fetch` to `/api/shipping/newlabel` and the follow-up `updatemany` call. `grep -n "newlabel" src` must return nothing.

- [ ] **Step 4: Run E2E.** `cd frontend && npm run e2e`. Expected: all pass on desktop + tablet. (The `/Certificates` route doesn't exist yet; the test only checks the link's `href`.)

- [ ] **Step 5: Run backend tests too** (`cd backend && npm test`). Expected: green.

- [ ] **Step 6: Visual check against the sample.**
  1. Start `cd backend && npm run local:test`, sign in, and issue a certificate for the test farmer.
  2. In the share stub's absence (desktop Chrome), the PDF opens in a new tab.
  3. Screenshot it next to `תעודות משלוח צוברי - 51219.pdf`. Tune `WIDTHS`, font sizes and margins in `certificatePdf.js` until the layout matches: header block, red number, 9 columns RTL, 13 rows, footer.
  4. Re-run `cd frontend && npm test` after tuning.

  Record the comparison screenshot path in the task report.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/certificates.js frontend/src/components/PalletTable.vue frontend/src/data/certificatePdf.js frontend/e2e/certificates.spec.js frontend/e2e/season-flow.spec.js
git commit -m "feat(task-20): issue certificates from the pallet table with split preview + print"
```

---

### Task 7: "תעודות" screen — list, expand, history, reprint, remove pallet, merged PDF, Excel export

**Files:**
- Create: `frontend/src/components/Certificates.vue`
- Modify: `frontend/src/router.js`, `frontend/src/App.vue`, `frontend/e2e/certificates.spec.js`

**Interfaces:**
- Consumes:
  - `listCertificates`, `getCertificate`, `getCertificateVersion`, `reprintCertificate`, `removePalletFromCertificate` (Task 6 `api/certificates.js`)
  - `printCertificates` (Task 5)
  - `requestConfirm` / `requestAlert` (`composables/useDialogs`)
  - `inject('selectedFarmer')`, `inject('config')`
- Produces route `/Certificates` (query `farmer`, `number` optional), `meta: { requiresAuth: true }`.

- [ ] **Step 1: Write the failing E2E** (append to `frontend/e2e/certificates.spec.js`)

```js
async function issueOne(page, pallet) {
  await preparePallet(page, pallet);
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  const cell = rowByPallet(page, pallet).locator('td[data-col="cardId"]');
  await expect(cell).toHaveText(/^\d+$/);
  return (await cell.textContent()).trim();
}

test('certificates screen: list, history after reprint, remove pallet, export', async ({ page }) => {
  await stubPrinting(page);
  const pallet = uniquePalletNumber();
  await signIn(page);
  const number = await issueOne(page, pallet);

  // Correct the weight, then reprint from the certificates screen → version 2
  const editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('490');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await page.getByRole('button', { name: 'אשר' }).click(); // CR#3 "already sent" confirm (task 5)

  await navTo(page, 'תעודות');
  const certRow = page.locator('tr[data-certificate]', { hasText: number });
  await expect(certRow).toBeVisible();
  await certRow.getByRole('button', { name: 'הדפס' }).click();
  await expect(certRow.locator('[data-col="version"]')).toHaveText('2');

  // Expand → pallets; history lists both versions
  await certRow.getByRole('button', { name: 'פרטים' }).click();
  await expect(page.getByText('גרסה 1')).toBeVisible();
  await expect(page.getByText('גרסה 2')).toBeVisible();

  // Excel export downloads a file
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא לאקסל' }).click();
  expect((await download).suggestedFilename()).toMatch(/^תעודות-.*\.xlsx$/);

  // Remove the pallet → certificate cancelled, pallet back in shipment prep
  await page.getByRole('button', { name: 'הסר מתעודה' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(certRow.locator('[data-col="status"]')).toHaveText('מבוטלת');
  await navTo(page, 'הכנה למשלוח');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);
});
```

Note: if task 5 (CR#3 confirm on editing sent rows) is not on the branch, drop the `אשר` click after `שמור`. Check with `git log --oneline | grep task-5`.

- [ ] **Step 2: Run to verify failure.** `cd frontend && npm run e2e`. Expected: FAIL (no "תעודות" link).

- [ ] **Step 3: Route + sidebar.**

In `frontend/src/router.js`:
- Add `import Certificates from "./components/Certificates.vue";`
- Add `{ path: "/Certificates", name: "Certificates", component: Certificates, meta: { requiresAuth: true } },` before `/Settings`.

In `frontend/src/App.vue` `routes` ref, add before the Settings entry: `{ path: '/Certificates', label: 'תעודות', role: 'user' },`.

- [ ] **Step 4: Implement `frontend/src/components/Certificates.vue`**

```vue
<template>
  <div class="h-full flex flex-col rtl animate-fade-in">
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-bold text-slate-800">תעודות</h2>
        <p class="text-slate-400 text-sm mt-0.5">תעודות משלוח שהונפקו — {{ farmer }}</p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="text-sm text-slate-500">מתאריך <input type="date" v-model="from" class="input-field !w-auto text-sm" /></label>
        <label class="text-sm text-slate-500">עד <input type="date" v-model="to" class="input-field !w-auto text-sm" /></label>
        <select v-model="destination" class="input-field !w-auto text-sm">
          <option value="">כל היעדים</option>
          <option v-for="d in destinations" :key="d" :value="d">{{ d }}</option>
        </select>
        <input v-model="search" placeholder="חיפוש מספר..." class="input-field !w-32 text-sm" />
        <button class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3" :disabled="!selected.length" @click="printSelected">הדפס נבחרות</button>
        <button class="btn-primary text-sm min-h-[36px] px-3" :disabled="!filtered.length" @click="exportExcel">ייצוא לאקסל</button>
      </div>
    </div>

    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <EmptyState v-else-if="!filtered.length" />
    <div v-else class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200">
      <table class="w-full text-sm text-center">
        <thead class="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th class="p-2 w-8"></th><th class="p-2">מספר</th><th class="p-2">תאריך</th><th class="p-2">יעד</th>
            <th class="p-2">משטחים</th><th class="p-2">ארגזים</th><th class="p-2">משקל</th><th class="p-2">גרסה</th>
            <th class="p-2">סטטוס</th><th class="p-2"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="c in filtered" :key="c.id">
            <tr :data-certificate="c.number" :class="['border-t border-slate-100', highlight === String(c.number) ? 'bg-mango-50' : '']">
              <td class="p-2"><input type="checkbox" :value="c.id" v-model="selected" :disabled="c.status === 'cancelled'" class="w-5 h-5" /></td>
              <td class="p-2 font-bold">{{ c.number }}</td>
              <td class="p-2">{{ c.shipmentDate }}</td>
              <td class="p-2">{{ c.destination }}</td>
              <td class="p-2">{{ c.palletCount }}</td>
              <td class="p-2">{{ c.totalBoxes }}</td>
              <td class="p-2">{{ c.totalWeight }}</td>
              <td class="p-2" data-col="version" :title="`עודכן ע״י ${c.updatedBy} · ${c.updatedAt}`">{{ c.currentVersion }}</td>
              <td class="p-2" data-col="status">
                <span :class="c.status === 'cancelled' ? 'text-red-600' : 'text-emerald-600'">{{ c.status === 'cancelled' ? 'מבוטלת' : 'הונפקה' }}</span>
              </td>
              <td class="p-2 whitespace-nowrap space-x-1 space-x-reverse">
                <button class="btn-ghost text-xs border border-slate-200 px-2 py-1" :disabled="c.status === 'cancelled'" @click="reprint(c)">הדפס</button>
                <button class="btn-ghost text-xs border border-slate-200 px-2 py-1" @click="toggle(c)">{{ open[c.id] ? 'סגור' : 'פרטים' }}</button>
              </td>
            </tr>
            <tr v-if="open[c.id]" class="bg-slate-50/60">
              <td colspan="10" class="p-3 text-right">
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 class="font-semibold text-slate-700 mb-1">משטחים</h4>
                    <table class="w-full text-xs text-center bg-white rounded">
                      <tr class="text-slate-500"><th>משטח</th><th>זן</th><th>גודל</th><th>ארגזים</th><th>משקל</th><th></th></tr>
                      <tr v-for="r in open[c.id].latest.rows" :key="r.recordId" class="border-t border-slate-100">
                        <td>{{ r.palletNumber }}</td><td>{{ r.kind }}</td><td>{{ r.size }}</td><td>{{ r.boxes }}</td><td>{{ r.weight }}</td>
                        <td><button class="text-red-600 underline text-xs" @click="removePallet(c, r)">הסר מתעודה</button></td>
                      </tr>
                    </table>
                  </div>
                  <div>
                    <h4 class="font-semibold text-slate-700 mb-1">היסטוריית גרסאות</h4>
                    <ul class="space-y-1 text-xs">
                      <li v-for="v in open[c.id].versions" :key="v.n" class="flex items-center justify-between bg-white rounded px-2 py-1">
                        <span>גרסה {{ v.n }} · {{ reasonLabel(v.reason) }} · {{ v.createdBy }} · {{ v.createdAt?.slice(0, 16).replace('T', ' ') }}</span>
                        <button class="underline" @click="printVersion(c, v.n)">הדפס גרסה</button>
                      </li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { ref, computed, inject, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import LoadingState from './shared/LoadingState.vue';
import ErrorState from './shared/ErrorState.vue';
import EmptyState from './shared/EmptyState.vue';
import { listCertificates, getCertificate, getCertificateVersion, reprintCertificate, removePalletFromCertificate } from '../api/certificates';
import { printCertificates } from '../data/certificatePdf';
import { requestConfirm, requestAlert } from '../composables/useDialogs';

export default {
  name: 'Certificates',
  components: { LoadingState, ErrorState, EmptyState },
  setup() {
    const route = useRoute();
    const selectedFarmer = inject('selectedFarmer', ref(''));
    const farmer = computed(() => route.query.farmer || selectedFarmer.value);
    const highlight = computed(() => route.query.number || '');
    const certificates = ref([]);
    const loading = ref(false);
    const error = ref('');
    const from = ref(''); const to = ref(''); const destination = ref('');
    const search = ref(highlight.value);
    const selected = ref([]);
    const open = ref({});

    const destinations = computed(() => [...new Set(certificates.value.map(c => c.destination))].sort());
    const filtered = computed(() => certificates.value.filter(c =>
      (!from.value || c.shipmentDate >= from.value) && (!to.value || c.shipmentDate <= to.value) &&
      (!destination.value || c.destination === destination.value) &&
      (!search.value || String(c.number).includes(search.value.trim()))));

    async function load() {
      if (!farmer.value) return;
      loading.value = true; error.value = '';
      try { certificates.value = (await listCertificates(farmer.value)).certificates; open.value = {}; }
      catch (e) { error.value = e.message; }
      finally { loading.value = false; }
    }

    async function details(c) {
      const { versions } = await getCertificate(c.id);
      const { snapshot } = await getCertificateVersion(c.id, c.currentVersion);
      return { versions, latest: snapshot };
    }
    async function toggle(c) {
      if (open.value[c.id]) { const { [c.id]: _, ...rest } = open.value; open.value = rest; return; }
      open.value = { ...open.value, [c.id]: await details(c) };
    }
    async function print(snapshots, name) {
      try { await printCertificates(snapshots, name); }
      catch { await requestAlert({ title: 'ההדפסה לא הושלמה', message: 'נסה שוב', variant: 'warning' }); }
    }
    async function reprint(c) {
      try {
        const res = await reprintCertificate(c.id);
        if (res.created) { await load(); }
        await print([res.snapshot], `תעודת-משלוח-${c.number}.pdf`);
      } catch (e) { await requestAlert({ title: 'שגיאה', message: e.message, variant: 'error' }); }
    }
    async function printVersion(c, n) {
      const { snapshot } = await getCertificateVersion(c.id, n);
      await print([snapshot], `תעודת-משלוח-${c.number}-גרסה-${n}.pdf`);
    }
    async function printSelected() {
      const chosen = certificates.value.filter(c => selected.value.includes(c.id));
      const snaps = await Promise.all(chosen.map(c => getCertificateVersion(c.id, c.currentVersion).then(r => r.snapshot)));
      await print(snaps, `תעודות-${chosen.map(c => c.number).join('-')}.pdf`);
    }
    async function removePallet(c, r) {
      const ok = await requestConfirm({ title: 'הסרה מתעודה',
        message: `להסיר את משטח ${r.palletNumber} מתעודה ${c.number}? המשטח יחזור להכנה למשלוח.` });
      if (!ok) return;
      try {
        const res = await removePalletFromCertificate(c.id, r.recordId);
        await load();
        if (!res.cancelled) {
          const again = await requestConfirm({ title: 'הדפסה מחדש', message: `להדפיס את תעודה ${c.number} המעודכנת?` });
          if (again) await print([res.snapshot], `תעודת-משלוח-${c.number}.pdf`);
        }
      } catch (e) { await requestAlert({ title: 'שגיאה', message: e.message, variant: 'error' }); }
    }
    async function exportExcel() {
      const XLSX = await import('xlsx');
      const certRows = filtered.value.map(c => ({ 'מספר': c.number, 'תאריך': c.shipmentDate, 'יעד': c.destination,
        'משטחים': c.palletCount, 'ארגזים': c.totalBoxes, 'משקל': c.totalWeight, 'גרסה': c.currentVersion,
        'סטטוס': c.status === 'cancelled' ? 'מבוטלת' : 'הונפקה' }));
      const snaps = await Promise.all(filtered.value.map(c => getCertificateVersion(c.id, c.currentVersion)
        .then(r => ({ c, s: r.snapshot }))));
      const palletRows = snaps.flatMap(({ c, s }) => s.rows.map(r => ({ 'תעודה': c.number, 'תאריך': c.shipmentDate,
        'יעד': c.destination, 'משטח': r.palletNumber, 'זן': r.kind, 'גודל': r.size, 'ארגזים': r.boxes, 'משקל': r.weight })));
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(certRows); ws1['!views'] = [{ RTL: true }];
      const ws2 = XLSX.utils.json_to_sheet(palletRows); ws2['!views'] = [{ RTL: true }];
      XLSX.utils.book_append_sheet(wb, ws1, 'תעודות');
      XLSX.utils.book_append_sheet(wb, ws2, 'משטחים');
      XLSX.writeFile(wb, `תעודות-${farmer.value}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
    const reasonLabel = (r) => ({ issue: 'הנפקה', reprint: 'עדכון', 'remove-pallet': 'הסרת משטח' }[r] || r);

    watch(farmer, load);
    onMounted(load);
    return { farmer, highlight, loading, error, from, to, destination, search, selected, open, destinations, filtered,
      load, toggle, reprint, printVersion, printSelected, removePallet, exportExcel, reasonLabel };
  },
};
</script>
```

If `ErrorState`/`EmptyState`/`LoadingState` take different props, check `frontend/SHARED_COMPONENTS.md` and adapt. The page root has `h-full` (PalletTable-style contract).

- [ ] **Step 5: Run E2E.** `cd frontend && npm run e2e`. Expected: all pass (desktop + tablet). Backend `npm test` stays green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Certificates.vue frontend/src/router.js frontend/src/App.vue frontend/e2e/certificates.spec.js
git commit -m "feat(task-20): תעודות screen — history, reprint, remove pallet, merged PDF, Excel export"
```

---

### Task 8: Settings — per-farmer certificate details editor + season export

**Files:**
- Create: `frontend/src/components/CertificateProfileEditor.vue`
- Modify: `frontend/src/components/Settings.vue`, `frontend/e2e/certificates.spec.js`

**Interfaces:**
- Consumes: `getCertificateProfile`, `saveCertificateProfile`, `exportSeasonRecords` (Task 6 api module); `printCertificates`, `previewSnapshot` (Task 5).
- Produces `<CertificateProfileEditor :farmer="name" @close="..." />`.

- [ ] **Step 1: Write the failing E2E** (append to `frontend/e2e/certificates.spec.js`)

```js
test('settings: edit certificate details per farmer, reject a lower number, season export', async ({ page }) => {
  await stubPrinting(page);
  await signIn(page);
  await navTo(page, 'ניהול הגדרות');
  await page.getByRole('button', { name: 'פרטי תעודה' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'פרטי תעודה' });
  await expect(dialog.getByLabel('שורת כותרת 1')).toHaveValue('חקלאי טסט');
  await dialog.getByLabel('שורת כותרת 1').fill('חקלאי טסט מעודכן');
  await dialog.getByLabel('מספר התעודה הבא').fill('1');   // ≤ issued numbers once any exist; 1 is always invalid after issues above
  await dialog.getByRole('button', { name: 'שמור' }).click();
  // Either saved (no certificates issued yet in this run) or rejected — both must be explicit
  await expect(page.getByText(/נשמר|חייב להיות גדול/)).toBeVisible();
  await dialog.getByLabel('מספר התעודה הבא').fill('5000');
  await dialog.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText('נשמר')).toBeVisible();
  await dialog.getByRole('button', { name: 'תצוגה מקדימה' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  await dialog.getByRole('button', { name: 'סגור' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא נתוני עונה' }).click();
  expect((await download).suggestedFilename()).toMatch(/^נתוני-עונה-.*\.xlsx$/);
});
```

- [ ] **Step 2: Run to verify failure.** `cd frontend && npm run e2e`. Expected: FAIL (no "פרטי תעודה" button).

- [ ] **Step 3: Implement `frontend/src/components/CertificateProfileEditor.vue`**

```vue
<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" @click.self="$emit('close')">
    <div role="dialog" aria-label="פרטי תעודה" class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 rtl space-y-3">
      <h3 class="text-lg font-bold text-slate-800">פרטי תעודה — {{ farmer }}</h3>
      <p v-if="loading" class="text-slate-400 text-sm">טוען...</p>
      <template v-else>
        <label v-for="(_, i) in form.headerLines" :key="i" class="block text-sm text-slate-600">
          שורת כותרת {{ i + 1 }}
          <input v-model="form.headerLines[i]" :aria-label="`שורת כותרת ${i + 1}`" class="input-field mt-1" />
        </label>
        <label class="block text-sm text-slate-600">שם המוביל
          <input v-model="form.driverName" aria-label="שם המוביל" class="input-field mt-1" />
        </label>
        <label class="block text-sm text-slate-600">מספר התעודה הבא
          <input v-model.number="form.nextNumber" type="number" min="1" aria-label="מספר התעודה הבא" class="input-field mt-1" />
        </label>
        <p v-if="message" :class="messageError ? 'text-red-600' : 'text-emerald-600'" class="text-sm">{{ message }}</p>
        <div class="flex gap-2 justify-end pt-2">
          <button class="btn-ghost border border-slate-200 px-3 py-2 text-sm" @click="preview">תצוגה מקדימה</button>
          <button class="btn-primary px-3 py-2 text-sm" :disabled="saving" @click="save">שמור</button>
          <button class="btn-ghost px-3 py-2 text-sm" @click="$emit('close')">סגור</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { reactive, ref, onMounted } from 'vue';
import { getCertificateProfile, saveCertificateProfile } from '../api/certificates';
import { printCertificates, previewSnapshot } from '../data/certificatePdf';

export default {
  name: 'CertificateProfileEditor',
  props: { farmer: { type: String, required: true } },
  emits: ['close'],
  setup(props) {
    const form = reactive({ headerLines: ['', '', '', '', ''], driverName: '', nextNumber: 1 });
    const loading = ref(true); const saving = ref(false);
    const message = ref(''); const messageError = ref(false);

    onMounted(async () => {
      try {
        const { profile } = await getCertificateProfile(props.farmer);
        if (profile) Object.assign(form, { headerLines: [...profile.headerLines], driverName: profile.driverName || '', nextNumber: profile.nextNumber });
      } catch (e) { message.value = e.message; messageError.value = true; }
      finally { loading.value = false; }
    });

    async function save() {
      saving.value = true; message.value = '';
      try {
        await saveCertificateProfile(props.farmer, { headerLines: form.headerLines, driverName: form.driverName, nextNumber: Number(form.nextNumber) });
        message.value = 'נשמר'; messageError.value = false;
      } catch (e) { message.value = e.message; messageError.value = true; }
      finally { saving.value = false; }
    }
    async function preview() {
      await printCertificates([previewSnapshot({ ...form, nextNumber: Number(form.nextNumber) })], `תצוגה-מקדימה-${props.farmer}.pdf`);
    }
    return { form, loading, saving, message, messageError, save, preview };
  },
};
</script>
```

- [ ] **Step 4: Wire into `Settings.vue`.**

**a.** In the farmer list (`v-for="farmer in localConfig.farmers"`, around line 21), add a button next to the existing controls:

```html
<button class="btn-ghost text-xs border border-slate-200 px-2 py-1" @click="profileFarmer = farmer.name">פרטי תעודה</button>
```

**b.** After the farmers section, add:

```html
<section class="card space-y-3">
  <h2 class="text-xl font-bold text-slate-700 pb-2 border-b border-slate-100">ייצוא נתוני עונה</h2>
  <p class="text-sm text-slate-500">קובץ אקסל עם כל המשטחים של כל המגדלים — לחישובי סוף עונה.</p>
  <SpinnerButton @click="exportSeason" :loading="exporting" class="btn-primary">ייצוא נתוני עונה</SpinnerButton>
</section>
<CertificateProfileEditor v-if="profileFarmer" :farmer="profileFarmer" @close="profileFarmer = ''" />
```

**c.** In the `<script>`:
- Import `CertificateProfileEditor` and `{ exportSeasonRecords } from '../api/certificates'`, and register the component.
- Add `const profileFarmer = ref('');` and `const exporting = ref(false);`, plus:

```js
const exportSeason = async () => {
  exporting.value = true;
  try {
    const { farmers } = await exportSeasonRecords();
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const [name, records] of Object.entries(farmers)) {
      const rows = records.map(r => ({ 'מגדל': name, 'מספר תעודה': r.cardId ?? '', 'תאריך משלוח': r.shipmentDate || '',
        'יעד': r.destination || '', 'משטח מס\'': r.palletNumber, 'זן': r.kind, 'גודל': r.size,
        'ארגזים': r.boxes, 'משקל': r.weight, 'תאריך קטיף': r.harvestDate }));
      const ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }];
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    XLSX.writeFile(wb, `נתוני-עונה-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } finally { exporting.value = false; }
};
```

- Return `profileFarmer, exporting, exportSeason` from `setup()`.

If `book_append_sheet` fails on an empty workbook (no farmers), append one empty sheet named 'ריק'.

- [ ] **Step 5: Run E2E + backend.** `cd frontend && npm run e2e`, then `cd backend && npm test`. Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CertificateProfileEditor.vue frontend/src/components/Settings.vue frontend/e2e/certificates.spec.js
git commit -m "feat(task-20): per-farmer certificate details in Settings + season Excel export"
```

---

### Task 9: Docs, board, rollout checklist, final verification

**Files:**
- Modify: `docs/architecture.md`, `docs/api-reference.md`, `docs/redesign-plan.md`, `done.md`, `.claude/skills/local-dev/SKILL.md`, `NEW_SEASON.md` (certificate section only)

- [ ] **Step 1: `docs/architecture.md`.**
  - Add to the backend file list: `certificateCore.js`, `FirestoreCertificateRepository.js`, `certificateService.js`, `certificateController.js`, `certificateRoutes.js`, `scripts/seedCertificateProfiles.js`.
  - Remove `shippingLabelsService.js` / `labelController.js`.
  - Add to the Firestore tree: `farmers/{name}.certificateProfile` and `certificates/{farmer}__{number}` + `versions/{n}`.
  - Note that the backup includes certificates.

- [ ] **Step 2: `docs/api-reference.md`.** Document every endpoint from Tasks 3–4 (method, path, body, response, errors). Remove `/api/shipping/newlabel`.

- [ ] **Step 3: `docs/redesign-plan.md`.**
  - Remove tasks 20 and 4 from the board and the cards.
  - Change task 7's card to: "header lines per farmer delivered by task 20; remaining scope: only if a customer needs a different table layout".
  - Change task 6's card: the farmer doc now holds `certificateProfile`, and the registry builds on it; `SHIPPING_LABELS_ID_*` env vars are gone.

- [ ] **Step 4: `done.md`.** Add a "Task 20 (+4) — Shipping certificates off Google Sheets" entry: what shipped, tests added (counts), and the rollout checklist:
  1. Deploy backend → frontend (no Firestore rules change needed; certificates are backend-only).
  2. Run `cd backend && node scripts/seedCertificateProfiles.js --dry-run`, review, then run it for real against production.
  3. Enter the Avner / Idan / Kopler profiles in Settings → פרטי תעודה.
  4. Print one certificate on the packhouse printer and compare it with the 51219 sample.
  5. Remove the `SHIPPING_LABELS_ID_*` env vars from the Cloud Run service.

- [ ] **Step 5: `.claude/skills/local-dev/SKILL.md`.**
  - Update the test table: certificate core/repo/API files, `frontend npm test` (Vitest unit), `e2e/certificates.spec.js`.
  - The Sheets-guard section now applies only to the admin create/delete-sheet buttons; certificates work fully under the emulators.

- [ ] **Step 6: `NEW_SEASON.md`.** Replace the shipping-label spreadsheet steps with: "Certificates are in the app. At season start, check Settings → פרטי תעודה per farmer (header lines and next number)." Leave the rest of the file for the season-ritual rewrite (separate task).

- [ ] **Step 7: Final verification.**
  1. `cd backend && npm test`: all green; record the count.
  2. `cd frontend && npm test && npm run build && npm run e2e`: all green; record the counts.

- [ ] **Step 8: Commit**

```bash
git add docs/architecture.md docs/api-reference.md docs/redesign-plan.md done.md .claude/skills/local-dev/SKILL.md NEW_SEASON.md
git commit -m "docs(task-20): certificates — architecture, API, board, rollout checklist"
```
