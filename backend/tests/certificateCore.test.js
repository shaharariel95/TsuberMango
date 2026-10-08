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
