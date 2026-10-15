// fridgeView.js — pure helpers for the fridge (cold-room) page: which pallets can be placed, room
// stats, status flags and per-farmer tints. No Vue, no I/O. The grid itself is fixed (room 'main', 5×8).
export const ROOM_ID = 'main';
export const COLS = ['A', 'B', 'C', 'D', 'E'];
export const ROWS = 8;
export const CAPACITY = COLS.length * ROWS;

export const palletKey = (farmer, palletNumber) => `${farmer}__${palletNumber}`;

const uniq = (values) => [...new Set(values.filter(v => v !== '' && v != null))];

// A farmer's pallets that can go into the fridge: not deleted, not fully sent, not already on the map.
// A mixed pallet (several records, one number) is one entry. Marked / partly sent pallets are included.
export function eligiblePallets(records, farmer, cells, query = '') {
  const placed = new Set(Object.values(cells).filter(c => c.farmer === farmer).map(c => String(c.palletNumber)));
  const q = String(query).trim();
  const groups = new Map();
  for (const r of records) {
    if (r.deleted === true) continue;
    const k = String(r.palletNumber);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [k, recs] of groups) {
    if (placed.has(k) || recs.every(r => r.sent === true)) continue;
    if (q && !k.includes(q)) continue;
    out.push({
      palletNumber: recs[0].palletNumber,
      kinds: uniq(recs.map(r => r.kind)),
      boxes: recs.reduce((n, r) => n + (Number(r.boxes) || 0), 0),
      mixed: recs.length > 1,
      mark: recs.some(r => r.mark === true),
      weightMissing: recs.some(r => !(Number(r.weight) > 0)),
    });
  }
  return out.sort((a, b) => Number(a.palletNumber) - Number(b.palletNumber));
}

export function roomStats(cells) {
  const list = Object.values(cells);
  const occupied = list.length;
  const rate = (occupied / CAPACITY) * 100;
  const counts = new Map();
  list.forEach(c => counts.set(c.farmer, (counts.get(c.farmer) || 0) + 1));
  const perFarmer = [...counts].map(([farmer, count]) => ({ farmer, count })).sort((a, b) => b.count - a.count);
  return { occupied, capacity: CAPACITY, rate, level: rate < 50 ? 'low' : rate < 85 ? 'mid' : 'high', perFarmer };
}

export const FLAG_LABELS = { sent: 'נשלח', partly_sent: 'נשלח חלקית', deleted: 'נמחק', missing: 'לא נמצא' };
export const isFlagged = (summary) => !!summary && summary.status in FLAG_LABELS;

// Literal class strings so Tailwind keeps them.
const TINTS = [
  'bg-sky-50 border-sky-300', 'bg-emerald-50 border-emerald-300', 'bg-violet-50 border-violet-300',
  'bg-orange-50 border-orange-300', 'bg-pink-50 border-pink-300', 'bg-teal-50 border-teal-300',
  'bg-lime-50 border-lime-300', 'bg-indigo-50 border-indigo-300',
];
export function farmerTints(farmers, cells) {
  const names = [...farmers];
  Object.values(cells).forEach(c => { if (!names.includes(c.farmer)) names.push(c.farmer); });
  return Object.fromEntries(names.map((f, i) => [f, TINTS[i % TINTS.length]]));
}
