// Apply one realtime pallet change to a view's list (mutates `list`). Returns the id to flash,
// or null. A soft-deleted pallet (deleted: true) is removed and never added.
export function applyPallet(list, p, filter) {
  const idx = list.findIndex(x => x.id === p.id)
  if (p.deleted) { if (idx !== -1) list.splice(idx, 1); return null }
  const passes = !filter || filter(p)
  if (idx !== -1 && !passes) { list.splice(idx, 1); return null }
  if (idx !== -1)             { list[idx] = { ...list[idx], ...p }; return p.id }
  if (idx === -1 && passes)   { list.push(p); return p.id }
  return null
}
