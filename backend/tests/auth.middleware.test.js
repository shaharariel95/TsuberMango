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
  // syncUserClaims tests also write to the 'test' center — clean both so state
  // doesn't leak between tests (a center doc only "exists" implicitly via its
  // subcollections, so this must be cleared per-collection, not per-doc).
  for (const centerId of ['tsuberi', 'test']) {
    const snap = await db.collection('centers').doc(centerId).collection('users').get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  }
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
