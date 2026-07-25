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
