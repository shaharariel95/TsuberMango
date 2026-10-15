import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../services/fridgeCore');
const { applyOp, isValidSlot, summarizePallet, summarizeRoom, FridgeError } = core;

const ctx = { actor: 'a@x', at: '2027-05-10T08:00:00.000Z' };
const cell = (farmer, palletNumber) => ({ farmer, palletNumber, placedBy: 'b@x', placedAt: '2027-05-09T08:00:00.000Z' });
const codeOf = (fn) => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(FridgeError); return `${e.status} ${e.code}`; } return 'no error'; };

describe('isValidSlot', () => {
  it('accepts A1–E8 of room main', () => {
    for (const s of ['A1', 'E8', 'C4']) expect(isValidSlot('main', s)).toBe(true);
  });
  it('rejects invalid slots', () => {
    for (const s of ['a1', 'A9', 'F1', 'A0', '', 'A01', 'AA1', null, undefined, 3]) expect(isValidSlot('main', s)).toBe(false);
    expect(isValidSlot('other', 'A1')).toBe(false);
  });
});

describe('applyOp place', () => {
  it('places into an empty slot and logs it', () => {
    const out = applyOp('main', {}, { op: 'place', slot: 'B3', farmer: 'א', palletNumber: 12 }, ctx);
    expect(out.cells).toEqual({ B3: { farmer: 'א', palletNumber: 12, placedBy: 'a@x', placedAt: ctx.at } });
    expect(out.logEntry).toEqual({ op: 'place', farmer: 'א', palletNumber: 12, from: null, to: 'B3', by: 'a@x', at: ctx.at });
  });
  it('refuses a taken slot', () => {
    expect(codeOf(() => applyOp('main', { B3: cell('ב', 1) }, { op: 'place', slot: 'B3', farmer: 'א', palletNumber: 12 }, ctx))).toBe('409 SLOT_TAKEN');
  });
  it('refuses a pallet already placed, naming its slot, comparing numbers as strings', () => {
    try {
      applyOp('main', { D7: cell('א', 12) }, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: '12' }, ctx);
      throw new Error('expected throw');
    } catch (e) { expect(e.code).toBe('ALREADY_PLACED'); expect(e.status).toBe(409); expect(e.details).toEqual({ slot: 'D7' }); }
  });
  it('the same number for another farmer is a different pallet', () => {
    const out = applyOp('main', { D7: cell('ב', 12) }, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 12 }, ctx);
    expect(Object.keys(out.cells).sort()).toEqual(['A1', 'D7']);
  });
  it('rejects bad input with 400', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A9', farmer: 'א', palletNumber: 1 }, ctx))).toBe('400 BAD_SLOT');
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A1', farmer: '', palletNumber: 1 }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, { op: 'place', slot: 'A1', farmer: 'א', palletNumber: '' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, { op: 'swap' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', {}, undefined, ctx))).toBe('400 BAD_OP');
  });
  it('unknown room is 404', () => {
    expect(codeOf(() => applyOp('nope', {}, { op: 'clear', slot: 'A1' }, ctx))).toBe('404 ROOM_NOT_FOUND');
  });
});

describe('applyOp move', () => {
  it('moves and keeps the original placedBy/placedAt', () => {
    const out = applyOp('main', { A1: cell('א', 5) }, { op: 'move', from: 'A1', to: 'E8' }, ctx);
    expect(out.cells).toEqual({ E8: cell('א', 5) });
    expect(out.logEntry).toEqual({ op: 'move', farmer: 'א', palletNumber: 5, from: 'A1', to: 'E8', by: 'a@x', at: ctx.at });
  });
  it('refuses empty source, taken target, same slot, bad slots', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'move', from: 'A1', to: 'A2' }, ctx))).toBe('409 SLOT_EMPTY');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1), A2: cell('א', 2) }, { op: 'move', from: 'A1', to: 'A2' }, ctx))).toBe('409 SLOT_TAKEN');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1) }, { op: 'move', from: 'A1', to: 'A1' }, ctx))).toBe('400 BAD_OP');
    expect(codeOf(() => applyOp('main', { A1: cell('א', 1) }, { op: 'move', from: 'A1', to: 'F1' }, ctx))).toBe('400 BAD_SLOT');
  });
});

describe('applyOp clear', () => {
  it('clears an occupied slot and logs it', () => {
    const out = applyOp('main', { C2: cell('א', 9) }, { op: 'clear', slot: 'C2' }, ctx);
    expect(out.cells).toEqual({});
    expect(out.logEntry).toEqual({ op: 'clear', farmer: 'א', palletNumber: 9, from: 'C2', to: null, by: 'a@x', at: ctx.at });
  });
  it('clearing an empty slot (or a room with no doc yet) is 409 SLOT_EMPTY', () => {
    expect(codeOf(() => applyOp('main', {}, { op: 'clear', slot: 'C2' }, ctx))).toBe('409 SLOT_EMPTY');
  });
});

describe('summarizePallet', () => {
  const r = (o) => ({ palletNumber: 1, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false, mark: false, cardId: '', ...o });
  it('ok single pallet', () => {
    expect(summarizePallet([r()], [])).toEqual({ status: 'ok', kinds: ['שלי'], sizes: ['15'], boxes: 40, weightMissing: false, mark: false, hasCertificate: false });
  });
  it('mixed pallet: unique kinds/sizes, summed boxes, any-flags', () => {
    const s = summarizePallet([r({ kind: 'שלי', size: '15', weight: 0, mark: true }), r({ kind: 'קיט', size: '15', boxes: 20 })], []);
    expect(s).toEqual({ status: 'ok', kinds: ['שלי', 'קיט'], sizes: ['15'], boxes: 60, weightMissing: true, mark: true, hasCertificate: false });
  });
  it('sent / partly sent', () => {
    expect(summarizePallet([r({ sent: true, cardId: 51 })], []).status).toBe('sent');
    expect(summarizePallet([r({ sent: true, cardId: 51 })], []).hasCertificate).toBe(true);
    expect(summarizePallet([r({ sent: true }), r()], []).status).toBe('partly_sent');
  });
  it('deleted records are ignored while a live one exists', () => {
    expect(summarizePallet([r({ boxes: 10 })], [r({ boxes: 99, deleted: true })])).toMatchObject({ status: 'ok', boxes: 10 });
  });
  it('deleted vs missing', () => {
    expect(summarizePallet([], [r({ deleted: true })])).toEqual({ status: 'deleted', kinds: [], sizes: [], boxes: 0, weightMissing: false, mark: false, hasCertificate: false });
    expect(summarizePallet([], []).status).toBe('missing');
  });
});

describe('summarizeRoom', () => {
  it('resolves each cell by (farmer, String(palletNumber))', () => {
    const cells = { A1: cell('א', '12'), A2: cell('ב', 3) };
    const byFarmer = {
      'א': { live: [{ palletNumber: 12, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false }], deleted: [] },
      'ב': { live: [], deleted: [] },
    };
    const out = summarizeRoom(cells, byFarmer);
    expect(out['א__12'].status).toBe('ok');
    expect(out['ב__3'].status).toBe('missing');
  });
});
