<template>
    <div class="flex items-center justify-between gap-x-3 gap-y-2 mb-2 rtl flex-wrap">
        <div class="flex items-center gap-2 flex-wrap min-w-0">
            <!-- Hidden on the tablet layout (≤1366px, same as App.vue isMobile; max-[1367px] means width < 1367), where the top bar already shows title + farmer -->
            <div class="flex items-center gap-2 max-[1367px]:hidden">
                <h2 v-if="title" class="text-lg font-bold text-slate-800 truncate">{{ title }}</h2>
                <span class="text-sm font-semibold bg-mango-50 text-mango-800 border border-mango-200 rounded-lg px-2.5 py-1 shrink-0">{{ farmer }}</span>
            </div>
            <span class="text-sm font-bold bg-slate-100 text-slate-600 rounded-lg px-2.5 py-1 shrink-0">{{ palletCount }} משטחים</span>
        </div>
        <div v-if="showActions" class="flex flex-wrap gap-1.5 items-center shrink-0">
            <button v-if="!isEditable" @click="$emit('return-sent')" :disabled="!hasSelection"
                class="btn-primary text-sm min-h-[36px] px-3">
                החזר משטחים נשלחו
            </button>
            <template v-if="isEditable">
                <SpinnerButton @click="$emit('print-sticker')"
                    :loading="busy" :inverted="false" :disabled="selectedCount !== 1"
                    class="btn-ghost text-sm border border-slate-200 flex items-center gap-1.5 min-h-[36px] px-3">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    הפק מדבקה
                </SpinnerButton>
                <SpinnerButton @click="$emit('mark', true)"
                    :loading="busy" :disabled="!hasSelection"
                    class="btn-primary text-sm bg-linear-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 min-h-[36px] px-3">
                    העבר למשלוח
                </SpinnerButton>
                <SpinnerButton @click="$emit('mark', false)"
                    :loading="busy" :inverted="false" :disabled="!hasSelection"
                    class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                    הורד ממשלוח
                </SpinnerButton>
                <div class="flex items-center gap-1.5" data-testid="bulk-date">
                    <input type="date" :value="shipmentDate" @input="$emit('update:shipmentDate', $event.target.value)"
                        aria-label="תאריך משלוח לכל הנבחרים" :disabled="!hasSelection"
                        class="border border-slate-200 rounded-lg text-sm px-2 py-1 min-h-[36px] bg-white disabled:opacity-50" />
                    <SpinnerButton @click="$emit('apply-date')"
                        :loading="applyingDate" :inverted="false" :disabled="!hasSelection"
                        class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                        החל על הכל
                    </SpinnerButton>
                </div>
                <SpinnerButton @click="$emit('issue-certificate')"
                    :loading="busy" :disabled="!hasSelection"
                    class="btn-primary text-sm min-h-[36px] px-3">
                    צור תעודת משלוח
                </SpinnerButton>
                <button @click="$emit('toggle-sent-view')"
                    class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                    {{ sentView ? 'הצג משטחים שנשלחו' : 'הסתר משטחים שנשלחו' }}
                </button>
            </template>
        </div>
    </div>
</template>

<script>
import SpinnerButton from './shared/SpinnerButton.vue';

// PalletTable's header row: title/farmer/count on one side, bulk actions on the other.
// Pure presentation: every action is an event; PalletTable owns the state and API calls.
export default {
    components: { SpinnerButton },
    props: {
        title: { type: String, default: '' },
        farmer: { type: String, required: true },
        palletCount: { type: Number, required: true },
        isEditable: { type: Boolean, default: true },
        showActions: { type: Boolean, default: true },
        selectedCount: { type: Number, default: 0 },
        busy: { type: Boolean, default: false },
        applyingDate: { type: Boolean, default: false },
        sentView: { type: Boolean, default: false },
        shipmentDate: { type: String, default: '' },
    },
    emits: ['return-sent', 'print-sticker', 'mark', 'apply-date', 'issue-certificate', 'toggle-sent-view', 'update:shipmentDate'],
    computed: {
        hasSelection() { return this.selectedCount > 0; },
    },
};
</script>
