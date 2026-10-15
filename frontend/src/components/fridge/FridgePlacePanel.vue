<template>
  <div class="h-full min-h-0 flex flex-col gap-2">
    <h2 class="text-sm font-bold text-slate-700">שיבוץ משטח</h2>
    <select v-model="farmer" aria-label="חקלאי" class="select-field">
      <option v-for="f in farmers" :key="f" :value="f">{{ f }}</option>
    </select>
    <input v-model="query" type="search" inputmode="numeric" placeholder="מספר משטח" aria-label="חיפוש משטח" class="input-field" />
    <div class="flex-1 min-h-0 overflow-auto flex flex-col gap-1.5">
      <p v-if="loading" class="py-4 text-center text-sm text-slate-400">טוען משטחים...</p>
      <p v-else-if="!eligible.length" class="py-4 text-center text-sm text-slate-400">אין משטחים זמינים לשיבוץ</p>
      <button v-for="p in eligible" :key="p.palletNumber" type="button" :data-pallet="p.palletNumber"
        @click="$emit('pick', { farmer, palletNumber: p.palletNumber })"
        :class="['tap-target flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-right text-sm transition-colors',
          isPicked(p) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-mango-300']">
        <span class="font-mono font-bold">{{ p.palletNumber }}</span>
        <span class="truncate">{{ p.kinds.join('/') }} · {{ p.boxes }} ארגזים</span>
        <span v-if="p.mixed" class="rounded bg-slate-100 px-1 text-[10px] text-slate-600">מעורב</span>
        <span v-if="p.weightMissing" class="rounded bg-amber-100 px-1 text-[10px] text-amber-800">חסר משקל</span>
      </button>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { listRecords } from '../../api/records';
import { eligiblePallets } from '../../utils/fridgeView';
import { useNotification } from '../../composables/useNotification';

export default {
  emits: ['pick'],
  props: {
    farmers: { type: Array, required: true },
    cells: { type: Object, required: true },
    picked: { type: Object, default: null },
    defaultFarmer: { type: String, default: '' },
  },
  setup(props) {
    const { notify } = useNotification();
    const farmer = ref(props.defaultFarmer || props.farmers[0] || '');
    const query = ref('');
    const records = ref([]);
    const loading = ref(false);

    async function load() {
      if (!farmer.value) { records.value = []; return; }
      loading.value = true;
      try { records.value = await listRecords(farmer.value); }
      catch (e) { notify(e.message || 'טעינת המשטחים נכשלה', 'error'); records.value = []; }
      finally { loading.value = false; }
    }
    watch(farmer, load, { immediate: true });
    watch(() => props.farmers, (list) => { if (!farmer.value && list.length) farmer.value = list[0]; });

    const eligible = computed(() => eligiblePallets(records.value, farmer.value, props.cells, query.value));
    const isPicked = (p) => props.picked && props.picked.farmer === farmer.value && String(props.picked.palletNumber) === String(p.palletNumber);
    return { farmer, query, loading, eligible, isPicked, reload: load };
  },
};
</script>
