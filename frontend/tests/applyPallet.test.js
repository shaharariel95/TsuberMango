import { describe, it, expect } from 'vitest';
import { applyPallet } from '../src/utils/applyPallet.js';

describe('applyPallet', () => {
  it('merges an update into an existing row', () => {
    const list = [{ id: 'a', weight: 1, kind: 'x' }];
    expect(applyPallet(list, { id: 'a', weight: 2 })).toBe('a');
    expect(list).toEqual([{ id: 'a', weight: 2, kind: 'x' }]);
  });
  it('adds a new row that passes the filter, ignores one that does not', () => {
    const list = [];
    expect(applyPallet(list, { id: 'b', sent: true }, p => p.sent)).toBe('b');
    expect(applyPallet(list, { id: 'c', sent: false }, p => p.sent)).toBeNull();
    expect(list.map(p => p.id)).toEqual(['b']);
  });
  it('removes a row that no longer passes the filter', () => {
    const list = [{ id: 'a', sent: true }];
    expect(applyPallet(list, { id: 'a', sent: false }, p => p.sent)).toBeNull();
    expect(list).toEqual([]);
  });
  it('removes a soft-deleted row and never adds one', () => {
    const list = [{ id: 'a', weight: 1 }];
    expect(applyPallet(list, { id: 'a', deleted: true })).toBeNull();
    expect(list).toEqual([]);
    expect(applyPallet(list, { id: 'z', deleted: true })).toBeNull();
    expect(list).toEqual([]);
  });
});
