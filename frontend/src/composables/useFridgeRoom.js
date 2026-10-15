import { ref, watch, onUnmounted } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../main'
import { centerId } from './useCenter'
import { getRoom, postOp } from '../api/fridge'
import { palletKey } from '../utils/fridgeView'

// Live fridge room: cells come from an onSnapshot on centers/{c}/fridge/{roomId}; the pallet summaries
// (sent / deleted / weight ...) come from GET /api/fridge/:roomId and are refetched when a cell shows a
// pallet without a summary, or when a farmer_events doc changes for a farmer on the map.
export function useFridgeRoom(roomId = 'main') {
  const cells = ref({})
  const pallets = ref({})
  const loading = ref(true)
  const error = ref(null)
  let unsubRoom = null
  const farmerUnsubs = new Map()
  let timer = null
  let disposed = false // set on unmount: late responses must not create listeners or timers

  let cellsAt = null // updatedAt of the room state currently shown (ISO strings compare lexically; null = oldest)

  function hasUnknown() {
    return Object.values(cells.value).some(c => !pallets.value[palletKey(c.farmer, c.palletNumber)])
  }

  // GET / POST results can arrive after a newer snapshot: an older one must not put older cells back.
  function apply(room) {
    if (disposed) return
    const at = room.updatedAt || null
    const older = cellsAt !== null && (at === null || at < cellsAt)
    if (!older) { cells.value = room.cells || {}; cellsAt = at }
    pallets.value = older ? { ...pallets.value, ...(room.pallets || {}) } : (room.pallets || {})
    syncFarmerListeners()
    if (hasUnknown()) scheduleRefresh()
  }

  async function refresh() {
    try {
      apply(await getRoom(roomId))
      error.value = null
    } catch (e) {
      console.error('[useFridgeRoom] refresh failed', e)
      error.value = e
    } finally {
      loading.value = false
    }
  }

  function scheduleRefresh() {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(refresh, 400)
  }

  function stopFarmerListeners() {
    farmerUnsubs.forEach(u => u())
    farmerUnsubs.clear()
  }

  function syncFarmerListeners() {
    if (disposed || !centerId.value) return
    const wanted = new Set(Object.values(cells.value).map(c => c.farmer))
    for (const [f, unsub] of farmerUnsubs) if (!wanted.has(f)) { unsub(); farmerUnsubs.delete(f) }
    for (const f of wanted) {
      if (farmerUnsubs.has(f)) continue
      let first = true // the first fire replays the current doc, not a change
      farmerUnsubs.set(f, onSnapshot(doc(db, 'centers', centerId.value, 'farmer_events', f),
        () => { if (first) { first = false; return } scheduleRefresh() },
        e => console.error(`[useFridgeRoom] farmer_events/${f} listener`, e)))
    }
  }

  function subscribeRoom() {
    if (unsubRoom) { unsubRoom(); unsubRoom = null }
    stopFarmerListeners()
    if (!centerId.value) return
    unsubRoom = onSnapshot(doc(db, 'centers', centerId.value, 'fridge', roomId), snap => {
      const data = snap.exists() ? snap.data() : {}
      const at = data.updatedAt || null
      if (!(at && cellsAt && at < cellsAt)) { cells.value = data.cells || {}; cellsAt = at }
      syncFarmerListeners()
      if (hasUnknown()) scheduleRefresh()
    }, e => { console.error('[useFridgeRoom] room listener', e); unsubRoom = null; error.value = e })
  }

  async function run(op) {
    const room = await postOp(roomId, op)
    apply(room)
    return room
  }

  function retry() {
    subscribeRoom()
    return refresh()
  }

  watch(centerId, subscribeRoom, { immediate: true })
  refresh()

  onUnmounted(() => {
    disposed = true
    if (unsubRoom) unsubRoom()
    stopFarmerListeners()
    clearTimeout(timer)
  })

  return { cells, pallets, loading, error, refresh, retry, run }
}
