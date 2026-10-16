import { describe, it, expect } from 'vitest';
import { eligiblePallets, eligibleByFarmer, farmerColors, FARMER_COLORS, roomStats, CAPACITY } from '../src/utils/fridgeView.js';

const r = (palletNumber, o = {}) => ({ id: `${palletNumber}-${Math.random()}`, palletNumber, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false, mark: false, ...o });

describe('eligiblePallets', () => {
  it('excludes deleted, fully sent and already placed pallets; one entry per mixed pallet; marked and partly sent included', () => {
    const records = [r(1), r(2, { sent: true }), r(3, { deleted: true }), r(4), r(4, { kind: 'קיט', boxes: 10, weight: 0 }),
      r(5, { mark: true }), r(6, { sent: true }), r(6), r(7)];
    const cells = { A1: { farmer: 'א', palletNumber: 7 }, A2: { farmer: 'ב', palletNumber: 1 } };
    const out = eligiblePallets(records, 'א', cells);
    expect(out.map(p => p.palletNumber)).toEqual([1, 4, 5, 6]);
    expect(out.find(p => p.palletNumber === 4)).toEqual({ palletNumber: 4, kinds: ['שלי', 'קיט'], boxes: 50, mixed: true, mark: false, weightMissing: true });
    expect(out.find(p => p.palletNumber === 5).mark).toBe(true);
  });
  it('filters by pallet-number substring and sorts numerically', () => {
    const out = eligiblePallets([r(112), r(12), r(3)], 'א', {}, ' 12 ');
    expect(out.map(p => p.palletNumber)).toEqual([12, 112]);
  });
  it('placed check compares numbers as strings', () => {
    expect(eligiblePallets([r(9)], 'א', { B1: { farmer: 'א', palletNumber: '9' } })).toEqual([]);
  });
});

describe('eligibleByFarmer', () => {
  it('lists the same pallet number under two farmers, excludes the placed one, drops empty farmers', () => {
    const out = eligibleByFarmer({ 'א': [r(5), r(6)], 'ב': [r(5)], 'ג': [r(9, { sent: true })] },
      { A1: { farmer: 'א', palletNumber: 6 } });
    expect(out.map(g => [g.farmer, g.pallets.map(p => p.palletNumber)])).toEqual([['א', [5]], ['ב', [5]]]);
    expect(eligibleByFarmer({ 'א': [r(5), r(15)], 'ב': [r(5)] }, {}, '15').map(g => g.farmer)).toEqual(['א']);
  });
});

describe('farmerColors', () => {
  it('stable by list position, covers farmers only seen on the map, no red hues', () => {
    const c = farmerColors(['א', 'ב'], { A1: { farmer: 'ג' } });
    expect(c['א']).toBe(FARMER_COLORS[0]);
    expect(c['ג']).toBe(FARMER_COLORS[2]);
    expect(FARMER_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(FARMER_COLORS.some(x => /red|rose/.test(x.band))).toBe(false);
  });
});

describe('roomStats', () => {
  const cellsOf = (n, farmer = 'א') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`S${i}`, { farmer, palletNumber: i }]));
  it('levels: <50% low, <85% mid, else high', () => {
    expect(roomStats({}).level).toBe('low');
    expect(roomStats(cellsOf(19)).level).toBe('low');
    expect(roomStats(cellsOf(20)).level).toBe('mid');
    expect(roomStats(cellsOf(34)).level).toBe('high');
    const full = roomStats(cellsOf(CAPACITY));
    expect(full).toMatchObject({ occupied: 40, capacity: 40, rate: 100, level: 'high' });
  });
});
