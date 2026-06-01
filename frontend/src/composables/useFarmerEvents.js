import { ref, watch, onUnmounted, isRef } from 'vue'
import { db } from '../main'
import { doc, onSnapshot } from 'firebase/firestore'

export function useFarmerEvents(farmer, pallets, options = {}) {
  // options.currentUserEmail — Ref<string>, used for echo suppression
  // options.filter          — (pallet) => boolean, rows this view should show
  const highlightedIds = ref(new Set())
  let unsubscribe = null

  function flash(ids) {
    ids.forEach(id => highlightedIds.value.add(id))
    setTimeout(() => ids.forEach(id => highlightedIds.value.delete(id)), 3000)
  }

  function applyOne(p, list) {
    const { filter } = options
    const idx = list.findIndex(x => x.id === p.id)
    const passes = !filter || filter(p)
    if (idx !== -1 && !passes) { list.splice(idx, 1); return null }
    if (idx !== -1)             { list[idx] = { ...list[idx], ...p }; return p.id }
    if (idx === -1 && passes)   { list.push(p); return p.id }
    return null
  }

  function applyEvent(event) {
    if (options.currentUserEmail?.value &&
        event.updatedBy === options.currentUserEmail.value) return

    const list = pallets.value
    const flashed = []

    switch (event.type) {
      case 'create':
      case 'update': {
        const id = applyOne(event.pallet, list)
        if (id != null) flashed.push(id)
        break
      }
      case 'bulk_update':
        event.pallets.forEach(p => {
          const id = applyOne(p, list)
          if (id != null) flashed.push(id)
        })
        break
      case 'reset_sent':
        event.palletIds.forEach(id => {
          const idx = list.findIndex(x => x.id === id)
          if (idx === -1) return
          const updated = { ...list[idx], sent: false }
          const keep = !options.filter || options.filter(updated)
          keep ? (list[idx] = updated) : list.splice(idx, 1)
        })
        break
      case 'mark_destination':
        event.pallets.forEach(p => {
          const idx = list.findIndex(x => x.id === p.id)
          const passes = !options.filter || options.filter({ ...p, mark: event.newValue })
          if (idx !== -1 && !passes) { list.splice(idx, 1) }
          else if (idx !== -1) { list[idx] = { ...list[idx], mark: event.newValue }; flashed.push(p.id) }
          else if (idx === -1 && passes) { list.push({ ...p, mark: event.newValue }); flashed.push(p.id) }
        })
        break
    }

    if (flashed.length) flash(flashed)
  }

  function subscribe(farmerName) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    if (!farmerName) return
    const docRef = doc(db, 'farmer_events', farmerName)
    let isFirstSnapshot = true
    unsubscribe = onSnapshot(
      docRef,
      snap => {
        if (isFirstSnapshot) { isFirstSnapshot = false; return }
        if (!snap.exists()) return
        try {
          applyEvent(snap.data())
        } catch (err) {
          console.error(`[useFarmerEvents] applyEvent failed for "${farmerName}":`, err)
        }
      },
      err => console.error(`[useFarmerEvents] snapshot error for "${farmerName}":`, err)
    )
  }

  watch(() => isRef(farmer) ? farmer.value : farmer, subscribe, { immediate: true })
  onUnmounted(() => { if (unsubscribe) unsubscribe() })

  return { highlightedIds }
}
