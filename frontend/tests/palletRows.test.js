import { describe, it, expect } from 'vitest';
import {
  filterPallets, sortAndGroup, countUniquePallets, mixColorMap, filterOptions,
  hasCertificate, canDelete, GIDON_YES, GIDON_NO,
} from '../src/utils/palletRows.js';

const p = (id, palletNumber, extra = {}) => ({ id, palletNumber, kind: 'שלי', size: '12', boxes: 10, weight: 60, sent: false, ...extra });

describe('filterPallets', () => {
  const pallets = [
    p('a', 1, { kind: 'טומי' }),
    p('b', 2),
    p('c', 2, { kind: 'טומי' }), // mixed pallet 2
    p('d', 3, { weight: '', sent: true, gidon: true }),
  ];

  it('returns every row, gidon as text, when no filter is active', () => {
    const rows = filterPallets(pallets);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.find(r => r.id === 'd').gidon).toBe(GIDON_YES);
    expect(rows.find(r => r.id === 'a').gidon).toBe('');
    expect(rows.some(r => r._isContext)).toBe(false);
  });

  it('keeps a mixed pallet whole: unmatched siblings come back as context rows', () => {
    const rows = filterPallets(pallets, { filterBy: { kind: 'טומי' } });
    expect(rows.map(r => [r.id, !!r._isContext])).toEqual([['a', false], ['c', false], ['b', true]]);
  });

  it('searches across the visible fields, case-insensitively and trimmed', () => {
    expect(filterPallets(pallets, { search: '  טומי ' }).filter(r => !r._isContext).map(r => r.id)).toEqual(['a', 'c']);
    expect(filterPallets(pallets, { search: '3' }).map(r => r.id)).toEqual(['d']);
  });

  it('filters missing weight, unsent-only view and the gidon note', () => {
    expect(filterPallets(pallets, { filterMissingWeight: true }).map(r => r.id)).toEqual(['d']);
    expect(filterPallets(pallets, { sentView: true }).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterPallets(pallets, { filterBy: { gidon: GIDON_YES } }).map(r => r.id)).toEqual(['d']);
    expect(filterPallets(pallets, { filterBy: { gidon: GIDON_NO } }).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sortAndGroup', () => {
  it('sorts pallet numbers numerically in both directions', () => {
    const rows = [p('x', 10), p('y', 9), p('z', 100)];
    expect(sortAndGroup(rows).map(r => r.palletNumber)).toEqual([9, 10, 100]);
    expect(sortAndGroup(rows, { sortDirection: 'desc' }).map(r => r.palletNumber)).toEqual([100, 10, 9]);
  });

  it('sorts other fields as text', () => {
    const rows = [p('x', 1, { kind: 'ב' }), p('y', 2, { kind: 'א' })];
    expect(sortAndGroup(rows, { sortField: 'kind' }).map(r => r.id)).toEqual(['y', 'x']);
  });

  it('marks the group leader, puts context rows after it and hides them when collapsed', () => {
    const rows = [{ ...p('ctx', 2), _isContext: true }, p('lead', 2), p('other', 1)];
    const open = sortAndGroup(rows);
    expect(open.map(r => r.id)).toEqual(['other', 'lead', 'ctx']);
    expect(open[1]).toMatchObject({ _isGroupLeader: true, _contextCount: 1 });
    expect(sortAndGroup(rows, { collapsed: new Set(['2']) }).map(r => r.id)).toEqual(['other', 'lead']);
  });
});

describe('helpers', () => {
  it('counts a mixed pallet once', () => {
    expect(countUniquePallets([p('a', 1), p('b', 1), p('c', 2)])).toBe(2);
  });

  it('colours only mixed pallets', () => {
    const map = mixColorMap([p('a', 1), p('b', 1), p('c', 2), p('d', 3), p('e', 3)]);
    expect(Object.keys(map)).toEqual(['1', '3']);
    expect(map['1'].border).not.toBe(map['3'].border);
  });

  it('lists distinct filter options, gidon as yes/no labels', () => {
    expect(filterOptions([p('a', 1), p('b', 2), p('c', 3, { kind: 'טומי' })], 'kind')).toEqual(['שלי', 'טומי']);
    expect(filterOptions([p('a', 1, { gidon: true }), p('b', 2)], 'gidon')).toEqual([GIDON_YES, GIDON_NO]);
  });

  it('knows certified and deletable pallets', () => {
    expect(hasCertificate({ cardId: '51223' })).toBe(true);
    expect(hasCertificate({ cardId: 0 })).toBe(false);
    expect(hasCertificate({ cardId: ' ' })).toBe(false);
    expect(canDelete({ sent: false, cardId: '' })).toBe(true);
    expect(canDelete({ sent: true })).toBe(false);
    expect(canDelete({ sent: false, cardId: 5 })).toBe(false);
    expect(canDelete(undefined)).toBe(false);
  });
});
