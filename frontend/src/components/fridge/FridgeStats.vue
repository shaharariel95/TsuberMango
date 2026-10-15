<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-4">
      <div class="relative h-16 w-16 shrink-0">
        <svg class="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="transparent" stroke-width="6" class="stroke-slate-100" />
          <circle cx="40" cy="40" r="34" fill="transparent" stroke-width="6" stroke-linecap="round" :class="ringClass"
            :stroke-dasharray="circumference" :stroke-dashoffset="circumference * (1 - stats.rate / 100)" />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-base font-bold leading-none text-slate-800" data-testid="fridge-occupied">{{ stats.occupied }}</span>
          <span class="text-[10px] text-slate-400">מתוך {{ stats.capacity }}</span>
        </div>
      </div>
      <div>
        <div class="text-xs font-bold text-slate-400">תפוסה</div>
        <div class="text-2xl font-extrabold text-slate-800">{{ Math.round(stats.rate) }}%</div>
      </div>
    </div>
    <div v-if="stats.perFarmer.length" class="flex max-h-20 flex-col gap-1 overflow-auto text-xs">
      <div v-for="f in stats.perFarmer" :key="f.farmer" class="flex shrink-0 items-center justify-between rounded-lg bg-slate-50 px-2 py-0.5">
        <span class="truncate font-bold text-slate-700">{{ f.farmer }}</span>
        <span class="rounded bg-slate-200 px-1.5 font-bold text-slate-800">{{ f.count }}</span>
      </div>
    </div>
    <p v-else class="text-center text-sm text-slate-400">המקרר ריק</p>
  </div>
</template>

<script>
import { roomStats } from '../../utils/fridgeView';

const RING = { low: 'stroke-emerald-500', mid: 'stroke-amber-500', high: 'stroke-red-500' };

export default {
  props: { cells: { type: Object, required: true } },
  computed: {
    stats() { return roomStats(this.cells); },
    ringClass() { return RING[this.stats.level]; },
    circumference() { return 2 * Math.PI * 34; },
  },
};
</script>
