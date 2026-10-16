// fridgeView.js — pure helpers for the fridge (cold-room) page: which pallets can be placed, room
// stats, status flags and per-farmer colours. No Vue, no I/O. The grid itself is fixed (room 'main', 5×8).
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

// Strong per-farmer colours, by position in config.farmers (then farmers only seen on the map).
// Literal class strings so Tailwind keeps them. No red hues: red is reserved for flagged slots.
export const FARMER_COLORS = [
  { band: 'bg-blue-600', tint: 'bg-blue-50', dot: 'bg-blue-600', border: 'border-blue-300' },
  { band: 'bg-emerald-500', tint: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-300' },
  { band: 'bg-violet-600', tint: 'bg-violet-50', dot: 'bg-violet-600', border: 'border-violet-300' },
  { band: 'bg-amber-400', tint: 'bg-amber-50', dot: 'bg-amber-400', border: 'border-amber-300' },
  { band: 'bg-cyan-500', tint: 'bg-cyan-50', dot: 'bg-cyan-500', border: 'border-cyan-300' },
  { band: 'bg-fuchsia-500', tint: 'bg-fuchsia-50', dot: 'bg-fuchsia-500', border: 'border-fuchsia-300' },
  { band: 'bg-lime-500', tint: 'bg-lime-50', dot: 'bg-lime-500', border: 'border-lime-400' },
  { band: 'bg-orange-500', tint: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-300' },
  { band: 'bg-slate-700', tint: 'bg-slate-100', dot: 'bg-slate-700', border: 'border-slate-400' },
  { band: 'bg-teal-700', tint: 'bg-teal-50', dot: 'bg-teal-700', border: 'border-teal-300' },
];
export function farmerColors(farmers, cells) {
  const names = [...farmers];
  Object.values(cells).forEach(c => { if (!names.includes(c.farmer)) names.push(c.farmer); });
  return Object.fromEntries(names.map((f, i) => [f, FARMER_COLORS[i % FARMER_COLORS.length]]));
}

// Multi-farmer pick list: [{ farmer, pallets }] in the order of recordsByFarmer's keys, farmers with
// nothing eligible omitted. Two farmers may share a pallet number; each is listed under its own farmer.
export function eligibleByFarmer(recordsByFarmer, cells, query = '') {
  return Object.entries(recordsByFarmer)
    .map(([farmer, records]) => ({ farmer, pallets: eligiblePallets(records || [], farmer, cells, query) }))
    .filter(g => g.pallets.length);
}
