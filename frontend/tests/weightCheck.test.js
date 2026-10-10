import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHT_RANGE, weightRange, kgPerBox, abnormalKgPerBox, hasNoWeight,
  abnormalWeightMessage, missingWeightDetails,
} from '../src/utils/weightCheck.js';

describe('weightRange', () => {
  it('falls back to 4–9 when config has no valid range', () => {
    expect(weightRange(undefined)).toEqual(DEFAULT_WEIGHT_RANGE);
    expect(weightRange({ weightCheck: { minKgPerBox: 9, maxKgPerBox: 4 } })).toEqual(DEFAULT_WEIGHT_RANGE);
    expect(weightRange({ weightCheck: { minKgPerBox: '', maxKgPerBox: 8 } })).toEqual(DEFAULT_WEIGHT_RANGE);
  });
  it('uses the configured range (strings from inputs are fine)', () => {
    expect(weightRange({ weightCheck: { minKgPerBox: '3.5', maxKgPerBox: 10 } })).toEqual({ minKgPerBox: 3.5, maxKgPerBox: 10 });
  });
});

describe('kgPerBox / abnormalKgPerBox', () => {
  it('needs both a weight and boxes', () => {
    expect(kgPerBox({ weight: 600, boxes: 100 })).toBe(6);
    expect(kgPerBox({ weight: '', boxes: 100 })).toBeNull();
    expect(kgPerBox({ weight: 600, boxes: 0 })).toBeNull();
    expect(kgPerBox({ weight: '600', boxes: '120' })).toBe(5);
  });
  it('flags last season\'s real typos and leaves normal pallets alone', () => {
    expect(abnormalKgPerBox({ weight: 1, boxes: 48 })).toBeCloseTo(0.02, 2);      // weight 1 kg
    expect(abnormalKgPerBox({ weight: 666, boxes: 3 })).toBe(222);                  // boxes typo
    expect(abnormalKgPerBox({ weight: 587, boxes: 44 })).toBeCloseTo(13.34, 1);
    expect(abnormalKgPerBox({ weight: 672, boxes: 120 })).toBeNull();               // 5.6 kg/box
    expect(abnormalKgPerBox({ weight: 591, boxes: 72 })).toBeNull();                // נספק, 8.2 kg/box
    expect(abnormalKgPerBox({ weight: '', boxes: 72 })).toBeNull();                 // no weight yet
  });
  it('treats the range ends as normal', () => {
    expect(abnormalKgPerBox({ weight: 400, boxes: 100 })).toBeNull();
    expect(abnormalKgPerBox({ weight: 900, boxes: 100 })).toBeNull();
  });
});

describe('messages', () => {
  it('formats the abnormal-weight question', () => {
    expect(abnormalWeightMessage(13.341, DEFAULT_WEIGHT_RANGE)).toContain('13.3 ק״ג לארגז (טווח רגיל 4–9)');
  });
  it('lists pallets without weight once per pallet number', () => {
    expect(hasNoWeight({ weight: '' })).toBe(true);
    expect(hasNoWeight({ weight: 0 })).toBe(true);
    expect(hasNoWeight({ weight: 500 })).toBe(false);
    expect(missingWeightDetails([
      { palletNumber: 12, weight: '' }, { palletNumber: 12, weight: null }, { palletNumber: 15 }, { palletNumber: 16, weight: 500 },
    ])).toBe('שים לב: 2 משטחים ללא משקל (12, 15)');
    expect(missingWeightDetails([{ palletNumber: 1, weight: 500 }])).toBe('');
  });
});
