// stalePallets.js — task 31: unsent pallets harvested more than N days ago, for the Dashboard nudge.
// Settings in config/global.stalePallets {enabled, days}; off by default.

export const DEFAULT_STALE = { enabled: false, days: 3 };

export function staleSettings(config) {
  const s = config?.stalePallets || {};
  const days = Number(s.days);
  return { enabled: s.enabled === true, days: Number.isInteger(days) && days > 0 ? days : DEFAULT_STALE.days };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// harvestDate is 'YYYY-MM-DD' (intake's date input) or, in older data, 'DD/MM' / 'DD/MM/YYYY'.
// A year-less date is taken in `today`'s year (a future result means last year). Local midnight; null if unparseable.
export function parseHarvestDate(value, today = new Date()) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
  const d = new Date(year, +m[2] - 1, +m[1]);
  if (!m[3] && d > today) d.setFullYear(year - 1);
  return d;
}

// Whole days between the harvest date and today (calendar days, local time).
export function daysSince(date, today = new Date()) {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((startOfToday - date) / DAY_MS);
}

// [{ farmer, palletNumber, harvestDate, days }] for unsent pallets older than `days`, oldest first.
// A mixed pallet (several records, same number) appears once, with its oldest harvest date.
export function findStalePallets(farmerRecords, { days, today = new Date() }) {
  const byPallet = new Map();
  for (const { name, records } of farmerRecords) {
    for (const r of records || []) {
      if (r.sent) continue;
      const harvested = parseHarvestDate(r.harvestDate, today);
      if (!harvested) continue;
      const age = daysSince(harvested, today);
      if (age <= days) continue;
      const key = `${name}\u0000${r.palletNumber}`;
      const prev = byPallet.get(key);
      if (!prev || age > prev.days) byPallet.set(key, { farmer: name, palletNumber: r.palletNumber, harvestDate: r.harvestDate, days: age });
    }
  }
  return [...byPallet.values()].sort((a, b) => b.days - a.days || a.farmer.localeCompare(b.farmer)
    || Number(a.palletNumber) - Number(b.palletNumber));
}
