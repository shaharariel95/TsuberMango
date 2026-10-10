<template>
    <tr :data-id="pallet.id"
        :class="[
            'text-center text-sm transition-colors duration-100 bg-white hover:bg-mango-50/40',
            highlightMissingWeight && !pallet.weight ? 'bg-amber-50' : '',
            flash ? 'animate-pallet-flash' : '',
            pallet._isContext ? 'opacity-50 italic' : '',
            (pallet._isGroupLeader || pallet._isContext) ? 'cursor-pointer' : ''
        ]"
        :title="pallet._isContext ? 'מוצג כחלק ממשטח מעורב' : undefined"
        :style="mixColor ? { 'border-right': `4px solid ${mixColor.border}` } : {}"
        @click="(pallet._isGroupLeader || pallet._isContext) && $emit('toggle-collapse', pallet.palletNumber)">
        <template v-if="editing && draft">
            <td v-for="col in columns" :key="col.key" :data-col="col.key" class="h-11 align-middle border-b border-[#b2b8c1] px-2 py-1">
                <template v-if="col.editable">
                    <select v-if="col.key === 'kind'" v-model="draft.kind" class="input-field text-sm p-1.5!">
                        <option v-for="kind in kinds" :key="kind" :value="kind">{{ kind }}</option>
                    </select>
                    <select v-else-if="col.key === 'size'" v-model="draft.size" class="input-field text-sm p-1.5!">
                        <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
                    </select>
                    <div v-else-if="col.key === 'destination'">
                        <input type="text" v-model="destinationFilterText" placeholder="סנן יעד..."
                            class="input-field text-sm p-1.5! mb-1" />
                        <select v-model="draft.destination" class="input-field text-sm p-1.5!">
                            <option v-for="destination in filteredDestinations" :key="destination" :value="destination">{{ destination }}</option>
                        </select>
                    </div>
                    <input v-else-if="col.key === 'gidon' || col.key === 'sent'" type="checkbox" v-model="draft[col.key]"
                        class="w-5 h-5 rounded-sm border-slate-300 text-mango-500 focus:ring-mango-400" />
                    <input v-else-if="col.key === 'shipmentDate'" type="date" v-model="draft.shipmentDate" class="input-field text-sm p-1.5!" />
                    <input v-else-if="col.key === 'palletNumber'" type="number" v-model="draft.palletNumber" class="input-field text-sm p-1.5!" />
                    <input v-else v-model="draft[col.key]" class="input-field text-sm p-1.5!" />
                </template>
                <input v-else-if="col.key === 'selected'" type="checkbox" :checked="selected" @change="$emit('toggle-select', pallet.id)"
                    class="w-5 h-5 rounded-sm border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                <template v-else>{{ pallet[col.key] }}</template>
            </td>
            <td class="h-11 align-middle border-b border-[#b2b8c1] px-2 py-1">
                <div class="flex flex-col gap-1">
                    <button v-if="!saving" @click="$emit('save', draft)"
                        class="text-xs px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium transition-colors min-h-[32px]">
                        שמור
                    </button>
                    <button v-else
                        class="text-xs px-2 py-1.5 rounded-md bg-mango-50 text-mango-600 font-medium flex items-center justify-center min-h-[32px]">
                        <span class="loading-spinner w-3! h-3!"></span>
                    </button>
                    <button @click="$emit('cancel')"
                        class="text-xs px-2 py-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 font-medium transition-colors min-h-[32px]">
                        ביטול
                    </button>
                    <button v-if="canDelete" @click="$emit('delete')" :disabled="saving"
                        class="text-xs px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors min-h-[32px]">
                        מחק
                    </button>
                </div>
            </td>
        </template>
        <template v-else>
            <td v-for="col in columns" :key="col.key" :data-col="col.key" class="h-11 align-middle border-b border-[#b2b8c1] px-3 py-1">
                <input v-if="col.key === 'selected' && !pallet._isContext" type="checkbox" :checked="selected"
                    @click.stop @change="$emit('toggle-select', pallet.id)"
                    class="w-5 h-5 rounded-sm border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                <div v-else-if="col.key === 'sent'" class="flex items-center justify-center gap-1.5">
                    <span :class="[
                        'inline-flex items-center justify-center w-3 h-3 rounded-full shrink-0',
                        pallet.sent ? 'bg-emerald-400 shadow-xs shadow-emerald-200' : 'bg-slate-300'
                    ]"></span>
                    <span v-if="pallet._isGroupLeader" class="text-xs font-medium text-slate-400 select-none">
                        {{ collapsed ? `+${pallet._contextCount}` : '▼' }}
                    </span>
                </div>
                <router-link v-else-if="col.key === 'cardId' && pallet.cardId !== '' && pallet.cardId != null"
                    :to="{ path: '/Certificates', query: { farmer, number: String(pallet.cardId) } }"
                    class="text-mango-700 underline font-medium" @click.stop>{{ pallet.cardId }}</router-link>
                <template v-else-if="col.key !== 'selected'">{{ pallet[col.key] }}</template>
            </td>
            <td v-if="isEditable" class="h-11 align-middle border-b border-[#b2b8c1] px-3 py-1">
                <div class="flex items-center justify-center gap-1.5" @click.stop>
                    <div v-if="pallet.editedBy" class="relative group shrink-0">
                        <span class="text-slate-400 hover:text-slate-600 cursor-default text-sm leading-none select-none">ⓘ</span>
                        <div class="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-10 hidden group-hover:block w-52 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none text-right">
                            <p class="font-semibold mb-0.5">עודכן על ידי:</p>
                            <p class="text-slate-300 mb-1">{{ pallet.editedBy }}</p>
                            <p class="font-semibold mb-0.5">בתאריך:</p>
                            <p class="text-slate-300">{{ editedAtText }}</p>
                        </div>
                    </div>
                    <button v-if="!pallet._isContext" @click="$emit('edit', pallet)"
                        class="text-xs text-mango-600 hover:text-mango-800 font-medium hover:bg-mango-50 px-3 py-1.5 rounded-sm transition-colors min-h-[32px]">
                        ערוך
                    </button>
                </div>
            </td>
        </template>
    </tr>
