<template>
  <div role="button" tabindex="0" :aria-label="`תא ${slotId}`" :data-slot="slotId" :data-state="cell ? 'occupied' : 'empty'"
    :data-status="summary?.status || ''" @click="$emit('select', slotId)" @keydown.enter="$emit('select', slotId)"
    @pointerdown="cell && $emit('press', $event, slotId)"
    :class="['relative h-full min-h-0 rounded-xl border-2 py-0.5 pl-1.5 flex flex-col justify-between overflow-hidden cursor-pointer select-none transition-colors',
      cell ? 'pr-3.5 touch-none' : 'pr-1.5',
      !cell ? (dropHover ? 'border-solid border-blue-500 bg-blue-100 ring-4 ring-blue-300'
          : targeting ? 'border-dashed border-mango-400 bg-mango-50' : 'border-dashed border-slate-300 bg-white/80')
        : flagged ? 'border-red-400 bg-red-50' : [color.tint, color.border],
      dragging ? 'opacity-40' : '',
      selected ? 'ring-4 ring-blue-500' : '']">
    <!-- Farmer colour band on the start side (RTL: right edge). -->
    <span v-if="cell" :class="['absolute inset-y-0 right-0 w-2', color.band]" aria-hidden="true"></span>
    <span class="absolute top-0.5 left-1 text-[10px] font-bold font-mono text-slate-400">{{ slotId }}</span>
    <template v-if="cell">
      <!-- Content budget ~60px at 1280x800: number+farmer line, optional kinds line (not for flagged slots),
           one badge line. If space runs short, the kinds line is the first thing to drop. -->
      <div class="flex min-w-0 items-baseline gap-1.5 ml-5">
        <span class="text-xl font-extrabold leading-tight text-slate-900">{{ cell.palletNumber }}</span>
        <span class="truncate text-sm font-semibold leading-tight text-slate-700">{{ cell.farmer }}</span>
      </div>
      <div v-if="summary && summary.kinds.length && !flagged" class="truncate text-[11px] leading-tight text-slate-600">
        {{ summary.kinds.join('/') }} · {{ summary.sizes.join('/') }} · {{ summary.boxes }} ארגזים
      </div>
      <div v-if="flagged || summary?.mark || summary?.weightMissing" class="flex min-w-0 items-center gap-1">
        <span v-if="flagged" class="whitespace-nowrap rounded bg-red-600 px-1 text-[10px] font-bold leading-tight text-white">{{ flagLabel }}</span>
        <span v-if="summary?.mark && !flagged" class="whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-bold leading-tight text-amber-800">סומן למשלוח</span>
        <span v-if="summary?.weightMissing && !flagged" class="whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-bold leading-tight text-amber-800">חסר משקל</span>
        <button v-if="flagged" type="button" @click.stop="$emit('clear', slotId)" @keydown.enter.stop
          class="mr-auto whitespace-nowrap rounded border border-red-300 bg-white px-1.5 text-[10px] font-bold leading-tight text-red-700">פנה תא</button>
      </div>
    </template>
  </div>
</template>

<script>
import { FLAG_LABELS, isFlagged } from '../../utils/fridgeView';

export default {
  emits: ['select', 'clear', 'press'],
  props: {
    slotId: { type: String, required: true }, // not `slot`: reserved-looking attribute on components
    cell: { type: Object, default: null },
    summary: { type: Object, default: null },
    color: { type: Object, default: () => ({ band: 'bg-slate-400', tint: 'bg-white', border: 'border-slate-300' }) },
    dropHover: { type: Boolean, default: false }, // a drag is over this (empty) slot
    dragging: { type: Boolean, default: false }, // this slot is the drag source
    selected: { type: Boolean, default: false },
    targeting: { type: Boolean, default: false },
  },
  computed: {
    flagged() { return isFlagged(this.summary); },
    flagLabel() { return this.summary ? FLAG_LABELS[this.summary.status] : ''; },
  },
};
</script>
