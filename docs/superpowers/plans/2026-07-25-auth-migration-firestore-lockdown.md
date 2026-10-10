# Firebase Auth Migration + Firestore Rules Lockdown (Task 23) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Passport/express-session with Firebase Auth ID tokens so Firestore rules gain a real `request.auth`, then lock the two client-side reads (config, farmer_events) to authenticated users of the correct center.

**Architecture:** Frontend signs in with Firebase Auth (Google provider), sends the ID token as a Bearer header via a global axios interceptor. Backend verifies the token with the Admin SDK and keeps reading `role` live from Firestore. A minimal custom claim (`centers: [...]`) is stamped per user so Firestore rules can enforce center-match. The active center is resolved from the `CENTER_ID` env (prod=`tsuberi`, dev/emulator=`test`).

**Tech Stack:** Node/Express 5, firebase-admin, Vue 3 + vue-router 4, firebase JS SDK (`firebase/auth`), Vitest + Firebase emulators, `@firebase/rules-unit-testing`.

## Global Constraints

- Dev-facing content (code, comments, commits, logs) in **English**; app UI stays **Hebrew/RTL**.
- The custom claim is **minimal**: `{ centers: string[] }` only. Backend authorization reads `role` **live from Firestore** — never from the claim.
- Active center comes from `CENTER_ID` (`backend/config/center.js`); it is a constant per deployment, **not** subdomain-resolved (deferred).
- Firestore writes stay **Admin-SDK-only**; client rules grant **read only**, and only for `config` + `farmer_events`.
- Records/authorization source of truth is Firestore `centers/{c}/users/{email}` — **not** `users.json` (seed-only).
- Follow existing patterns: `logger.info`/`logger.error` in every new backend method; existing test harness is `npm test` (backend) = `firebase emulators:exec --only firestore --project demo-tsuber "vitest run"`.
- Reference spec: `docs/superpowers/specs/2026-07-25-auth-migration-firestore-lockdown-design.md`.

---

## File Structure

**Backend**
- `backend/middleware/auth.js` — **new** — `verifyFirebaseToken`, `ensureCenterAccess`, `ensureAdmin`, `syncUserClaims`.
- `backend/server.js` — **modify** — remove passport/session/OAuth/dev-bypass; new `/api/auth/me` + `/api/auth/logout`; guard-chain swap; CORS `credentials:false`; claim sync on admin user endpoints.
- `backend/scripts/backfillAuthClaims.js` — **new** — one-time claim backfill.
- `backend/scripts/seedTestCenter.js` — **new** — seed the `centers/test` tree.
- `backend/tests/auth.middleware.test.js` — **new** — middleware + claims unit tests.
- `backend/tests/firestore.rules.test.js` — **new** — rules-unit-testing coverage.
- `backend/package.json` — **modify** — drop passport/express-session/firestore-store; add `@firebase/rules-unit-testing`.

**Frontend**
- `frontend/src/main.js` — **modify** — axios Bearer interceptor; drop `withCredentials`; init `getAuth`; emulator wiring.
- `frontend/src/utils/auth.js` — **new** — `getToken()` helper (used by non-axios `fetch` calls).
- `frontend/src/components/Login.vue` — **modify** — `signInWithPopup` rewrite; drop dev-login.
- `frontend/src/router.js` — **modify** — guard via Firebase auth state.
- `frontend/src/App.vue` — **modify** — `onAuthStateChanged`, logout revoke + `signOut`, `/api/auth/me` via axios.
- `frontend/firestore.rules` — **modify** — auth + center-match reads; drop legacy top-level matches.

**Docs**
- `CLAUDE.md`, `done.md`, `docs/redesign-plan.md`, `.superpowers/sdd/progress.md` — **modify** — reflect the new auth model + mark task 23.

---

### Task 1: Backend auth middleware + claim sync

**Files:**
- Create: `backend/middleware/auth.js`
- Test: `backend/tests/auth.middleware.test.js`

**Interfaces:**
- Consumes: `firebase-admin` (`admin.auth()`, `admin.firestore()`), `backend/config/center.js` (`CENTER_ID`), `backend/utils/logger.js`.
- Produces:
  - `verifyFirebaseToken(req, res, next)` → sets `req.user = { email, uid, centers: string[] }`; 401 on missing/invalid token.
  - `ensureCenterAccess(req, res, next)` → 403 unless `CENTER_ID ∈ req.user.centers`.
  - `ensureAdmin(req, res, next)` → live Firestore role read; sets `req.user.role='admin'`; 403 otherwise.
  - `syncUserClaims(email) → Promise<boolean>` (true if the `centers` claim changed).

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/auth.middleware.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import admin from 'firebase-admin';

