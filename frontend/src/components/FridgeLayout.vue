<template>
  <div class="h-full flex flex-col gap-2 text-right" dir="rtl">
    <div class="flex shrink-0 items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-slate-800">מקרר</h1>
      <div v-if="banner" :class="['flex items-center gap-2 rounded-xl border px-3 py-1 text-sm font-bold', banner.cls]">
        <span>{{ banner.text }}</span>
        <button type="button" @click="resetMode" class="rounded border bg-white px-2 py-0.5 text-xs">ביטול</button>
      </div>
    </div>

    <LoadingState v-if="loading" message="טוען את המקרר..." />
    <ErrorState v-else-if="error && !Object.keys(cells).length" title="טעינת המקרר נכשלה" :message="error.message || ''" @retry="refresh" />
    <div v-else class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_18rem] gap-3">
      <div class="min-h-0 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <FridgeGrid :cells="cells" :pallets="pallets" :tints="tints" :selected-slot="mode === 'moving' ? moveFrom : null"
          :targeting="mode !== 'idle'" @select="onSlot" @clear="clearSlot" />
      </div>
      <aside class="min-h-0 flex flex-col gap-3">
        <div class="card p-3! flex-1 min-h-0">
          <FridgePlacePanel ref="panel" :farmers="farmers" :cells="cells" :picked="picked" :default-farmer="selectedFarmer" @pick="onPick" />
        </div>
        <div class="card p-3! shrink-0"><FridgeStats :cells="cells" /></div>
      </aside>
    </div>

    <div v-if="detail && detailCell" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" @click.self="detail = null">
      <div role="dialog" :aria-label="`תא ${detail}`" class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 class="mb-3 text-base font-bold text-slate-800">תא {{ detail }} · משטח {{ detailCell.palletNumber }}</h3>
        <dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-slate-500">חקלאי</dt><dd>{{ detailCell.farmer }}</dd>
          <template v-if="detailSummary && detailSummary.kinds.length">
            <dt class="text-slate-500">זן / גודל</dt><dd>{{ detailSummary.kinds.join('/') }} · {{ detailSummary.sizes.join('/') }}</dd>
            <dt class="text-slate-500">ארגזים</dt><dd>{{ detailSummary.boxes }}</dd>
          </template>
          <dt class="text-slate-500">מצב</dt><dd>{{ statusLabel }}</dd>
          <dt class="text-slate-500">שובץ</dt><dd>{{ detailCell.placedBy }} · {{ placedAtText }}</dd>
        </dl>
        <div class="flex gap-2">
          <button type="button" class="btn-primary" @click="startMove">העבר</button>
          <button type="button" class="btn-danger" @click="clearSlot(detail)">פנה תא</button>
          <button type="button" class="btn-ghost" @click="detail = null">סגור</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, inject } from 'vue';
import LoadingState from './shared/LoadingState.vue';
import ErrorState from './shared/ErrorState.vue';
import FridgeGrid from './fridge/FridgeGrid.vue';
import FridgePlacePanel from './fridge/FridgePlacePanel.vue';
import FridgeStats from './fridge/FridgeStats.vue';
import { useFridgeRoom } from '../composables/useFridgeRoom';
import { useNotification } from '../composables/useNotification';
import { requestConfirm } from '../composables/useDialogs';
import { ROOM_ID, palletKey, farmerTints, FLAG_LABELS } from '../utils/fridgeView';

export default {
  components: { LoadingState, ErrorState, FridgeGrid, FridgePlacePanel, FridgeStats },
  setup() {
    const config = inject('config');
    const selectedFarmer = inject('selectedFarmer', ref(''));
    const { notify } = useNotification();
    const { cells, pallets, loading, error, refresh, run } = useFridgeRoom(ROOM_ID);

    const mode = ref('idle'); // 'idle' | 'placing' | 'moving'
    const picked = ref(null); // { farmer, palletNumber } while placing
    const moveFrom = ref(null);
    const detail = ref(null); // slot whose sheet is open
    const busy = ref(false);
    const panel = ref(null);

    const farmers = computed(() => config.farmers || []);
    const tints = computed(() => farmerTints(farmers.value, cells.value));
    const detailCell = computed(() => (detail.value ? cells.value[detail.value] : null));
    const detailSummary = computed(() => (detailCell.value ? pallets.value[palletKey(detailCell.value.farmer, detailCell.value.palletNumber)] : null));
    const statusLabel = computed(() => FLAG_LABELS[detailSummary.value?.status] || 'במקרר');
    const placedAtText = computed(() => (detailCell.value?.placedAt ? new Date(detailCell.value.placedAt).toLocaleString('he-IL') : ''));
    const banner = computed(() => {
      if (mode.value === 'placing') return { text: `נבחר משטח ${picked.value.palletNumber} (${picked.value.farmer}) — הקש על תא פנוי`, cls: 'border-blue-200 bg-blue-50 text-blue-800' };
      if (mode.value === 'moving') return { text: `העברת משטח מתא ${moveFrom.value} — הקש על תא פנוי`, cls: 'border-amber-200 bg-amber-50 text-amber-800' };
      return null;
    });

    function resetMode() { mode.value = 'idle'; picked.value = null; moveFrom.value = null; }

    // One operation at a time; on any error show the server's Hebrew message and re-read the room.
    async function send(op, okMessage) {
      if (busy.value) return;
      busy.value = true;
      try {
        await run(op);
        notify(okMessage, 'success');
        resetMode();
      } catch (e) {
        notify(e.message || 'הפעולה נכשלה', 'error');
        resetMode();
        refresh();
        panel.value?.reload();
      } finally {
        busy.value = false;
      }
    }

    function onPick(p) { mode.value = 'placing'; picked.value = p; moveFrom.value = null; }

    function onSlot(slot) {
      const occupied = !!cells.value[slot];
      if (mode.value === 'placing') {
        if (occupied) return; // banner says: tap an empty slot
        const { farmer, palletNumber } = picked.value;
        return send({ op: 'place', slot, farmer, palletNumber }, `משטח ${palletNumber} שובץ בתא ${slot}`);
      }
      if (mode.value === 'moving') {
        if (slot === moveFrom.value) return resetMode();
        if (occupied) return;
        return send({ op: 'move', from: moveFrom.value, to: slot }, `המשטח הועבר לתא ${slot}`);
      }
      if (occupied) detail.value = slot;
    }

    function startMove() { moveFrom.value = detail.value; mode.value = 'moving'; picked.value = null; detail.value = null; }

    async function clearSlot(slot) {
      detail.value = null;
      const c = cells.value[slot];
      if (!c) return;
      const ok = await requestConfirm({ title: 'פינוי תא', message: `לפנות את תא ${slot} (משטח ${c.palletNumber}, ${c.farmer})?`, variant: 'red' });
      if (ok) send({ op: 'clear', slot }, `תא ${slot} פונה`);
    }

    return {
      cells, pallets, loading, error, refresh, mode, picked, moveFrom, detail, panel,
      farmers, tints, detailCell, detailSummary, statusLabel, placedAtText, banner, selectedFarmer,
      resetMode, onPick, onSlot, startMove, clearSlot,
    };
  },
};
</script>
