# Farmer Registry (lean) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farmers are added/hidden/restored through atomic admin endpoints over `config/global.farmers`, the backend has no Google Sheets code, and realtime echo suppression is per browser tab.

**Architecture:** A small `services/farmerRegistry.js` mutates the `farmers` array of `centers/{c}/config/global` inside Firestore transactions; `app.js` exposes it as `POST/DELETE/PATCH /api/admin/farmers`. Archived farmers stay in the array with `archived: true`, so backup/export keep their data; `App.vue` filters them out of every menu. A per-tab `clientId` travels as `X-Client-Id`, lands in an `AsyncLocalStorage` request context, and is stamped onto every realtime event as `updatedByClient`.

**Tech Stack:** Express 5, firebase-admin (Firestore transactions), Node `AsyncLocalStorage`, Vue 3, Vitest, supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-farmer-registry-design.md`

## Global Constraints
- Branch `arch-redesign`. Do not push, deploy, or touch `main`. No GitHub CI / Actions / integrations, ever.
- UI text Hebrew (RTL). All dev-facing text (code comments, logs, commit messages, docs) English.
- Tailwind utility classes only; no new scoped CSS.
- Every new backend handler/service method logs with `logger.info` / `logger.error` (`backend/utils/logger.js`).
- Admin endpoints live in `backend/app.js` after the global `/api` chain (which already applies `verifyFirebaseToken` + `ensureCenterAccess`) and add `ensureAdmin`.
- All Firestore writes are Admin-SDK only; no Firestore rules change in this plan.
- Gates: `cd backend && npm test` (emulators; run from `backend/`) and `cd frontend && npm test && npm run build && npm run e2e`. Run suites sequentially, never in parallel.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus
1. Names with surrounding spaces, or a duplicate that differs only by whitespace → trimmed; duplicate active → 409 (Task 1 test).
2. Archiving the farmer currently selected in the sidebar → selection moves to the first active farmer; no blank pages (Task 2 code + e2e).
3. A stale Settings tab saving kinds after a farmer was added elsewhere → the farmer survives (Task 1 test).
4. Hebrew farmer names in the URL path of DELETE/PATCH → decoded correctly (Task 1 tests use Hebrew names).
5. An event without `updatedByClient` (emitted by a script or older backend) or a malformed `X-Client-Id` header → email fallback / header ignored, never a 400 (Task 4 tests).

---

### Task 1: Farmer registry service + admin endpoints + config no longer owns farmers

**Files:**
- Create: `backend/services/farmerRegistry.js`
- Modify: `backend/app.js` (new endpoints after the `PUT /api/admin/farmers/:farmer/certificate-profile` handler; `POST /api/admin/config` handler)
- Create: `backend/tests/farmers.api.test.js`
- Modify: `backend/tests/api.test.js` (the `describe('admin: config', …)` block)
- Modify: `docs/api-reference.md`, `docs/architecture.md` (record the endpoints and the `archived` field)

**Interfaces:**
- Produces: `POST /api/admin/farmers {name}` → 201 `{name, restored:false}` | 200 `{name, restored:true}` | 400/409 `{error}`; `DELETE /api/admin/farmers/:name` → 200 `{name}` | 404; `PATCH /api/admin/farmers/:name {allowGidon}` → 200 `{name, allowGidon}` | 400 | 404. Farmer entry shape `{name, allowGidon, archived?}`. `POST /api/admin/config` ignores `farmers`.

- [ ] **Step 1: Write the failing API tests** — create `backend/tests/farmers.api.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { tokenFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'farmersapi';
const ADMIN = 'farmers-admin@test.local';
const USER = 'farmers-user@test.local';
const KEPT = 'חקלאי-קיים';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const configRef = center.collection('config').doc('global');
const tokens = {};
const api = makeApi(app, tokens);
const enc = encodeURIComponent;
const farmers = async () => (await configRef.get()).data().farmers;

beforeAll(async () => {
  await center.collection('users').doc(ADMIN).set({ role: 'admin' });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.admin = await tokenFor(ADMIN, { centers: [CENTER] });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });
beforeEach(async () => {
  await configRef.set({ kinds: ['קיט'], sizes: ['L'], destinations: ['יעד'], farmers: [{ name: KEPT, allowGidon: false }] });
});

describe('POST /api/admin/farmers', () => {
  it('adds a trimmed farmer (201) and it can take intake at once', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: '  חקלאי-חדש  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: 'חקלאי-חדש', restored: false });
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: false }, { name: 'חקלאי-חדש', allowGidon: false }]);
    const intake = await api('post', '/api/records').send({ farmer: 'חקלאי-חדש', harvestDate: '2026-10-09',
      palletNumber: 1, boxes: 40, kind: 'קיט', size: 'L' });
    expect(intake.status).toBe(201);
  });
  it('409s a duplicate active farmer, including a whitespace-only difference', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: ` ${KEPT} ` });
    expect(res.status).toBe(409);
    expect(await farmers()).toHaveLength(1);
  });
  it('restores an archived farmer with the same name (200)', async () => {
    await configRef.set({ farmers: [{ name: KEPT, allowGidon: true, archived: true }] }, { merge: true });
    const res = await api('post', '/api/admin/farmers').send({ name: KEPT });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: KEPT, restored: true });
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: true }]);
  });
  it.each([[''], ['   '], ['a/b'], ['.'], ['..'], ['__x__'], ['א'.repeat(51)], [42]])('400s an invalid name %j', async (name) => {
    const res = await api('post', '/api/admin/farmers').send({ name });
    expect(res.status).toBe(400);
    expect(await farmers()).toHaveLength(1);
  });
  it('403s a non-admin', async () => {
    expect((await api('post', '/api/admin/farmers', 'user').send({ name: 'x' })).status).toBe(403);
  });
});

