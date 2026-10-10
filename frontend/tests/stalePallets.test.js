import { describe, it, expect } from 'vitest';
import { staleSettings, parseHarvestDate, daysSince, findStalePallets, DEFAULT_STALE } from '../src/utils/stalePallets.js';

const today = new Date(2027, 5, 10, 15, 30); // 10 June 2027, mid-afternoon

describe('staleSettings', () => {
  it('is off with 3 days unless configured', () => {
    expect(staleSettings(undefined)).toEqual(DEFAULT_STALE);
    expect(staleSettings({ stalePallets: { enabled: 'yes', days: 0 } })).toEqual({ enabled: false, days: 3 });
    expect(staleSettings({ stalePallets: { enabled: true, days: 5 } })).toEqual({ enabled: true, days: 5 });
  });
});

describe('parseHarvestDate', () => {
  it('reads intake dates and older formats', () => {
    expect(parseHarvestDate('2027-06-07', today)).toEqual(new Date(2027, 5, 7));
    expect(parseHarvestDate('07/06/2027', today)).toEqual(new Date(2027, 5, 7));
    expect(parseHarvestDate('07/06/27', today)).toEqual(new Date(2027, 5, 7));
    expect(parseHarvestDate('07/06', today)).toEqual(new Date(2027, 5, 7));
  });
  it('puts a year-less date that would be in the future into last year', () => {
    expect(parseHarvestDate('20/12', today)).toEqual(new Date(2026, 11, 20));
  });
  it('returns null for junk', () => {
    expect(parseHarvestDate('', today)).toBeNull();
    expect(parseHarvestDate('soon', today)).toBeNull();
    expect(parseHarvestDate(undefined, today)).toBeNull();
  });
});

describe('daysSince', () => {
  it('counts calendar days regardless of the time of day', () => {
    expect(daysSince(new Date(2027, 5, 7), today)).toBe(3);
    expect(daysSince(new Date(2027, 5, 10), today)).toBe(0);
  });
});

describe('findStalePallets', () => {
  const farmers = [
    { name: 'א', records: [
      { palletNumber: 1, harvestDate: '2027-06-06', sent: false },  // 4 days -> stale
      { palletNumber: 2, harvestDate: '2027-06-07', sent: false },  // 3 days -> not yet (more than 3)
      { palletNumber: 3, harvestDate: '2027-06-01', sent: true },   // sent -> never
      { palletNumber: 4, harvestDate: '2027-06-05', sent: false },  // mixed pallet 4:
      { palletNumber: 4, harvestDate: '2027-06-02', sent: false },  //   oldest date wins, listed once
      { palletNumber: 5, harvestDate: '', sent: false },            // no date -> skipped
    ] },
    { name: 'ב', records: [{ palletNumber: 9, harvestDate: '06/06', sent: false }] },
    { name: 'ג', records: null }, // failed to load
  ];

  it('lists unsent pallets older than N days, oldest first, a mixed pallet once', () => {
    expect(findStalePallets(farmers, { days: 3, today })).toEqual([
      { farmer: 'א', palletNumber: 4, harvestDate: '2027-06-02', days: 8 },
      { farmer: 'א', palletNumber: 1, harvestDate: '2027-06-06', days: 4 },
      { farmer: 'ב', palletNumber: 9, harvestDate: '06/06', days: 4 },
    ]);
  });

  it('respects the configured number of days', () => {
    expect(findStalePallets(farmers, { days: 5, today }).map(p => p.palletNumber)).toEqual([4]);
  });
});
