// palletRows.js — pure row logic for PalletTable: filtering (with mixed-pallet context rows),
// sorting + group annotation, mixed-pallet colours, filter options. No Vue, no I/O.

export const GIDON_YES = 'גדעון';
export const GIDON_NO = 'אין הערה';

const SEARCH_FIELDS = ['palletNumber', 'cardId', 'shipmentDate', 'harvestDate', 'kind', 'size', 'boxes', 'weight', 'destination'];

const MIX_PALETTE = [
  { border: '#8b5cf6', bg: 'rgba(139,92,246,0.09)' },
  { border: '#3b82f6', bg: 'rgba(59,130,246,0.09)' },
  { border: '#06b6d4', bg: 'rgba(6,182,212,0.09)' },
  { border: '#10b981', bg: 'rgba(16,185,129,0.09)' },
  { border: '#f97316', bg: 'rgba(249,115,22,0.09)' },
  { border: '#ec4899', bg: 'rgba(236,72,153,0.09)' },
  { border: '#84cc16', bg: 'rgba(132,204,22,0.09)' },
  { border: '#ef4444', bg: 'rgba(239,68,68,0.09)' },
];

function countByPalletNumber(pallets) {
  const counts = {};
  for (const p of pallets) {
    const k = String(p.palletNumber);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// Pallet numbers shared by more than one record (a mixed pallet).
export function mixedPalletNumbers(pallets) {
  const counts = countByPalletNumber(pallets);
  return new Set(Object.keys(counts).filter(k => counts[k] > 1));
}

export function hasActiveFilter({ filterBy = {}, search = '', filterMissingWeight = false, sentView = false }) {
  const { kind, size, destination, gidon } = filterBy;
  return !!(kind || size || destination || gidon || search.trim() || filterMissingWeight || sentView);
}

// Rows that pass the filters, with `gidon` shown as text. When a filter is active, the other
// records of a matched mixed pallet are appended as `_isContext` rows so the pallet stays whole.
export function filterPallets(pallets, opts = {}) {
  const { filterBy = {}, search: rawSearch = '', filterMissingWeight = false, sentView = false } = opts;
  const search = rawSearch.trim().toLowerCase();

  const passes = (pallet) => {
    if (sentView && pallet.sent !== false) return false;
    if (filterMissingWeight && pallet.weight) return false;
    if (search && !SEARCH_FIELDS.some(f => String(pallet[f] ?? '').toLowerCase().includes(search))) return false;
    if (filterBy.gidon === GIDON_YES && !pallet.gidon) return false;
    if (filterBy.gidon === GIDON_NO && pallet.gidon) return false;
    for (const [key, value] of Object.entries(filterBy)) {
      if (key === 'gidon') continue;
      if (value && pallet[key] !== value) return false;
    }
    return true;
  };

  const display = (pallet, isContext = false) => {
    const row = { ...pallet, gidon: pallet.gidon ? GIDON_YES : '' };
    if (isContext) row._isContext = true;
    return row;
  };

  const matched = pallets.filter(passes).map(p => display(p));
  if (!hasActiveFilter({ ...opts, search: rawSearch })) return matched;

  const mixed = mixedPalletNumbers(pallets);
  const matchedIds = new Set(matched.map(p => p.id));
  const mixedMatched = new Set(matched.map(p => String(p.palletNumber)).filter(k => mixed.has(k)));
  if (mixedMatched.size === 0) return matched;

  const context = pallets
    .filter(p => mixedMatched.has(String(p.palletNumber)) && !matchedIds.has(p.id))
    .map(p => display(p, true));
  return [...matched, ...context];
}

// Sorted rows. The first real row of a pallet that has context rows becomes `_isGroupLeader`
// (with `_contextCount`); context rows of a collapsed pallet number are dropped.
export function sortAndGroup(rows, { sortField = 'palletNumber', sortDirection = 'asc', collapsed = new Set() } = {}) {
  const dir = sortDirection === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const cmp = sortField === 'palletNumber'
      ? (parseInt(aVal) - parseInt(bVal)) * dir
      : String(aVal ?? '').localeCompare(String(bVal ?? '')) * dir;
    if (cmp !== 0) return cmp;
    if (!!a._isContext !== !!b._isContext) return a._isContext ? 1 : -1;
    return 0;
  });

  const contextCount = {};
  for (const p of sorted) {
    if (p._isContext) {
      const k = String(p.palletNumber);
      contextCount[k] = (contextCount[k] || 0) + 1;
    }
  }

  const seenLeaders = new Set();
  const result = [];
  for (const p of sorted) {
    const k = String(p.palletNumber);
    if (p._isContext) {
      if (!collapsed.has(k)) result.push(p);
      continue;
    }
    if (contextCount[k] && !seenLeaders.has(k)) {
      seenLeaders.add(k);
      result.push({ ...p, _isGroupLeader: true, _contextCount: contextCount[k] });
    } else {
      result.push(p);
    }
  }
  return result;
}

// Number of physical pallets (a mixed pallet counts once).
export function countUniquePallets(rows) {
  return new Set(rows.map(p => p.palletNumber)).size;
}

// palletNumber -> { border, bg } for every mixed pallet, in first-seen order.
export function mixColorMap(pallets) {
  const map = {};
  let i = 0;
  for (const [num, cnt] of Object.entries(countByPalletNumber(pallets))) {
    if (cnt > 1) map[num] = MIX_PALETTE[i++ % MIX_PALETTE.length];
  }
  return map;
}

export function filterOptions(pallets, key) {
  if (key === 'gidon') return [...new Set(pallets.map(p => (p.gidon ? GIDON_YES : GIDON_NO)))];
  return [...new Set(pallets.map(p => p[key]))];
}

export function hasCertificate(p) {
  return p.cardId !== undefined && p.cardId !== null && String(p.cardId).trim() !== '' && Number(p.cardId) !== 0;
}

// Only unsent pallets without a certificate number can be deleted (the server enforces it too).
export function canDelete(p) {
  return !!p && !p.sent && (p.cardId === '' || p.cardId == null);
}