describe('DELETE /api/admin/farmers/:name (hide)', () => {
  it('archives the farmer, keeps its records, and the season export still includes it', async () => {
    const recs = center.collection('farmers').doc(KEPT).collection('records');
    await recs.add({ palletNumber: 7, boxes: 1 });
    const res = await api('delete', `/api/admin/farmers/${enc(KEPT)}`);
    expect(res.status).toBe(200);
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: false, archived: true }]);
    expect((await recs.get()).size).toBeGreaterThan(0);
    const exp = await api('get', '/api/admin/export/records');
    expect(Object.keys(exp.body.farmers)).toContain(KEPT);
  });
  it('404s an unknown farmer', async () => {
    expect((await api('delete', `/api/admin/farmers/${enc('אין-כזה')}`)).status).toBe(404);
  });
  it('403s a non-admin', async () => {
    expect((await api('delete', `/api/admin/farmers/${enc(KEPT)}`, 'user')).status).toBe(403);
  });
});

describe('PATCH /api/admin/farmers/:name', () => {
  it('sets allowGidon', async () => {
    const res = await api('patch', `/api/admin/farmers/${enc(KEPT)}`).send({ allowGidon: true });
    expect(res.status).toBe(200);
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: true }]);
  });
  it('400s a non-boolean and 404s an unknown farmer', async () => {
    expect((await api('patch', `/api/admin/farmers/${enc(KEPT)}`).send({ allowGidon: 'yes' })).status).toBe(400);
    expect((await api('patch', `/api/admin/farmers/${enc('אין-כזה')}`).send({ allowGidon: true })).status).toBe(404);
  });
});