// CENTER_ID is read at module load from env; pin it before importing the SUT.
process.env.CENTER_ID = 'tsuberi';
const { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims } =
  await import('../middleware/auth.js');

let db;
beforeAll(() => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
  db = admin.firestore();
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

// Minimal Express res double.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(async () => {
  const snap = await db.collection('centers').doc('tsuberi').collection('users').get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
  vi.restoreAllMocks();
});

describe('verifyFirebaseToken', () => {
  it('401s when no Authorization header is present', async () => {
    const req = { headers: {} }; const res = mockRes(); let nexted = false;
    await verifyFirebaseToken(req, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('sets req.user from a verified token', async () => {
    vi.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ email: 'a@b.com', uid: 'u1', centers: ['tsuberi'] }),
    });
    const req = { headers: { authorization: 'Bearer good' } }; const res = mockRes(); let nexted = false;
    await verifyFirebaseToken(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.user).toEqual({ email: 'a@b.com', uid: 'u1', centers: ['tsuberi'] });
  });

  it('401s when verifyIdToken throws', async () => {
    vi.spyOn(admin, 'auth').mockReturnValue({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('bad token')),
    });
    const req = { headers: { authorization: 'Bearer bad' } }; const res = mockRes(); let nexted = false;
    await verifyFirebaseToken(req, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('ensureCenterAccess', () => {
  it('nexts when CENTER_ID is in the token centers', () => {
    const req = { user: { centers: ['tsuberi', 'test'] } }; const res = mockRes(); let nexted = false;
    ensureCenterAccess(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
  });
  it('403s when CENTER_ID is absent', () => {
    const req = { user: { email: 'x@y.com', centers: ['test'] } }; const res = mockRes(); let nexted = false;
    ensureCenterAccess(req, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('ensureAdmin (live Firestore read)', () => {
  it('nexts for an admin user doc', async () => {
    await db.collection('centers').doc('tsuberi').collection('users').doc('a@b.com').set({ role: 'admin' });
    const req = { user: { email: 'a@b.com' } }; const res = mockRes(); let nexted = false;
    await ensureAdmin(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.user.role).toBe('admin');
  });
  it('403s for a non-admin user doc', async () => {
    await db.collection('centers').doc('tsuberi').collection('users').doc('u@b.com').set({ role: 'user' });
    const req = { user: { email: 'u@b.com' } }; const res = mockRes(); let nexted = false;
    await ensureAdmin(req, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('syncUserClaims', () => {
  it('sets centers claim to every center whose users/{email} doc exists', async () => {
    await db.collection('centers').doc('tsuberi').collection('users').doc('a@b.com').set({ role: 'admin' });
    await db.collection('centers').doc('test').collection('users').doc('a@b.com').set({ role: 'admin' });
    const setClaims = vi.fn().mockResolvedValue();
    vi.spyOn(admin, 'auth').mockReturnValue({
      getUserByEmail: vi.fn().mockResolvedValue({ uid: 'u1', customClaims: {} }),
      setCustomUserClaims: setClaims,
    });
    const changed = await syncUserClaims('a@b.com');
    expect(changed).toBe(true);
    const centersArg = setClaims.mock.calls[0][1].centers.sort();
    expect(centersArg).toEqual(['test', 'tsuberi']);
  });

  it('returns false and does not rewrite when the claim already matches', async () => {
    await db.collection('centers').doc('tsuberi').collection('users').doc('a@b.com').set({ role: 'admin' });
    const setClaims = vi.fn().mockResolvedValue();
    vi.spyOn(admin, 'auth').mockReturnValue({
      getUserByEmail: vi.fn().mockResolvedValue({ uid: 'u1', customClaims: { centers: ['tsuberi'] } }),
      setCustomUserClaims: setClaims,
    });
    const changed = await syncUserClaims('a@b.com');
    expect(changed).toBe(false);
    expect(setClaims).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth.middleware`
Expected: FAIL — `Cannot find module '../middleware/auth.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/middleware/auth.js
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const db = () => admin.firestore();

// Verify the Firebase ID token carried in `Authorization: Bearer <token>`.
async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      email: decoded.email,
      uid: decoded.uid,
      centers: Array.isArray(decoded.centers) ? decoded.centers : [],
    };
    next();
  } catch (err) {
    logger.error('[verifyFirebaseToken] verification failed:', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Reject unless the active center is one the user is allowed into (claim-based).
function ensureCenterAccess(req, res, next) {
  if (req.user && Array.isArray(req.user.centers) && req.user.centers.includes(CENTER_ID)) {
    return next();
  }
  logger.error(`[ensureCenterAccess] ${req.user?.email} denied for center ${CENTER_ID}`);
  res.status(403).json({ message: 'Forbidden' });
}

// Require admin — read live from Firestore so role changes take effect immediately.
async function ensureAdmin(req, res, next) {
  try {
    const snap = await db().collection('centers').doc(CENTER_ID)
      .collection('users').doc(req.user.email).get();
    if (snap.exists && snap.data().role === 'admin') {
      req.user.role = 'admin';
      return next();
    }
    res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    logger.error('[ensureAdmin] role lookup failed:', err.message);
    res.status(500).json({ message: 'Role check failed' });
  }
}

// Compute the set of centers a user belongs to and stamp it as a custom claim.
// Returns true when the claim actually changed.
async function syncUserClaims(email) {
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err) {
    logger.error(`[syncUserClaims] no auth user for ${email}: ${err.message}`);
    return false;
  }
  const centersSnap = await db().collection('centers').get();
  const allowed = [];
  for (const centerDoc of centersSnap.docs) {
    const userSnap = await centerDoc.ref.collection('users').doc(email).get();
    if (userSnap.exists) allowed.push(centerDoc.id);
  }
  const current = userRecord.customClaims?.centers || [];
  const changed = current.length !== allowed.length || !allowed.every(c => current.includes(c));
  if (changed) {
    await admin.auth().setCustomUserClaims(userRecord.uid, { centers: allowed });
    logger.info(`[syncUserClaims] ${email} centers -> [${allowed.join(', ')}]`);
  }
  return changed;
}

module.exports = { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- auth.middleware`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/auth.js backend/tests/auth.middleware.test.js
git commit -m "feat(task-23): Firebase Auth middleware + minimal centers-claim sync"
```

---

### Task 2: Rewire server.js to Firebase Auth

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/package.json` (remove `passport`, `passport-google-oauth20`, `express-session`, `firestore-store`)

**Interfaces:**
- Consumes: `verifyFirebaseToken`, `ensureCenterAccess`, `ensureAdmin`, `syncUserClaims` from Task 1.
- Produces: `GET /api/auth/me` → `{ email, role, centerId, refreshToken? }`; `POST /api/auth/logout` → `{ success:true }`; all `/api/*` guarded by `verifyFirebaseToken, ensureCenterAccess`; admin routes add `ensureAdmin`.

- [ ] **Step 1: Remove passport/session imports and wiring**

In `backend/server.js`:
- Delete lines 3–4 (`const passport = require("passport");` and the `GoogleStrategy` require).
- Delete the session block (lines ~62–84): `const session = require("express-session");`, `FirestoreStore`, `firestoreSessionParser`, and the `app.use(session({...}))` call.
- Delete `app.use(passport.initialize());` and `app.use(passport.session());` (lines ~86–87).
- Delete `serializeUser`/`deserializeUser` and `passport.use(new GoogleStrategy(...))` (lines ~89–121).
- Delete the old `ensureAuthenticated` and `ensureAdmin` definitions (lines ~124–137).
- Delete `GET /api/auth/google` + `GET /api/auth/google/callback` (lines ~140–155).
- Delete the entire `DEV_BYPASS_AUTH` dev-login block (lines ~158–171).
- Delete `GET /api/auth/unauthorized` (lines ~173–181) — rejection is handled client-side now.
- Keep `seedUsersIfEmpty()`, `const USERS = require("./users.json")` (still used by seeding), and the Firebase Admin init.

- [ ] **Step 2: Add the new middleware import + CORS change**

Near the top imports of `server.js` add:

```js
const { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims } = require('./middleware/auth');
```

Change the CORS block (lines ~52–57) to:

```js
app.use(
  cors({
    origin: process.env.FRONT_CORS.split(","),
    credentials: false, // Bearer tokens, not cookies
  })
);
```

- [ ] **Step 3: Add new auth endpoints**

Replace the old `GET /api/auth/logout` and `GET /api/auth/me` with:

```js
// Current user — role read live from Firestore; keeps claims in sync.
app.get("/api/auth/me", verifyFirebaseToken, async (req, res) => {
  try {
    const snap = await usersCol().doc(req.user.email).get();
    if (!snap.exists) return res.status(403).json({ message: "User not authorized" });
    const changed = await syncUserClaims(req.user.email);
    res.json({ email: req.user.email, role: snap.data().role, centerId: CENTER_ID, refreshToken: changed });
  } catch (err) {
    logger.error("[/api/auth/me] failed:", err.message);
    res.status(500).json({ message: "Failed to load user" });
  }
});

// Logout — revoke refresh tokens so the session cannot be silently resumed.
app.post("/api/auth/logout", verifyFirebaseToken, async (req, res) => {
  try {
    await admin.auth().revokeRefreshTokens(req.user.uid);
    res.json({ success: true });
  } catch (err) {
    logger.error("[/api/auth/logout] revoke failed:", err.message);
    res.json({ success: true }); // client signs out regardless
  }
});
```

- [ ] **Step 4: Swap the guard chains**

Replace the `app.use("/api", ensureAuthenticated, ...)` block (lines ~240–248) with:

```js
app.use(
  "/api",
  verifyFirebaseToken,
  ensureCenterAccess,
  (req, res, next) => { logger.info(`API ${req.method} ${req.url}`); next(); },
  sheetRoutes
);
```

The admin endpoints (`create-sheet`, `delete-sheet`, `refresh-cache`, `config`, `backup`, `backups`, `users`) currently use `ensureAdmin` as their only guard. Because they are declared **after** the `app.use("/api", verifyFirebaseToken, ensureCenterAccess, ...)` line they already pass through `verifyFirebaseToken` + `ensureCenterAccess`; keep `ensureAdmin` on each as-is (now the Task 1 async version — verify each still reads `ensureAdmin` from the new import, not a local).

> Note: `/api/internal/backup` (OIDC) stays exactly as-is and remains declared **before** the guarded `app.use("/api", ...)`.

- [ ] **Step 5: Sync claims when admin edits users**

In `POST /api/admin/users` (after the user doc is written) and `DELETE /api/admin/users/:email` (after deletion), add:

```js
    await syncUserClaims(email).catch(err => logger.error('[admin/users] claim sync failed:', err.message));
```

(Use the `:email` param for the DELETE route.)

- [ ] **Step 6: Remove dead dependencies**

```bash
cd backend && npm uninstall passport passport-google-oauth20 express-session firestore-store
```

- [ ] **Step 7: Verify the server boots and rejects unauthenticated calls**

Run (backend, against the firestore emulator so admin init has a target):

```bash
cd backend && firebase emulators:exec --only firestore --project demo-tsuber \
  "node -e \"process.env.FIRESTORE_EMULATOR_HOST='localhost:8080'; require('./server.js'); setTimeout(()=>process.exit(0),1500)\""
```

Expected: process prints "Firebase Admin Initialized…" and exits 0 with no `passport`/`session` reference errors.

Then, with the server running (`npm run dev`) in one shell:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/farmers/x/records
```

Expected: `401`.

- [ ] **Step 8: Commit**

```bash
git add backend/server.js backend/package.json backend/package-lock.json
git commit -m "feat(task-23): swap Express server auth to Firebase ID tokens"
```

---

### Task 3: Backfill + test-center seed scripts

**Files:**
- Create: `backend/scripts/backfillAuthClaims.js`
- Create: `backend/scripts/seedTestCenter.js`

**Interfaces:**
- Consumes: `syncUserClaims` (Task 1), Firebase Admin init pattern from `seedCenterNamespace.js`.
- Produces: two runnable node scripts (idempotent).

- [ ] **Step 1: Write the backfill script**

```js
// backend/scripts/backfillAuthClaims.js
// One-time, idempotent: ensure every Firestore user has a correct `centers` claim.
// Run: node scripts/backfillAuthClaims.js   (uses the same service account as the server)
const admin = require('firebase-admin');
const path = require('path');
const logger = require('../utils/logger');

if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const { syncUserClaims } = require('../middleware/auth');
const db = admin.firestore();

(async () => {
  const centersSnap = await db.collection('centers').get();
  const emails = new Set();
  for (const c of centersSnap.docs) {
    const users = await c.ref.collection('users').get();
    users.docs.forEach(u => emails.add(u.id));
  }
  logger.info(`[backfill] ${emails.size} distinct users across ${centersSnap.size} centers`);
  for (const email of emails) {
    try { await syncUserClaims(email); }
    catch (err) { logger.error(`[backfill] ${email} failed: ${err.message}`); }
  }
  logger.info('[backfill] done');
  process.exit(0);
})();
```

- [ ] **Step 2: Write the test-center seed script**

```js
// backend/scripts/seedTestCenter.js
// Idempotent: stand up centers/test with a small config + fake farmer/records,
// and add the developer as an admin user of the test center.
// Run: node scripts/seedTestCenter.js your-email@gmail.com
const admin = require('firebase-admin');
const path = require('path');
const logger = require('../utils/logger');

if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const CENTER = 'test';

(async () => {
  const email = process.argv[2];
  if (!email) { logger.error('usage: node scripts/seedTestCenter.js <admin-email>'); process.exit(1); }
  const center = db.collection('centers').doc(CENTER);

  await center.collection('config').doc('global').set({
    kinds: ['טסט-זן'], sizes: ['S', 'M', 'L'], destinations: ['יעד-טסט'],
    farmers: [{ name: 'חקלאי-טסט', allowGidon: false }],
    farmerConfigs: {},
  }, { merge: true });

  await center.collection('users').doc(email).set({ role: 'admin' }, { merge: true });

  const records = center.collection('farmers').doc('חקלאי-טסט').collection('records');
  const existing = await records.limit(1).get();
  if (existing.empty) {
    await records.add({
      harvestDate: '2026-07-25', palletNumber: 1, boxes: 10, kind: 'טסט-זן', size: 'M',
      weight: 0, destination: '', sent: false, gidon: false, mark: false,
      editedBy: 'seed', editedAt: new Date().toISOString(),
    });
  }
  logger.info(`[seedTestCenter] centers/${CENTER} ready; admin: ${email}`);
  process.exit(0);
})();
```

- [ ] **Step 3: Verify against the emulator**

```bash
cd backend && firebase emulators:exec --only firestore --project demo-tsuber \
  "bash -c 'FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seedTestCenter.js dev@example.com && FIRESTORE_EMULATOR_HOST=localhost:8080 node -e \"const a=require(\\\"firebase-admin\\\");a.initializeApp({projectId:\\\"demo-tsuber\\\"});a.firestore().collection(\\\"centers\\\").doc(\\\"test\\\").collection(\\\"users\\\").doc(\\\"dev@example.com\\\").get().then(s=>{if(!s.exists)process.exit(1);console.log(\\\"seed ok\\\");process.exit(0)})\"'"
```

Expected: prints `[seedTestCenter] centers/test ready…` then `seed ok`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/backfillAuthClaims.js backend/scripts/seedTestCenter.js
git commit -m "feat(task-23): claim-backfill and test-center seed scripts"
```

---

### Task 4: Firestore rules lockdown + rules tests

**Files:**
- Modify: `frontend/firestore.rules`
- Create: `backend/tests/firestore.rules.test.js`
- Modify: `backend/package.json` (add `@firebase/rules-unit-testing` devDep)

**Interfaces:**
- Consumes: the `centers` custom claim shape from Task 1.
- Produces: rules that grant `read` on `centers/{c}/config/**` and `centers/{c}/farmer_events/{f}` only when `request.auth != null && c in request.auth.token.centers`.

- [ ] **Step 1: Add the dependency**

```bash
cd backend && npm install --save-dev @firebase/rules-unit-testing
```

- [ ] **Step 2: Write the failing rules test**

```js
// backend/tests/firestore.rules.test.js
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnv;
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tsuber',
    firestore: {
      rules: readFileSync(path.resolve(__dirname, '../../frontend/firestore.rules'), 'utf8'),
    },
  });
  // Seed data with admin privileges (rules bypassed).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'centers/tsuberi/config/global'), { kinds: [] });
    await setDoc(doc(d, 'centers/tsuberi/farmer_events/gabi'), { type: 'create' });
  });
});
afterAll(async () => { await testEnv.cleanup(); });

function authed(centers) {
  return testEnv.authenticatedContext('uid1', { centers }).firestore();
}

describe('config reads', () => {
  it('allows an authed user whose claim includes the center', async () => {
    await assertSucceeds(getDoc(doc(authed(['tsuberi']), 'centers/tsuberi/config/global')));
  });
  it('denies an authed user whose claim omits the center', async () => {
    await assertFails(getDoc(doc(authed(['other']), 'centers/tsuberi/config/global')));
  });
  it('denies an unauthenticated user', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'centers/tsuberi/config/global')));
  });
});

describe('farmer_events reads', () => {
  it('allows a matching authed user', async () => {
    await assertSucceeds(getDoc(doc(authed(['tsuberi']), 'centers/tsuberi/farmer_events/gabi')));
  });
  it('denies a non-matching center', async () => {
    await assertFails(getDoc(doc(authed(['x']), 'centers/tsuberi/farmer_events/gabi')));
  });
});

describe('writes are always denied to clients', () => {
  it('denies a client write to config', async () => {
    await assertFails(setDoc(doc(authed(['tsuberi']), 'centers/tsuberi/config/global'), { kinds: ['x'] }));
  });
  it('denies a client write to farmer_events', async () => {
    await assertFails(setDoc(doc(authed(['tsuberi']), 'centers/tsuberi/farmer_events/gabi'), { type: 'x' }));
  });
  it('denies reads of records (no client rule)', async () => {
    await assertFails(getDoc(doc(authed(['tsuberi']), 'centers/tsuberi/farmers/gabi/records/r1')));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- firestore.rules`
Expected: FAIL — current rules use `read: if true`, so the "denies unauthenticated" / "denies non-matching center" cases fail.

- [ ] **Step 4: Rewrite the rules**

```
// frontend/firestore.rules
rules_version = '2';

// Client SDK reads only the tenant config doc and the real-time farmer_events.
// Firebase Auth provides request.auth; the `centers` custom claim lists the
// centers a user may read. Everything else is Admin-SDK-only (default deny).
service cloud.firestore {
  match /databases/{database}/documents {
    match /centers/{centerId}/config/{document=**} {
      allow read: if request.auth != null && centerId in request.auth.token.centers;
      allow write: if false; // Admin SDK only (POST /api/admin/config)
    }
    match /centers/{centerId}/farmer_events/{farmerId} {
      allow read: if request.auth != null && centerId in request.auth.token.centers;
      allow write: if false; // Admin SDK only (firestoreEventService)
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- firestore.rules`
Expected: PASS — all read/write assertions green.

- [ ] **Step 6: Commit**

```bash
git add frontend/firestore.rules backend/tests/firestore.rules.test.js backend/package.json backend/package-lock.json
git commit -m "feat(task-23): lock Firestore rules to authed + center-match reads"
```

> Deploy note (do NOT run now — see Task 9 cutover): `firebase deploy --only firestore:rules` must happen **after** the claim backfill (Task 9), or live authed reads break.

---

### Task 5: Frontend axios interceptor + Firebase Auth init

**Files:**
- Modify: `frontend/src/main.js`
- Create: `frontend/src/utils/auth.js`

**Interfaces:**
- Consumes: `firebase/auth` (`getAuth`, `connectAuthEmulator`), `firebase/firestore` (`connectFirestoreEmulator`).
- Produces: global axios request interceptor attaching `Authorization: Bearer <idToken>`; `getToken()` helper for non-axios `fetch` calls; `export { db, auth }`.

- [ ] **Step 1: Rewrite main.js**

```js
// frontend/src/main.js
import { createApp } from "vue";
import "./index.css";
import App from "./App.vue";
import router from "./router";
import axios from "axios";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebase = initializeApp(firebaseConfig);
const db = getFirestore(firebase);
const auth = getAuth(firebase);

// Local dev against the Firebase emulators (test center).
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
}

// Attach a fresh Firebase ID token to every axios request.
axios.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return config;
});

export { db, auth };

createApp(App).use(router).mount("#app");
```

(Analytics was import-only side effect; drop it — `getAnalytics` is not used elsewhere. If a later task needs it, re-add behind a prod guard.)

- [ ] **Step 2: Add the token helper for raw fetch calls**

```js
// frontend/src/utils/auth.js
import { auth } from "../main";

// Await a valid (auto-refreshed) Firebase ID token. Throws if signed out.
export async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no missing-export errors for `db`/`auth`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js frontend/src/utils/auth.js
git commit -m "feat(task-23): axios Bearer interceptor + Firebase Auth init/emulator wiring"
```

---

### Task 6: Login.vue — signInWithPopup

**Files:**
- Modify: `frontend/src/components/Login.vue`

**Interfaces:**
- Consumes: `auth` from `main.js`; `firebase/auth` (`signInWithPopup`, `GoogleAuthProvider`, `signOut`); axios; `useRouter`.
- Produces: a `login()` that authenticates, authorizes via `/api/auth/me`, and routes to the role home.

- [ ] **Step 1: Replace the script block**

```html
<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import axios from 'axios';
import { auth } from '../main';

const router = useRouter();
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');
const errorMsg = ref('');

const login = async () => {
  errorMsg.value = '';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    // Authorize against the Firestore users collection.
    const res = await axios.get(`${baseUrl}/api/auth/me`);
    // A freshly-minted claim needs a token refresh before Firestore reads work.
    if (res.data.refreshToken) await auth.currentUser.getIdToken(true);
    router.push(res.data.role === 'admin' ? '/Dashboard' : '/Destination');
  } catch (err) {
    if (err.response && err.response.status === 403) {
      errorMsg.value = 'החשבון אינו מורשה לגישה למערכת';
    } else {
      errorMsg.value = 'ההתחברות נכשלה, נסה שוב';
    }
    await signOut(auth).catch(() => {});
  }
};
</script>
```

- [ ] **Step 2: Remove the dev-login UI and show the error**

In the template: delete the entire `<template v-if="isDevMode"> … </template>` block (dev-login is gone). Under the Google button, add an error line:

```html
        <p v-if="errorMsg" class="text-red-400 text-xs mt-4">{{ errorMsg }}</p>
```

Remove the now-unused `isDevMode`, `devRole`, `devLogin`, and the old `login` redirect.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds; no references to `devLogin`/`isDevMode` remain (`grep -n "devLogin\|isDevMode" src/components/Login.vue` → no matches).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Login.vue
git commit -m "feat(task-23): Login.vue uses Firebase signInWithPopup"
```

---

### Task 7: router.js — guard via Firebase auth state

**Files:**
- Modify: `frontend/src/router.js`

**Interfaces:**
- Consumes: `auth` from `main.js`; `firebase/auth` (`onAuthStateChanged`); axios (for the admin role check).
- Produces: a `beforeEach` guard that gates on `auth.currentUser`, preserving redirect semantics (admin→/Dashboard, others→/Destination, no user→/login).

- [ ] **Step 1: Replace imports + guard**

Replace the top `import axios from "axios";` usage and the `beforeEach` with:

```js
import axios from "axios";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./main";

// ... routes unchanged ...

// Resolve Firebase's initial auth state once (avoids a hard-reload race).
function currentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
  });
}

router.beforeEach(async (to) => {
  const user = auth.currentUser || (await currentUser());

  if (!user) return to.path === "/login" ? true : "/login";
  if (to.path === "/login") return "/Destination"; // signed in; leave login

  // Admin gate + role-home redirect for bare/unknown paths.
  if (to.meta.requiresAdmin || to.matched.length === 0 || to.path === "/") {
    try {
      const res = await axios.get(`${baseUrl}/api/auth/me`);
      const role = res.data.role;
      if (to.matched.length === 0 || to.path === "/") {
        return role === "admin" ? "/Dashboard" : "/Destination";
      }
      if (to.meta.requiresAdmin && role !== "admin") return "/Destination";
    } catch (err) {
      if (err.response && err.response.status === 401) return "/login";
      console.warn("Auth role check failed:", err.message);
      if (to.matched.length === 0) return "/login";
    }
  }
  return true;
});
```

> The `/login → /Destination` redirect matches the old "signed-in user leaves login" behavior; Login.vue's own `router.push` still sends admins to `/Dashboard` on the actual sign-in action.

- [ ] **Step 2: Verify build + guard smoke**

Run: `cd frontend && npm run build`
Expected: build succeeds.
Manual (deferred to Task 9 E2E): unauthenticated deep-link → `/login`; admin → `/Dashboard`; non-admin hitting `/Intake` → `/Destination`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router.js
git commit -m "feat(task-23): router guard keys off Firebase auth state"
```

---

### Task 8: App.vue — onAuthStateChanged, logout, centerId

**Files:**
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `auth` from `main.js`; `firebase/auth` (`onAuthStateChanged`, `signOut`); axios; existing `setCenterId`/`centerId` and config `onSnapshot`.
- Produces: `user` driven by Firebase state; `logout()` that revokes + signs out; config subscription unchanged.

- [ ] **Step 1: Update imports**

In the `<script>` imports add:

```js
import axios from 'axios';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './main';
```

- [ ] **Step 2: Rewrite logout()**

```js
    const logout = async () => {
      try {
        await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`);
      } catch (err) {
        console.warn('Logout revoke error (signing out locally anyway):', err);
      }
      await signOut(auth).catch(() => {});
      user.value = null;
      if (isMobile.value) mobileOpen.value = false;
      router.push('/login');
    };
```

- [ ] **Step 3: Replace the onMounted fetch with auth-state driven load**

Replace the `fetch('/api/auth/me', {credentials:'include'})...` block inside `onMounted` with an `onAuthStateChanged` subscription that loads role + starts the config snapshot:

```js
      // Drive user state + tenant config from Firebase auth state.
      onAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) { user.value = null; return; }
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`);
          const data = res.data;
          if (data.refreshToken) await auth.currentUser.getIdToken(true);
          user.value = { email: data.email, role: data.role };
          if (data.centerId) {
            setCenterId(data.centerId);
            const configRef = doc(db, "centers", data.centerId, "config", "global");
            onSnapshot(configRef, (snapshot) => {
              if (!snapshot.exists()) return;
              const cfg = snapshot.data();
              kinds.value = cfg.kinds || [];
              sizes.value = cfg.sizes || [];
              destinations.value = cfg.destinations || [];
              const farmersList = cfg.farmers || [];
              farmers.value = farmersList.map(f => f.name);
              const fConfigs = {};
              farmersList.forEach(f => { fConfigs[f.name] = { allowGidon: f.allowGidon }; });
              dynamicFarmerConfigs.value = fConfigs;
              config.kinds = cfg.kinds || [];
              config.sizes = cfg.sizes || [];
              config.destinations = cfg.destinations || [];
              config.farmers = farmers.value;
              config.farmerConfigs = fConfigs;
              if (!selectedFarmer.value && farmers.value.length > 0) {
                selectedFarmer.value = farmers.value[0];
              }
            });
          }
        } catch (err) {
          console.warn('Failed to load user/config:', err?.message);
        }
      });
```

Keep the `import { db } from './main'` line already present (now `main` also exports `auth`).

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds; `grep -n "credentials: 'include'" src/App.vue` → no matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat(task-23): App.vue user state + logout via Firebase auth"
```

---

### Task 9: Cutover, end-to-end verification, and docs

**Files:**
- Modify: `CLAUDE.md`, `done.md`, `docs/redesign-plan.md`, `.superpowers/sdd/progress.md`
- (Ops only — no code) Firebase Console + `firebase deploy`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: a verified, deployed auth migration + updated docs.

- [ ] **Step 1: Local end-to-end smoke (emulators + test center)**

1. Add `VITE_USE_EMULATORS=true` to `frontend/.env.development`; set `CENTER_ID=test` for the backend dev run.
2. Start emulators + seed: `cd backend && firebase emulators:start --only firestore,auth` (separate shell), then `node scripts/seedTestCenter.js <your-email>` against the emulator, and create the matching Auth emulator user.
3. `cd backend && npm run dev`; `cd frontend && npm run dev`.
4. Verify, observing actual results: **sign in with Google (emulator) → lands on role home**; a farmer account with no `test` claim is **rejected** (403 message); intake/edit/read all work; **real-time flash** still fires; **logout** returns to `/login` and a protected deep-link now redirects to `/login`.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all suites pass (repository + `auth.middleware` + `firestore.rules`).

- [ ] **Step 3: Console prerequisites (production project)**

- Firebase Console → Authentication → Sign-in method → **Google enabled**.
- Authentication → Settings → Authorized domains includes `tsuberi.com` + `localhost`.
- Confirm `frontend/.env.production` Firebase config matches the prod project.

- [ ] **Step 4: Backfill claims BEFORE deploying rules**

```bash
cd backend && node scripts/backfillAuthClaims.js
```

Expected: `[backfill] done`; spot-check one user in Console has a `centers` custom claim.

- [ ] **Step 5: Deploy rules, then app**

```bash
firebase deploy --only firestore:rules
# then deploy backend (Cloud Run) and frontend (Firebase Hosting) per existing process
```

Order matters: rules after backfill (Step 4), backend before/with frontend so the new `/api/auth/me` exists.

- [ ] **Step 6: Retire dev-bypass config**

Remove `DEV_BYPASS_AUTH` from any `.env`/Cloud Run config. Confirm `grep -rn "DEV_BYPASS_AUTH\|dev-login\|passport\|express-session" backend/` returns no live references (only comments/plan docs, if any).

- [ ] **Step 7: Update docs**

- `CLAUDE.md`: rewrite the Authentication Flow section (Firebase ID tokens; Bearer header; `verifyFirebaseToken`/`ensureCenterAccess`/`ensureAdmin`; minimal `centers` claim; role still live from Firestore). Update the Firestore-rules paragraph (now authed + center-match; legacy top-level matches removed). Remove the dev-bypass paragraph. Update the endpoints table (`/api/auth/logout` now POST; `/api/auth/unauthorized` + `/api/auth/google[/callback]` removed).
- `done.md`: append a task 23 entry (what shipped, files, the claim model, cutover order).
- `docs/redesign-plan.md`: remove task 23 from the board / mark DONE; note `centerId` now claim-guarded (still env-resolved).
- `.superpowers/sdd/progress.md`: add a task 23 status line.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md done.md docs/redesign-plan.md .superpowers/sdd/progress.md
git commit -m "docs(task-23): document Firebase Auth model + mark task done"
```

---

## Self-Review

**Spec coverage:**
- Backend middleware (verify/ensureAdmin/ensureCenterAccess/syncUserClaims) → Task 1. ✅
- server.js rewire, `/api/auth/me`, logout revoke, CORS, dep removal, claim-sync on user admin → Task 2. ✅
- Backfill + test-center seed → Task 3. ✅
- Firestore rules (auth + center-match) + rule tests + legacy-match removal → Task 4. ✅
- Frontend interceptor, emulator wiring, `getToken` → Task 5. ✅
- Login popup + rejection handling → Task 6. ✅
- Router guard via auth state → Task 7. ✅
- App.vue onAuthStateChanged + logout + centerId (config subscription unchanged) → Task 8. ✅
- Cutover prerequisites (console, backfill-before-rules ordering, dev-bypass retire), E2E smoke, docs → Task 9. ✅
- Login-flow-still-Google clarification → captured in spec; reflected in Task 6 + Task 9 docs. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code; verification steps give exact commands + expected output.

**Type consistency:** `req.user = { email, uid, centers }` (Task 1) is what `ensureCenterAccess`/`ensureAdmin` consume (Task 1/2). `/api/auth/me` returns `{ email, role, centerId, refreshToken }` — consumed identically in Login.vue (Task 6), router.js (Task 7), App.vue (Task 8). `centers` claim name matches rules `request.auth.token.centers` (Task 4). `auth` export from main.js (Task 5) is imported by Tasks 6/7/8. `syncUserClaims(email) → boolean` used in Task 2 (`refreshToken`) and Task 3 (backfill).

**Deferred/parked (non-goals, per spec):** subdomain center resolution, role-in-claim, separate Firebase project, task 24 farmer-scoped roles.
