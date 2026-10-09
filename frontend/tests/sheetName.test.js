import { describe, it, expect } from 'vitest';
import { safeSheetName } from '../src/utils/sheetName.js';

describe('safeSheetName', () => {
  it('keeps a normal name', () => {
    expect(safeSheetName('חקלאי טסט')).toBe('חקלאי טסט');
  });
  it('replaces forbidden characters', () => {
    expect(safeSheetName('a/b\\c?d*e[f]g:h')).toBe('a_b_c_d_e_f_g_h');
  });
  it('strips leading/trailing apostrophes and falls back when empty', () => {
    expect(safeSheetName("'abc'")).toBe('abc');
    expect(safeSheetName("''")).toBe('מגדל');
    expect(safeSheetName('   ')).toBe('מגדל');
    expect(safeSheetName(undefined)).toBe('מגדל');
  });
  it('truncates to 31 characters', () => {
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
  });
  it('de-duplicates after truncation with a suffix that still fits', () => {
    const used = new Set();
    const a = safeSheetName('x'.repeat(35) + 'A', used);
    const b = safeSheetName('x'.repeat(35) + 'B', used);
    const c = safeSheetName('x'.repeat(35) + 'C', used);
    expect(new Set([a, b, c]).size).toBe(3);
    for (const n of [a, b, c]) expect(n.length).toBeLessThanOrEqual(31);
    expect(b.endsWith(' (2)')).toBe(true);
  });
  it('treats names case-insensitively and handles names that sanitize to the same value', () => {
    const used = new Set();
    expect(safeSheetName('A/B', used)).toBe('A_B');
    expect(safeSheetName('a_b', used)).toBe('a_b (2)');
  });
});