describe('POST /api/admin/config no longer owns farmers', () => {
  it('a stale farmers array in the body leaves the stored farmers untouched', async () => {
    await api('post', '/api/admin/farmers').send({ name: 'נוסף-בטאב-אחר' });
    const res = await api('post', '/api/admin/config').send({
      kinds: ['קיט', 'זן-חדש'], sizes: ['L'], destinations: ['יעד'], farmers: [{ name: KEPT, allowGidon: false }],
    });
    expect(res.status).toBe(200);
    const cfg = (await configRef.get()).data();
    expect(cfg.kinds).toEqual(['קיט', 'זן-חדש']);
    expect(cfg.farmers.map(f => f.name)).toEqual([KEPT, 'נוסף-בטאב-אחר']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run (from `backend/`): `npm test -- tests/farmers.api.test.js`
Expected: FAIL — 404s from the missing routes, and the config test fails because `set()` overwrites `farmers`.

- [ ] **Step 3: Create `backend/services/farmerRegistry.js`**

```js
// Farmer registry — the `farmers` array of centers/{c}/config/global ({name, allowGidon, archived?}).
// Every mutation is a Firestore transaction that writes only the `farmers` field, so concurrent
// edits (another admin tab, a config save) are never lost. Archiving hides a farmer from the app;
// their records, audit, certificates and certificateProfile are never touched here.
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const configRef = () => admin.firestore().collection('centers').doc(CENTER_ID).collection('config').doc('global');

class FarmerRegistryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'FarmerRegistryError';
    this.status = status;
  }
}

// Returns { name } (trimmed) or { error } (Hebrew, shown in Settings). The name becomes a Firestore
// doc id (farmers/{name}), so path separators and reserved ids are rejected.
function validateFarmerName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { error: 'נדרש שם חקלאי' };
  if (name.length > 50) return { error: 'שם החקלאי ארוך מדי (עד 50 תווים)' };
  if (name.includes('/') || name === '.' || name === '..' || /^__.*__$/.test(name)) {
    return { error: 'שם החקלאי מכיל תווים לא חוקיים' };
  }
  return { name };
}

async function mutateFarmers(fn) {
  return admin.firestore().runTransaction(async (t) => {
    const snap = await t.get(configRef());
    const farmers = ((snap.exists && snap.data().farmers) || []).map(f => ({ ...f }));
    const result = fn(farmers);
    t.set(configRef(), { farmers }, { merge: true });
    return result;
  });
}

function findOr404(farmers, name) {
  const f = farmers.find(x => x.name === name);
  if (!f) throw new FarmerRegistryError(404, 'חקלאי לא נמצא');
  return f;
}

async function addFarmer(rawName) {
  const { name, error } = validateFarmerName(rawName);
  if (error) throw new FarmerRegistryError(400, error);
  const out = await mutateFarmers((farmers) => {
    const existing = farmers.find(f => f.name === name);
    if (existing && !existing.archived) throw new FarmerRegistryError(409, 'חקלאי כזה כבר קיים');
    if (existing) { delete existing.archived; return { name, restored: true }; }
    farmers.push({ name, allowGidon: false });
    return { name, restored: false };
  });
  logger.info(`[farmerRegistry.addFarmer] ${name} ${out.restored ? 'restored' : 'added'}`);
  return out;
}

async function archiveFarmer(name) {
  await mutateFarmers((farmers) => { findOr404(farmers, name).archived = true; });
  logger.info(`[farmerRegistry.archiveFarmer] ${name} archived`);
  return { name };
}

async function setAllowGidon(name, allowGidon) {
  if (typeof allowGidon !== 'boolean') throw new FarmerRegistryError(400, 'allowGidon חייב להיות true/false');
  await mutateFarmers((farmers) => { findOr404(farmers, name).allowGidon = allowGidon; });
  logger.info(`[farmerRegistry.setAllowGidon] ${name} allowGidon=${allowGidon}`);
  return { name, allowGidon };
}

module.exports = { FarmerRegistryError, validateFarmerName, addFarmer, archiveFarmer, setAllowGidon };
```

- [ ] **Step 4: Add the endpoints to `backend/app.js`** — insert directly after the `app.put("/api/admin/farmers/:farmer/certificate-profile", …)` handler (`sheetController` is already required above it):

```js
// 👨‍🌾 Farmer registry (task 6) — add / hide / restore / gidon flag. Hiding keeps all data.
const farmerRegistry = require('./services/farmerRegistry');

function farmerRegistryHandler(label, run) {
  return async (req, res) => {
    try {
      const { status = 200, body } = await run(req);
      sheetController.invalidateKnownFarmersCache();
      logger.info(`[${label}] ${JSON.stringify(body)} by ${req.user.email}`);
      res.status(status).json(body);
    } catch (err) {
      if (err instanceof farmerRegistry.FarmerRegistryError) return res.status(err.status).json({ error: err.message });
      logger.error(`[${label}] ${err.message}`);
      res.status(500).json({ error: 'Failed to update farmers', details: err.message });
    }
  };
}

app.post('/api/admin/farmers', ensureAdmin, farmerRegistryHandler('POST /api/admin/farmers', async (req) => {
  const body = await farmerRegistry.addFarmer(req.body?.name);
  return { status: body.restored ? 200 : 201, body };
}));

app.delete('/api/admin/farmers/:name', ensureAdmin, farmerRegistryHandler('DELETE /api/admin/farmers',
  async (req) => ({ body: await farmerRegistry.archiveFarmer(req.params.name) })));

app.patch('/api/admin/farmers/:name', ensureAdmin, farmerRegistryHandler('PATCH /api/admin/farmers',
  async (req) => ({ body: await farmerRegistry.setAllowGidon(req.params.name, req.body?.allowGidon) })));
```

Check that `invalidateKnownFarmersCache` is a property of the object exported by `controllers/sheetController.js` (the existing config handler calls `require('./controllers/sheetController').invalidateKnownFarmersCache()`); use the same access path if `sheetController` is the class instance and the function is attached elsewhere.

- [ ] **Step 5: Make `POST /api/admin/config` ignore `farmers`** — in its handler replace `await configDoc().set(req.body);` with:

```js
    // Farmers are owned by /api/admin/farmers (transactional); a stale Settings tab must not revert them.
    const { farmers: _ignored, ...rest } = req.body || {};
    await configDoc().set(rest, { merge: true });
```

- [ ] **Step 6: Update the old config test in `backend/tests/api.test.js`** — replace the body of `it('a farmer added through config can take intake immediately', …)` so it uses the new endpoint:

```js
  it('a farmer added through the farmers endpoint can take intake immediately', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: 'חקלאי-חדש' });
    expect(res.status).toBe(201);

    const intake = await api('post', '/api/records').send(pallet({ farmer: 'חקלאי-חדש' }));
    expect(intake.status).toBe(201);
  });
```

- [ ] **Step 7: Run the backend suite**

Run (from `backend/`): `npm test`
Expected: all pass (previous 118 + the new farmers tests).

- [ ] **Step 8: Docs** — `docs/api-reference.md`: add the three endpoints to the admin table (method, path, one-line behavior as in the Interfaces block) and note that `POST /api/admin/config` ignores `farmers`. `docs/architecture.md`: in the Firestore tree / config section, document the entry shape `{name, allowGidon, archived?}`, that archived farmers are hidden in the UI but kept in backup and season export, and add `services/farmerRegistry.js` to the file map.

- [ ] **Step 9: Commit**

```bash
git add backend/services/farmerRegistry.js backend/app.js backend/tests/farmers.api.test.js backend/tests/api.test.js docs/api-reference.md docs/architecture.md
git commit -m "feat(task-6): transactional farmer registry endpoints; config save no longer owns farmers"
```

---

### Task 2: Settings farmer management + hide archived farmers app-wide

**Files:**
- Modify: `frontend/src/components/Settings.vue` (farmer card template lines ~16–45, delete modal ~180–225, script: `addFarmer`, `confirmDeleteFarmer`, `deleteFarmer`, `saveConfig`, returned bindings)
- Modify: `frontend/src/App.vue` (config `onSnapshot` handler, ~lines 352–371)
- Create: `frontend/e2e/farmers.spec.js`

**Interfaces:**
- Consumes: Task 1 endpoints (`POST /api/admin/farmers`, `DELETE/PATCH /api/admin/farmers/:name`).
- Produces: Settings buttons with accessible names `הסתר <name>` and `שחזר <name>`; a confirm button `הסתר`; a `<details>` whose summary text starts with `חקלאים מוסתרים`.

- [ ] **Step 1: Write the failing e2e** — create `frontend/e2e/farmers.spec.js`:

```js
// Settings: add, hide and restore a farmer. Hidden farmers leave the sidebar farmer selector
// but keep their data (verified by the API tests).
import { test, expect } from '@playwright/test';
import { navTo, signIn } from './helpers.js';

test('settings: add, hide and restore a farmer', async ({ page }) => {
  const name = `חקלאי-${Date.now() % 1000000}`;
  const option = page.locator(`select option[value="${name}"]`);
  await signIn(page);
  await navTo(page, 'ניהול הגדרות');

  await page.getByPlaceholder('שם חקלאי חדש').fill(name);
  await page.getByRole('button', { name: '+ הוסף חקלאי' }).click();
  await expect(option).toHaveCount(1);

  await page.getByRole('button', { name: `הסתר ${name}` }).click();
  await page.getByRole('button', { name: 'הסתר', exact: true }).click();
  await expect(option).toHaveCount(0);

  await page.getByText(/^חקלאים מוסתרים/).click();
  await page.getByRole('button', { name: `שחזר ${name}` }).click();
  await expect(option).toHaveCount(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `npx playwright test e2e/farmers.spec.js`
(`npm run e2e` starts the stack; if the spec needs the stack, run `npm run e2e -- e2e/farmers.spec.js`.)
Expected: FAIL — add calls the removed-by-design create-sheet path (blocked under emulators) and no `הסתר <name>` button exists.

- [ ] **Step 3: `App.vue` — filter archived farmers and keep the selection valid.** In the config `onSnapshot` handler, change:

```js
              const farmersList = cfg.farmers || [];
```
to
```js
              // Archived (hidden) farmers keep their data but leave every menu; Settings reads the raw list.
              const farmersList = (cfg.farmers || []).filter(f => !f.archived);
```
and replace
```js
              if (!selectedFarmer.value && farmers.value.length > 0) {
                selectedFarmer.value = farmers.value[0];
              }
```
with
```js
              // Also covers the selected farmer being hidden from another tab.
              if (!farmers.value.includes(selectedFarmer.value)) {
                selectedFarmer.value = farmers.value[0] || '';
              }
```

- [ ] **Step 4: `Settings.vue` script.** Add `computed` to the `vue` import if missing. Replace `confirmChecks` and the farmer functions:

```js
    const activeFarmers = computed(() => localConfig.farmers.filter(f => !f.archived));
    const archivedFarmers = computed(() => localConfig.farmers.filter(f => f.archived));
    const farmerUrl = (name) => `${baseUrl}/api/admin/farmers/${encodeURIComponent(name)}`;

    // The live config snapshot refreshes localConfig.farmers after each call.
    const addFarmer = async (rawName = newFarmerName.value) => {
      const name = String(rawName).trim();
      if (!name) return;
      isWorking.value = true;
      try {
        const res = await axios.post(`${baseUrl}/api/admin/farmers`, { name });
        if (rawName === newFarmerName.value) newFarmerName.value = '';
        showStatus(res.data.restored ? `החקלאי ${name} שוחזר` : `החקלאי ${name} נוסף בהצלחה`, 'success');
      } catch (err) {
        showStatus(`שגיאה בהוספת חקלאי: ${err.response?.data?.error || err.message}`, 'error');
      } finally {
        isWorking.value = false;
      }
    };
    const restoreFarmer = (name) => addFarmer(name);

    const setGidon = async (farmer) => {
      try {
        await axios.patch(farmerUrl(farmer.name), { allowGidon: farmer.allowGidon });
      } catch (err) {
        farmer.allowGidon = !farmer.allowGidon;
        showStatus(`שגיאה בעדכון: ${err.response?.data?.error || err.message}`, 'error');
      }
    };

    const confirmDeleteFarmer = (name) => { farmerToDelete.value = name; };

    const deleteFarmer = async () => {
      const name = farmerToDelete.value;
      isWorking.value = true;
      try {
        await axios.delete(farmerUrl(name));
        farmerToDelete.value = null;
        showStatus(`החקלאי ${name} הוסתר`, 'success');
      } catch (err) {
        showStatus(`שגיאה בהסתרת חקלאי: ${err.response?.data?.error || err.message}`, 'error');
      } finally {
        isWorking.value = false;
      }
    };
```

In `saveConfig`, stop sending farmers:

```js
        const { farmers: _farmers, ...rest } = JSON.parse(JSON.stringify(localConfig));
        await axios.post(`${baseUrl}/api/admin/config`, rest);
```

Return bindings: remove `confirmChecks`; add `activeFarmers, archivedFarmers, restoreFarmer, setGidon`. Delete the `const confirmChecks = reactive(...)` line. The `addFarmer` template binding `@click="addFarmer"` must become `@click="addFarmer()"` (otherwise the click event is passed as `rawName`).

- [ ] **Step 5: `Settings.vue` template — farmer card.** Change `v-for="farmer in localConfig.farmers"` to `v-for="farmer in activeFarmers"`; the gidon checkbox `@change="saveConfig"` → `@change="setGidon(farmer)"`; the 🗑️ button `aria-label="מחק חקלאי"` → `:aria-label="`הסתר ${farmer.name}`"` and `title="הסתר חקלאי"`. On the add `SpinnerButton`: `@click="addFarmer()"`, `loading-label="מוסיף..."`. After the add-farmer `<div>` (still inside the farmers `<section>`), add:

```html
      <details v-if="archivedFarmers.length" class="pt-3 border-t border-slate-100">
        <summary class="cursor-pointer text-sm text-slate-500 select-none">חקלאים מוסתרים ({{ archivedFarmers.length }})</summary>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <div v-for="farmer in archivedFarmers" :key="farmer.name"
               class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
            <span class="text-sm text-slate-500 truncate">{{ farmer.name }}</span>
            <button class="btn-ghost border border-slate-200 text-xs px-3 min-h-[40px]" :disabled="isWorking"
                    :aria-label="`שחזר ${farmer.name}`" @click="restoreFarmer(farmer.name)">שחזר</button>
          </div>
        </div>
      </details>
```

- [ ] **Step 6: `Settings.vue` template — delete modal becomes a hide confirmation.** Replace the red header text `אזהרה חמורה!` with `הסתרת חקלאי`, `מחיקת החקלאי:` with `הסתרת החקלאי:`, and replace the whole `<div class="space-y-3 mb-6">…</div>` (both checkboxes) with:

```html
          <p class="text-sm text-slate-600 mb-6">
            החקלאי יוסתר מכל הרשימות באפליקציה. כל הנתונים שלו (משטחים, תעודות, היסטוריה) נשמרים,
            וניתן לשחזר אותו מ"חקלאים מוסתרים".
          </p>
```

The confirm `SpinnerButton`: remove `:disabled="!confirmChecks.app"`, set `loading-label="מסתיר..."`, text `הסתר`.

- [ ] **Step 7: Run the e2e + build**

Run (from `frontend/`): `npm run build` then `npm run e2e`
Expected: build OK; all e2e pass, including `farmers.spec.js` on desktop and tablet.

- [ ] **Step 8: Visual check** — take a screenshot of Settings (desktop 1600×900 and tablet 1280×800) with one archived farmer and the hide dialog open; RTL alignment and tap targets (≥40px) must look consistent with the rest of the card. Save to the scratchpad, not the repo.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Settings.vue frontend/src/App.vue frontend/e2e/farmers.spec.js
git commit -m "feat(task-6): Settings add/hide/restore farmers via the registry; hidden farmers leave every menu"
```

---

### Task 3: Remove Google Sheets from the backend

**Files:**
- Delete: `backend/services/googleSheetsService.js`, `backend/utils/sheetsGuard.js`
- Modify: `backend/app.js` (delete the `// 🛠️ Admin Sheet Management` block: `create-sheet`, `delete-sheet`, `refresh-cache` handlers)
- Modify: `backend/server.js` (drop the `sheetsGuard` require and the cache warm)
- Modify: `backend/tests/api.test.js` (delete the `describe('Google Sheets is unreachable from the emulator stack', …)` block)
- Modify: `backend/services/backupService.js` (comment on line ~9 that mentions `googleSheetsService.js`)
- Modify: `backend/scripts/seedCertificateProfiles.js` (header comment only)
- Modify: `CLAUDE.md`, `docs/architecture.md`, `docs/api-reference.md`, `.claude/skills/local-dev/SKILL.md`, `README.md`, `docs/redesign-plan.md`

- [ ] **Step 1: Write the failing test** — append to `backend/tests/api.test.js`:

```js
describe('Google Sheets is gone', () => {
  it.each(['create-sheet', 'delete-sheet', 'refresh-cache'])('POST /api/admin/%s no longer exists', async (path) => {
    const res = await api('post', `/api/admin/${path}`).send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
```

and delete the old `describe('Google Sheets is unreachable from the emulator stack', …)` block.

- [ ] **Step 2: Run to verify it fails** — from `backend/`: `npm test -- tests/api.test.js`. Expected: FAIL (the endpoints answer 500/200, not 404).

- [ ] **Step 3: Delete the code.**
  - `git rm backend/services/googleSheetsService.js backend/utils/sheetsGuard.js`
  - `backend/app.js`: delete from the `// 🛠️ Admin Sheet Management` comment through the end of the `app.post("/api/admin/refresh-cache", …)` handler.
  - `backend/server.js`: delete `const { isEmulatorMode } = require("./utils/sheetsGuard");`, and make the listen block just:

```js
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```
  - `backend/services/backupService.js`: reword the comment that says the key path "mirrors how googleSheetsService.js resolves it" to "the service-account key file in services/ (same one app.js uses)".
  - `backend/scripts/seedCertificateProfiles.js`: add at the top: `// One-off pre-season script (task 20): reads the old per-farmer label sheets once. It is the last user of \`googleapis\` — delete it and drop \`googleapis\` from package.json after production seeding.`
  - Do not edit `backend/.env` (owner's local file).

- [ ] **Step 4: Verify nothing still references the deleted code**

Run (repo root): `git grep -n "googleSheetsService\|sheetsGuard\|isEmulatorMode\|assertRealSheetsAllowed\|create-sheet\|delete-sheet\|refresh-cache" -- backend frontend/src`
Expected: no output except the new 404 test in `backend/tests/api.test.js`.

- [ ] **Step 5: Run the backend suite** — from `backend/`: `npm test`. Expected: all pass.

- [ ] **Step 6: Docs.**
  - `CLAUDE.md`: delete the `| Legacy DB | Google Sheets API — … |` table row; in Core Invariants change "Sheets is a cold archive plus live shipping-label provisioning." to "Sheets is only a cold archive of past seasons; the backend has no Sheets code." and delete the sentence "The caches that remain in `googleSheetsService.js` serve only legacy Sheets paths."; delete the Known Issues bullet "**Google Sheets is not fully removed.** …"; in Rules §1 change "never on `googleSheetsService` directly" to "never on a storage SDK directly".
  - `docs/architecture.md`: remove `googleSheetsService.js` / `sheetsGuard.js` entries and the `SPREADSHEET_ID` env row; state the backend has no Google Sheets dependency except the one-off `seedCertificateProfiles.js`.
  - `docs/api-reference.md`: remove the create-sheet / delete-sheet / refresh-cache rows.
  - `.claude/skills/local-dev/SKILL.md`: remove the sheetsGuard / `ALLOW_REAL_SHEETS` paragraph and the stale "Shipping-label creation still calls the real Google Sheets API" bullet.
  - `README.md`: drop `SPREADSHEET_ID` from the `.env` line.
  - `docs/redesign-plan.md`: in "Pre-season ops" add "remove `SPREADSHEET_ID` from Cloud Run; after seeding, delete `scripts/seedCertificateProfiles.js` and the `googleapis` dependency".

- [ ] **Step 7: Commit**

```bash
git add -A backend CLAUDE.md docs/architecture.md docs/api-reference.md .claude/skills/local-dev/SKILL.md README.md docs/redesign-plan.md
git commit -m "refactor(task-6): remove Google Sheets from the backend (service, guard, admin sheet endpoints, startup warm)"
```

---

### Task 4: Per-tab realtime client id

**Files:**
- Create: `backend/utils/requestContext.js`
- Modify: `backend/app.js` (register the middleware right after `app.use(express.json());`)
- Modify: `backend/services/firestoreEventService.js` (`emit`)
- Create: `frontend/src/utils/clientId.js`, `frontend/src/utils/echo.js`, `frontend/tests/echo.test.js`
- Modify: `frontend/src/utils/auth.js` (add `authHeaders`), `frontend/src/main.js` (axios interceptor), `frontend/src/composables/useFarmerEvents.js` (`applyEvent`)
- Modify (raw fetch call sites): `frontend/src/api/certificates.js`, `components/Dashboard.vue`, `Destination.vue`, `DestinationsSummary.vue`, `PalletInput.vue`, `PalletTable.vue`, `SentPallets.vue`, `sentPalletsForMark.vue`, `Weight.vue`
- Modify: `backend/tests/api.test.js`, `frontend/e2e/realtime.spec.js`, `docs/realtime.md`, `docs/redesign-plan.md` (remove the echo-suppression blocker)

**Interfaces:**
- Produces: backend `currentClientId(): string|null`; events carry `updatedByClient` when the request had a valid `X-Client-Id`. Frontend `clientId: string`, `authHeaders(): Promise<{Authorization, 'X-Client-Id'}>`, `isOwnEcho(event, {clientId, email}): boolean`.

- [ ] **Step 1: Write the failing backend test** — append to `backend/tests/api.test.js` (reuses its `api`, `pallet`, `center`, `FARMER`, `waitFor`):

```js
describe('realtime events carry the sending tab id', () => {
  it('stamps updatedByClient from a valid X-Client-Id header', async () => {
    const res = await api('post', '/api/records').set('X-Client-Id', 'tab-123e4567').send(pallet({ palletNumber: 9101 }));
    expect(res.status).toBe(201);
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.pallet?.palletNumber == 9101 ? d : null;
    });
    expect(evt.updatedByClient).toBe('tab-123e4567');
  });
  it('ignores a malformed header instead of failing the request', async () => {
    const res = await api('post', '/api/records').set('X-Client-Id', 'x'.repeat(65)).send(pallet({ palletNumber: 9102 }));
    expect(res.status).toBe(201);
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.pallet?.palletNumber == 9102 ? d : null;
    });
    expect(evt.updatedByClient).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the failing frontend unit test** — create `frontend/tests/echo.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isOwnEcho } from '../src/utils/echo.js';

const me = { clientId: 'tab-a', email: 'a@x' };

describe('isOwnEcho', () => {
  it('skips only events from this tab', () => {
    expect(isOwnEcho({ updatedByClient: 'tab-a', updatedBy: 'a@x' }, me)).toBe(true);
    expect(isOwnEcho({ updatedByClient: 'tab-b', updatedBy: 'a@x' }, me)).toBe(false); // same account, other device
  });
  it('falls back to the email when the event has no client id', () => {
    expect(isOwnEcho({ updatedBy: 'a@x' }, me)).toBe(true);
    expect(isOwnEcho({ updatedBy: 'b@x' }, me)).toBe(false);
  });
  it('never skips when nothing identifies the sender', () => {
    expect(isOwnEcho({}, { clientId: 'tab-a', email: '' })).toBe(false);
  });
});
```

- [ ] **Step 3: Run both to verify they fail** — `cd backend && npm test -- tests/api.test.js` (FAIL: `updatedByClient` undefined); `cd frontend && npm test` (FAIL: cannot resolve `../src/utils/echo.js`).

- [ ] **Step 4: Backend implementation.** Create `backend/utils/requestContext.js`:

```js
// Per-request context (AsyncLocalStorage) so deep code — the realtime event emitter — can read the
// sending browser tab's id without threading it through every service signature.
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();
const CLIENT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function requestContext(req, res, next) {
  const raw = req.get('X-Client-Id');
  const clientId = raw && CLIENT_ID_RE.test(raw) ? raw : null; // malformed → ignored, never a 400
  als.run({ clientId }, next);
}

const currentClientId = () => als.getStore()?.clientId ?? null;

module.exports = { requestContext, currentClientId };
```

In `backend/app.js`, after `app.use(express.json());` add:

```js
app.use(require('./utils/requestContext').requestContext);
```

In `backend/services/firestoreEventService.js`, add `const { currentClientId } = require('../utils/requestContext')` and change `emit` to:

```js
function emit(farmer, payload) {
  const clientId = currentClientId()
  eventDoc(farmer).set({
    ...payload,
    ...(clientId ? { updatedByClient: clientId } : {}),
    farmer,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(err =>
    logger.error(`[firestoreEventService] emit failed for "${farmer}": ${err.message}`)
  )
}
```

- [ ] **Step 5: Frontend implementation.** Create `frontend/src/utils/clientId.js` (no imports, so `main.js` and `auth.js` can both use it without a cycle):

```js
// One id per browser tab (memory only). Sent as X-Client-Id and echoed back on realtime events,
// so a tab ignores its own writes but still sees the same account's writes from another device.
const fallback = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const clientId = globalThis.crypto?.randomUUID?.() ?? fallback();
```

Create `frontend/src/utils/echo.js`:

```js
// True when a realtime event was caused by this very tab (it already applied the change locally).
// Events from older backends / scripts have no client id: fall back to comparing the user email.
export function isOwnEcho(event, { clientId, email }) {
  if (event.updatedByClient) return event.updatedByClient === clientId;
  return Boolean(email) && event.updatedBy === email;
}
```

`frontend/src/utils/auth.js` — add:

```js
import { clientId } from "./clientId";

// Headers for raw fetch() calls: auth token + this tab's realtime client id.
export async function authHeaders() {
  return { Authorization: `Bearer ${await getToken()}`, 'X-Client-Id': clientId };
}
```

`frontend/src/main.js` — import `clientId` from `./utils/clientId` and in the axios interceptor add `config.headers['X-Client-Id'] = clientId;` (unconditionally, before `return config`).

`frontend/src/composables/useFarmerEvents.js` — import `isOwnEcho` from `../utils/echo` and `clientId` from `../utils/clientId`; replace the first statement of `applyEvent`:

```js
    if (isOwnEcho(event, { clientId, email: options.currentUserEmail?.value })) return
```

Update the options comment: `currentUserEmail` is now only the fallback for events without `updatedByClient`.

- [ ] **Step 6: Switch every raw fetch to `authHeaders()`.** In each listed call-site file, replace every occurrence of

```
Authorization: `Bearer ${await getToken()}`
```
with
```
...(await authHeaders())
```
(it sits inside a `headers: { … }` object in every case, sometimes next to `'Content-Type'`). Change the file's `import { getToken } from …utils/auth…` to import `authHeaders` (keep `getToken` only if the file still uses it elsewhere). Then verify:

Run (repo root): `git grep -n "Bearer \${await getToken()}" -- frontend/src`
Expected: only `frontend/src/utils/auth.js`.

- [ ] **Step 7: Same-account realtime e2e** — append to `frontend/e2e/realtime.spec.js` (also import `ADMIN_EMAIL` from `./helpers.js`):

```js
test('the same account on two devices sees its own changes live', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  await signIn(a, ADMIN_EMAIL);
  await signIn(b, ADMIN_EMAIL);
  await intakePallet(a, pallet);
  await navTo(a, 'טבלת נתונים');
  await navTo(b, 'טבלת נתונים');
  await expect(rowByPallet(b, pallet)).toHaveCount(1);

  const editor = await editRow(a, pallet);
  await editor.locator('td[data-col="weight"] input').fill('613');
  await editor.getByRole('button', { name: 'שמור' }).click();

  await expect(rowByPallet(b, pallet).locator('td[data-col="weight"]')).toHaveText('613');
});
```

- [ ] **Step 8: Run all gates** — `cd backend && npm test`; then `cd frontend && npm test && npm run build && npm run e2e`. Expected: all pass.

- [ ] **Step 9: Docs** — `docs/realtime.md`: describe `X-Client-Id` → `updatedByClient`, `isOwnEcho`, and the email fallback. `docs/redesign-plan.md`: delete the "Realtime echo suppression is keyed on email" blocker line and the "Fold in: realtime echo suppression…" clause of the task-6 next-up item.

- [ ] **Step 10: Commit**

```bash
git add -A backend frontend docs/realtime.md docs/redesign-plan.md
git commit -m "feat(task-6): per-tab realtime client id; same account on two devices sees live updates"
```
