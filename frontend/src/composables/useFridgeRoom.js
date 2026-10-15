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

  function apply(room) {
    cells.value = room.cells || {}
    pallets.value = room.pallets || {}
    syncFarmerListeners()
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
    clearTimeout(timer)
    timer = setTimeout(refresh, 400)
  }

  function stopFarmerListeners() {
    farmerUnsubs.forEach(u => u())
    farmerUnsubs.clear()
  }

  function syncFarmerListeners() {
    if (!centerId.value) return
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
      cells.value = snap.exists() ? (snap.data().cells || {}) : {}
      syncFarmerListeners()
      const unknown = Object.values(cells.value).some(c => !pallets.value[palletKey(c.farmer, c.palletNumber)])
      if (unknown) scheduleRefresh()
    }, e => { console.error('[useFridgeRoom] room listener', e); error.value = e })
  }

  async function run(op) {
    const room = await postOp(roomId, op)
    apply(room)
    return room
  }

  watch(centerId, subscribeRoom, { immediate: true })
  refresh()

  onUnmounted(() => {
    if (unsubRoom) unsubRoom()
    stopFarmerListeners()
    clearTimeout(timer)
  })

  return { cells, pallets, loading, error, refresh, run }
}
