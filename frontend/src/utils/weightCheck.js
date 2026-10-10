// weightCheck.js — task 26: flag a pallet whose weight per box looks like a typo, and pallets with
// no weight at shipment time. The range lives in config/global.weightCheck (Settings); the
// defaults come from the 2026 season (median 5.6 kg/box; נספק boxes ~8 kg; 4–9 flagged 8 of 616
// pallets, 7 of them clear typos).

export const DEFAULT_WEIGHT_RANGE = { minKgPerBox: 4, maxKgPerBox: 9 };

export function weightRange(config) {
  const r = config?.weightCheck || {};
  const min = Number(r.minKgPerBox);
  const max = Number(r.maxKgPerBox);
  return min > 0 && max > min ? { minKgPerBox: min, maxKgPerBox: max } : { ...DEFAULT_WEIGHT_RANGE };
}

// kg per box, or null when weight or boxes is missing / not a positive number.
export function kgPerBox(pallet) {
  const weight = Number(pallet?.weight);
  const boxes = Number(pallet?.boxes);
  if (pallet?.weight === '' || pallet?.weight == null || !(weight > 0) || !(boxes > 0)) return null;
  return weight / boxes;
}

// The kg-per-box value when it falls outside the range, otherwise null.
export function abnormalKgPerBox(pallet, range = DEFAULT_WEIGHT_RANGE) {
  const kg = kgPerBox(pallet);
  if (kg === null) return null;
  return kg < range.minKgPerBox || kg > range.maxKgPerBox ? kg : null;
}

export function hasNoWeight(pallet) {
  return !(Number(pallet?.weight) > 0);
}

// Hebrew confirm text for an abnormal weight (shared by intake and the table editor).
export function abnormalWeightMessage(kg, range) {
  return `המשקל נראה חריג: ${kg.toFixed(1)} ק״ג לארגז (טווח רגיל ${range.minKgPerBox}–${range.maxKgPerBox}). לשמור בכל זאת?`;
}

// Details line for shipment confirms: which selected pallets have no weight ('' when none).
export function missingWeightDetails(pallets) {
  const numbers = [...new Set(pallets.filter(hasNoWeight).map(p => p.palletNumber))];
  return numbers.length ? `שים לב: ${numbers.length} משטחים ללא משקל (${numbers.join(', ')})` : '';
}
