<template>
  <div class="h-full flex flex-col gap-1.5">
    <div class="grid grid-cols-[2rem_repeat(5,minmax(0,1fr))] gap-1.5 text-center text-xs font-bold text-slate-400">
      <div></div>
      <div v-for="c in cols" :key="c">{{ c }}</div>
    </div>
    <div class="flex-1 min-h-0 grid grid-rows-8 gap-1">
      <div v-for="r in rows" :key="r" class="grid grid-cols-[2rem_repeat(5,minmax(0,1fr))] gap-1.5 min-h-0">
        <div class="flex items-center justify-center text-sm font-bold text-slate-500">{{ r }}</div>
        <FridgeSlot v-for="c in cols" :key="c + r" :slot-id="c + r" :cell="cells[c + r] || null"
          :summary="summaryFor(cells[c + r])" :tint="cells[c + r] ? tints[cells[c + r].farmer] : undefined"
          :selected="selectedSlot === c + r" :targeting="targeting"
          @select="$emit('select', $event)" @clear="$emit('clear', $event)" />
      </div>
    </div>
    <div class="rounded-xl bg-slate-200 py-0.5 text-center text-xs font-bold tracking-widest text-slate-500">מעבר</div>
  </div>
</template>

<script>
import FridgeSlot from './FridgeSlot.vue';
import { COLS, ROWS, palletKey } from '../../utils/fridgeView';

export default {
  components: { FridgeSlot },
  emits: ['select', 'clear'],
  props: {
    cells: { type: Object, required: true },
    pallets: { type: Object, required: true },
    tints: { type: Object, required: true },
    selectedSlot: { type: String, default: null },
    targeting: { type: Boolean, default: false },
  },
  setup() {
    return { cols: COLS, rows: Array.from({ length: ROWS }, (_, i) => i + 1) };
  },
  methods: {
    summaryFor(cell) { return cell ? this.pallets[palletKey(cell.farmer, cell.palletNumber)] || null : null; },
  },
};
</script>
