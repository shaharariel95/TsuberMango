<template>
  <div class="h-full min-h-0 flex flex-col gap-2">
    <h2 class="text-sm font-bold text-slate-700">שיבוץ משטח</h2>
    <select v-model="farmer" aria-label="חקלאי" class="select-field">
      <option value="">כל החקלאים</option>
      <option v-for="f in farmers" :key="f" :value="f">{{ f }}</option>
    </select>
    <input v-model="query" type="search" inputmode="numeric" placeholder="מספר משטח" aria-label="חיפוש משטח" class="input-field" />
    <div class="flex-1 min-h-0 overflow-auto flex flex-col gap-1.5">
      <p v-if="loading" class="py-4 text-center text-sm text-slate-400">טוען משטחים...</p>
      <p v-else-if="!groups.length" class="py-4 text-center text-sm text-slate-400">אין משטחים זמינים לשיבוץ</p>
      <template v-for="g in groups" :key="g.farmer">
        <div class="flex shrink-0 items-center gap-1.5 pt-1 text-xs font-bold text-slate-500">
          <span :class="['h-2.5 w-2.5 shrink-0 rounded-full', colorOf(g.farmer).dot]"></span>
          <span class="truncate">{{ g.farmer }}</span>
          <span class="text-slate-400">({{ g.pallets.length }})</span>
        </div>
        <button v-for="p in g.pallets" :key="g.farmer + '__' + p.palletNumber" type="button"
          :data-pallet="p.palletNumber" :data-farmer="g.farmer"
          @click="$emit('pick', { farmer: g.farmer, palletNumber: p.palletNumber })"
          @pointerdown="$emit('press', $event, { farmer: g.farmer, palletNumber: p.palletNumber })"
          :class="['tap-target flex shrink-0 touch-none select-none items-center gap-2 rounded-xl border px-3 py-1.5 text-right text-sm transition-colors',
            isPicked(g.farmer, p) ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-mango-300']">
          <span :class="['h-3 w-3 shrink-0 rounded-full ring-2 ring-white', colorOf(g.farmer).dot]"></span>
          <span class="font-mono font-bold">{{ p.palletNumber }}</span>
          <span class="truncate">{{ p.kinds.join('/') }} · {{ p.boxes }} ארגזים</span>
          <span v-if="p.mixed" class="rounded bg-slate-100 px-1 text-[10px] text-slate-600">מעורב</span>
          <span v-if="p.weightMissing" class="rounded bg-amber-100 px-1 text-[10px] text-amber-800">חסר משקל</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { listRecords } from '../../api/records';
import { eligibleByFarmer } from '../../utils/fridgeView';
import { useNotification } from '../../composables/useNotification';

const NO_COLOR = { dot: 'bg-slate-400' };

export default {
  emits: ['pick', 'press'],
  props: {
    farmers: { type: Array, required: true },
    cells: { type: Object, required: true },
    colors: { type: Object, required: true },
    picked: { type: Object, default: null },
  },
  setup(props) {
    const { notify } = useNotification();
    const farmer = ref(''); // '' = all farmers; the select only filters, every farmer is always loaded
    const query = ref('');
    const recordsByFarmer = ref({});
    const loading = ref(false);
    let seq = 0;

    // Load every active farmer's records in parallel; a failing farmer shows a toast and the rest
    // still render. Results from an older load (farmers list changed, reload) are dropped.
    async function load() {
      const mine = ++seq;
      const list = [...props.farmers];
      if (!list.length) { recordsByFarmer.value = {}; return; }
      loading.value = true;
      const results = await Promise.allSettled(list.map(f => listRecords(f)));
      if (mine !== seq) return;
      const next = {};
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[list[i]] = r.value;
        else failed.push({ farmer: list[i], e: r.reason });
      });
      recordsByFarmer.value = next;
      loading.value = false;
      if (failed.length) {
        const e = failed[0].e || {};
        const why = e.status ? (e.message || 'טעינת המשטחים נכשלה') : 'אין חיבור לשרת — נסה שוב';
        notify(`${why} (${failed.map(x => x.farmer).join(', ')})`, 'error');
      }
    }
    watch(() => props.farmers.join('\u0000'), load, { immediate: true });
    watch(() => props.farmers, (list) => { if (farmer.value && !list.includes(farmer.value)) farmer.value = ''; });

    const groups = computed(() => {
      const all = eligibleByFarmer(recordsByFarmer.value, props.cells, query.value);
      return farmer.value ? all.filter(g => g.farmer === farmer.value) : all;
    });
    const colorOf = (f) => props.colors[f] || NO_COLOR;
    const isPicked = (f, p) => !!props.picked && props.picked.farmer === f && String(props.picked.palletNumber) === String(p.palletNumber);
    return { farmer, query, loading, groups, colorOf, isPicked, reload: load };
  },
};
</script>