</template>

<script>
// One PalletTable row: display mode, or inline edit mode with its own draft copy of the record.
// Saving/deleting are events — PalletTable owns the API calls and the pallets array.
export default {
    props: {
        pallet: { type: Object, required: true },   // display row (from utils/palletRows)
        source: { type: Object, default: null },    // the stored record, used to seed the draft
        columns: { type: Array, required: true },
        farmer: { type: String, required: true },
        isEditable: { type: Boolean, default: true },
        editing: { type: Boolean, default: false },
        saving: { type: Boolean, default: false },
        canDelete: { type: Boolean, default: false },
        selected: { type: Boolean, default: false },
        collapsed: { type: Boolean, default: false },
        flash: { type: Boolean, default: false },
        highlightMissingWeight: { type: Boolean, default: false },
        mixColor: { type: Object, default: null },
    },
    emits: ['edit', 'save', 'cancel', 'delete', 'toggle-select', 'toggle-collapse'],
    inject: ['config'],
    data() {
        return { draft: null, destinationFilterText: '' };
    },
    watch: {
        editing: {
            immediate: true,
            handler(on) {
                const raw = this.source || this.pallet;
                this.draft = on ? { ...raw, sent: !!raw.sent, gidon: !!raw.gidon } : null;
                this.destinationFilterText = '';
            },
        },
    },
    computed: {
        kinds() { return this.config.kinds || []; },
        sizes() { return this.config.sizes || []; },
        filteredDestinations() {
            const all = this.config.destinations || [];
            if (!this.destinationFilterText) return all;
            const text = this.destinationFilterText.toLowerCase();
            return all.filter(dest => dest.toLowerCase().includes(text));
        },
        editedAtText() {
            const iso = this.pallet.editedAt;
            if (!iso) return '';
            try { return new Date(iso).toLocaleString('he-IL'); } catch { return iso; }
        },
    },
};
</script>
