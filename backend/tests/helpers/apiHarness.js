import admin from 'firebase-admin';
import request from 'supertest';

export async function clearCollection(ref) {
  const snap = await ref.get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

// Create an auth-emulator user (optionally pre-stamped with the centers claim) and
// exchange its password for a real emulator ID token.
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
