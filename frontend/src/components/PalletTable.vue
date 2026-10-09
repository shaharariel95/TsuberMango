<template>
    <div class="h-full w-full flex flex-col animate-fade-in">
        <!-- Compact Toolbar -->
        <div class="flex items-center justify-between gap-x-3 gap-y-2 mb-2 rtl flex-wrap">
            <div class="flex items-center gap-2 flex-wrap min-w-0">
                <div class="toolbar-identity flex items-center gap-2">
                    <h2 v-if="title" class="text-lg font-bold text-slate-800 truncate">{{ title }}</h2>
                    <span class="text-sm font-semibold bg-mango-50 text-mango-800 border border-mango-200 rounded-lg px-2.5 py-1 flex-shrink-0">{{ farmer }}</span>
                </div>
                <span class="text-sm font-bold bg-slate-100 text-slate-600 rounded-lg px-2.5 py-1 flex-shrink-0">{{ AmountOfPallets }} משטחים</span>
            </div>
            <div class="flex flex-wrap gap-1.5 items-center flex-shrink-0">
                <template v-if="!destinationOnly && !columnsFilter.length">
                    <button @click="returnSentPallets" :disabled="selectedPallets.length === 0"
                        class="btn-primary text-sm min-h-[36px] px-3" v-if="!isEditable">
                        החזר משטחים נשלחו
                    </button>
                    <SpinnerButton v-if="isEditable" @click="printPDF"
                        :loading="isCreatingLabel" :inverted="false"
                        :disabled="selectedPallets.length !== 1"
                        class="btn-ghost text-sm border border-slate-200 flex items-center gap-1.5 min-h-[36px] px-3">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        הפק מדבקה
                    </SpinnerButton>
                    <SpinnerButton v-if="isEditable" @click="confirmBulkAction(true)"
                        :loading="isCreatingLabel" :disabled="selectedPallets.length === 0"
                        class="btn-primary text-sm bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 min-h-[36px] px-3">
                        העבר למשלוח
                    </SpinnerButton>
                    <SpinnerButton v-if="isEditable" @click="confirmBulkAction(false)"
                        :loading="isCreatingLabel" :inverted="false" :disabled="selectedPallets.length === 0"
                        class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                        הורד ממשלוח
                    </SpinnerButton>
                    <div v-if="isEditable" class="flex items-center gap-1.5" data-testid="bulk-date">
                        <input type="date" v-model="bulkShipmentDate" aria-label="תאריך משלוח לכל הנבחרים"
                            :disabled="selectedPallets.length === 0"
                            class="border border-slate-200 rounded-lg text-sm px-2 py-1 min-h-[36px] bg-white disabled:opacity-50" />
                        <SpinnerButton @click="applyShipmentDateToSelected"
                            :loading="isApplyingDate" :inverted="false" :disabled="selectedPallets.length === 0"
                            class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                            החל על הכל
                        </SpinnerButton>
                    </div>
                    <SpinnerButton v-if="isEditable" @click="sendSelectedPallets"
                        :loading="isCreatingLabel" :disabled="isCreateLabelAllowed"
                        class="btn-primary text-sm min-h-[36px] px-3">
                        צור תעודת משלוח
                    </SpinnerButton>
                    <button v-if="isEditable" @click="toggleSentView"
                            class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3">
                        <span v-if="sentView">הצג משטחים שנשלחו</span>
                        <span v-else>הסתר משטחים שנשלחו</span>
                    </button>
                </template>
            </div>
        </div>

        <!-- Search -->
        <div class="mb-2 relative rtl">
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input v-model="searchText" type="text" placeholder="חיפוש בטבלה..."
                class="w-full border border-slate-200 rounded-lg text-sm pr-9 pl-3 py-1.5 min-h-[36px] focus:ring-1 focus:ring-mango-400 focus:border-mango-400 outline-none bg-white" />
        </div>

        <!-- Table -->
        <div class="overflow-auto flex-1 min-h-0 rounded-xl border border-slate-200 bg-white" style="-webkit-overflow-scrolling: touch; padding-bottom: 35vh;">
            <table class="w-full min-w-[1200px] border-collapse rtl">
                <thead>
                    <tr>
                        <th v-for="col in columns" :key="col.key"
                            class="px-3 py-3 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 text-center sticky top-0 z-[2]"
                            :style="col.minWidth ? `min-width: ${col.minWidth}` : ''">
                            <div class="flex items-center flex-col gap-1.5">
                                {{ (col.key === 'selected' && !isEditable) ? 'הורדת סטטוס נשלח' : col.label }}
                                <select v-if="col.filter" v-model="filterBy[col.key]"
                                    class="border border-slate-200 rounded-md bg-white text-xs sm:text-sm text-center px-2 py-1.5 min-h-[36px] max-w-[140px] focus:ring-1 focus:ring-mango-400 focus:border-mango-400 outline-none">
                                    <option value="">הכל</option>
                                    <option v-for="option in getFilterOptions(col.key)" :key="option" :value="option"
                                        class="text-ellipsis overflow-hidden max-w-[150px]">
                                        {{ option }}
                                    </option>
                                </select>
                                <span v-if="col.sortable" @click="sortBy(col.key)"
                                    class="cursor-pointer text-slate-400 hover:text-mango-500 transition-colors text-xs select-none px-2 py-0.5">
                                    {{ col.key === sortField ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅' }}
                                </span>
                                <input v-if="col.key === 'selected'" type="checkbox" @change="toggleSelectAll"
                                    :checked="selectedPallets.length === selectablePallets.length && selectablePallets.length > 0"
                                    class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                            </div>
                        </th>
                        <th class="px-3 py-3 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-[2]"
                            style="min-width: 80px" v-if="isEditable">עריכה</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="pallet in sortedPallets" :key="pallet.id" :data-id="pallet.id"
                        :class="[
                            'text-center text-sm transition-colors duration-100 bg-white hover:bg-mango-50/40',
                            highlightMissingWeight && !pallet.weight ? 'bg-amber-50' : '',
                            highlightedIds.has(pallet.id) ? 'pallet-flash' : '',
                            pallet._isContext ? 'opacity-50 italic' : '',
                            (pallet._isGroupLeader || pallet._isContext) ? 'cursor-pointer' : ''
                        ]"
                        :title="pallet._isContext ? 'מוצג כחלק ממשטח מעורב' : undefined"
                        :style="getMixStyle(pallet)"
                        @click="(pallet._isGroupLeader || pallet._isContext) && toggleCollapse(pallet.palletNumber)">
                        <template v-if="editingId === pallet.id">
                            <td v-for="col in columns" :key="col.key" :data-col="col.key" class="border-b border-slate-300 px-2 py-1.5">
                                <template v-if="col.editable">
                                    <div v-if="col.key === 'kind'">
                                        <select v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5">
                                            <option v-for="kind in kinds" :key="kind" :value="kind">{{ kind }}</option>
                                        </select>
                                    </div>
                                    <div v-else-if="col.key === 'size'">
                                        <select v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5">
                                            <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
                                        </select>
                                    </div>
                                    <div v-else-if="col.key === 'destination'">
                                        <input type="text" v-model="destinationFilterText" placeholder="סנן יעד..."
                                            class="input-field text-sm !p-1.5 mb-1" />
                                        <select v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5">
                                            <option v-for="destination in filteredDestinations" :key="destination" :value="destination">{{ destination }}</option>
                                        </select>
                                    </div>
                                    <div v-else-if="col.key == 'gidon'">
                                        <input type="checkbox" v-model="editingPallet[col.key]"
                                            class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400" />
                                    </div>
                                    <div v-else-if="col.key == 'sent'">
                                        <input type="checkbox" v-model="editingPallet[col.key]"
                                            class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400" />
                                    </div>
                                    <div v-else-if="col.key == 'shipmentDate'">
                                        <input type="date" v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5" />
                                    </div>
                                    <div v-else-if="col.key == 'palletNumber'">
                                        <input type="number" v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5" />
                                    </div>
                                    <div v-else>
                                        <input v-model="editingPallet[col.key]" class="input-field text-sm !p-1.5" />
                                    </div>
                                </template>
                                <template v-else-if="col.key === 'selected'">
                                    <input type="checkbox" v-model="selectedPallets" :value="pallet.id"
                                        class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                                </template>
                                <template v-else>{{ pallet[col.key] }}</template>
                            </td>
                            <td class="border-b border-slate-200 px-2 py-1.5">
                                <div class="flex flex-col gap-1">
                                    <button v-if="!isLoading" @click="savePallet"
                                        class="text-xs px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium transition-colors min-h-[32px]">
                                        שמור
                                    </button>
                                    <button v-else
                                        class="text-xs px-2 py-1.5 rounded-md bg-mango-50 text-mango-600 font-medium flex items-center justify-center min-h-[32px]">
                                        <span class="loading-spinner !w-3 !h-3"></span>
                                    </button>
                                    <button @click="closeEditing"
                                        class="text-xs px-2 py-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 font-medium transition-colors min-h-[32px]">
                                        ביטול
                                    </button>
                                    <button v-if="canDeleteEditing" @click="deleteEditing" :disabled="isLoading"
                                        class="text-xs px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors min-h-[32px]">
                                        מחק
                                    </button>
                                </div>
                            </td>
                        </template>
                        <template v-else>
                            <td v-for="col in columns" :key="col.key" :data-col="col.key" class="border-b border-slate-200 px-3 py-2.5">
                                <template v-if="col.key === 'selected'">
                                    <input v-if="!pallet._isContext" type="checkbox" v-model="selectedPallets" :value="pallet.id"
                                        @click.stop
                                        class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                                </template>
                                <template v-if="col.key === 'sent'">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <span :class="[
                                            'inline-flex items-center justify-center w-3 h-3 rounded-full flex-shrink-0',
                                            pallet[col.key] ? 'bg-emerald-400 shadow-sm shadow-emerald-200' : 'bg-slate-300'
                                        ]"></span>
                                        <span v-if="pallet._isGroupLeader"
                                            class="text-xs font-medium text-slate-400 select-none">
                                            {{ collapsedPallets.has(String(pallet.palletNumber)) ? `+${pallet._contextCount}` : '▼' }}
                                        </span>
                                    </div>
                                </template>
                                <template v-else-if="col.key === 'cardId' && pallet.cardId !== '' && pallet.cardId != null">
                                    <router-link :to="{ path: '/Certificates', query: { farmer, number: String(pallet.cardId) } }"
                                        class="text-mango-700 underline font-medium" @click.stop>{{ pallet.cardId }}</router-link>
                                </template>
                                <template v-else>{{ pallet[col.key] }}</template>
                            </td>
                            <td class="border-b border-slate-200 px-3 py-2.5" v-if="isEditable">
                                <div class="flex items-center justify-center gap-1.5" @click.stop>
                                    <div v-if="pallet.editedBy" class="relative group flex-shrink-0">
                                        <span class="text-slate-400 hover:text-slate-600 cursor-default text-sm leading-none select-none">ⓘ</span>
                                        <div class="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-10 hidden group-hover:block w-52 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none text-right">
                                            <p class="font-semibold mb-0.5">עודכן על ידי:</p>
                                            <p class="text-slate-300 mb-1">{{ pallet.editedBy }}</p>
                                            <p class="font-semibold mb-0.5">בתאריך:</p>
                                            <p class="text-slate-300">{{ formatEditedAt(pallet.editedAt) }}</p>
                                        </div>
                                    </div>
                                    <button v-if="!pallet._isContext" @click="startEditing(pallet)"
                                        class="text-xs text-mango-600 hover:text-mango-800 font-medium hover:bg-mango-50 px-3 py-1.5 rounded transition-colors min-h-[32px]">
                                        ערוך
                                    </button>
                                </div>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Error Toast -->
        <ErrorToast :error="error" @dismiss="error = null" />
    </div>
</template>

<script>
import { kinds, sizes, destinations, farmerConfigs as staticFarmerConfigs } from '../data/data.js';
import { inject } from 'vue';
import createStickerPDF from '../data/printData.js';
import SpinnerButton from './shared/SpinnerButton.vue';
import ErrorToast from './shared/ErrorToast.vue';
import { requestAlert, requestConfirm } from '../composables/useDialogs';
import { authHeaders } from '../utils/auth';
import { deleteRecord } from '../api/records';
import { previewCertificates, issueCertificates } from '../api/certificates';
import { printWithRetap, preloadPdf } from '../data/certificatePdf';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
    components: { SpinnerButton, ErrorToast },
    props: {
        pallets: {
            type: Array,
            required: true
        },
        farmer: {
            type: String,
            required: true
        },
        isEditable: {
            type: Boolean,
            required: false,
            default: true
        },
        destinationOnly: {
            type: Boolean,
            required: false,
            default: false
        },
        columnsFilter: {
            type: Array,
            required: false,
            default: () => []
        },
        title: {
            type: String,
            required: false,
            default: ''
        },
        subtitle: {
            type: String,
            required: false,
            default: ''
        },
        highlightMissingWeight: {
            type: Boolean,
            required: false,
            default: false
        },
        filterMissingWeight: {
            type: Boolean,
            required: false,
            default: false
        },
        highlightedIds: {
            type: Object,
            default: () => new Set()
        }
    },
    inject: ['config'],

    data() {
        let columns = [
            { key: 'sent', label: 'נשלח', editable: true, minWidth: '70px' },
            { key: 'shipmentDate', label: 'תאריך משלוח', sortable: true, editable: true, minWidth: '120px' },
            { key: 'cardId', label: 'מספר תעודה', filter: true, editable: false, minWidth: '100px' },
            { key: 'harvestDate', label: 'תאריך קטיף', editable: true, minWidth: '110px' },
            { key: 'palletNumber', label: 'מספר משטח', sortable: true, editable: true, minWidth: '95px' },
            { key: 'kind', label: 'זן', filter: true, sortable: true, editable: true, minWidth: '95px' },
            { key: 'size', label: 'גודל', filter: true, sortable: true, editable: true, minWidth: '85px' },
            { key: 'boxes', label: 'ארגזים', editable: true, minWidth: '80px' },
            { key: 'weight', label: 'משקל', editable: true, minWidth: '85px' },
            { key: 'destination', label: 'יעד', filter: true, editable: true, minWidth: '170px' },
            { key: 'gidon', label: 'הערה', filter: true, editable: true, minWidth: '90px' },
            { key: 'selected', label: 'בחירת משטח', minWidth: '100px' }
        ];
        if (this.destinationOnly) {
            columns = columns.filter(col => !['gidon', 'selected'].includes(col.key));
            columns = columns.map(col => ({
                ...col,
                editable: col.key === 'destination'
            }));
        }
        if (this.columnsFilter && this.columnsFilter.length > 0) {
            columns = columns.filter(col => !this.columnsFilter.includes(col.key));
        }

        // Use dynamic config
        const farmerConfigs = this.config.farmerConfigs;

        // Only show gidon column for farmers with allowGidon
        if (!farmerConfigs[this.farmer]?.allowGidon) {
            columns = columns.filter(col => col.key !== 'gidon');
        }
        return {
            columns,
            filterBy: {
                kind: '',
                size: '',
                destination: ''
            },
            selectedPallets: [],
            sortField: 'palletNumber',
            sortDirection: 'asc',
            editingId: null,
            editingPallet: null,
            error: null,
            isLoading: false,
            isCreatingLabel: false,
            isApplyingDate: false,
            bulkShipmentDate: '',
            sentView: false,
            destinationFilterText: '',
            searchText: '',
            collapsedPallets: new Set(),
        }
    },

    watch: {
        farmer() {
            this.searchText = '';
        },
        filterBy: {
            deep: true,
            handler() { this.collapsedPallets = new Set(); }
        },
        searchText() { this.collapsedPallets = new Set(); }
    },

    computed: {
        kinds() { return this.config.kinds || []; },
        sizes() { return this.config.sizes || []; },
        destinations() { return this.config.destinations || []; },
        // Only unsent pallets without a certificate number can be deleted (the server enforces it too).
        canDeleteEditing() {
            const p = this.pallets.find(x => x.id === this.editingId);
            return !!p && !p.sent && (p.cardId === '' || p.cardId == null);
        },
        isCreateLabelAllowed() {
            return this.selectedPallets.length === 0
        },
        globalMixedPalletNumbers() {
            const counts = {};
            for (const p of this.pallets) {
                const k = String(p.palletNumber);
                counts[k] = (counts[k] || 0) + 1;
            }
            return new Set(Object.keys(counts).filter(k => counts[k] > 1));
        },
        hasActiveFilter() {
            const { kind, size, destination, gidon } = this.filterBy;
            return !!(kind || size || destination || gidon || this.searchText.trim() || this.filterMissingWeight || this.sentView);
        },
        selectablePallets() {
            return this.filteredPallets.filter(p => !p._isContext);
        },
        filteredPallets() {
            const search = this.searchText.trim().toLowerCase();

            const passesFilter = (pallet) => {
                if (this.sentView && pallet.sent !== false) return false;
                if (this.filterMissingWeight && pallet.weight) return false;
                if (search) {
                    const hit = ['palletNumber', 'cardId', 'shipmentDate', 'harvestDate', 'kind', 'size', 'boxes', 'weight', 'destination'].some(
                        f => String(pallet[f] ?? '').toLowerCase().includes(search)
                    );
                    if (!hit) return false;
                }
                if (this.filterBy.gidon === "גדעון" && !pallet.gidon) return false;
                if (this.filterBy.gidon === "אין הערה" && pallet.gidon) return false;
                for (const [key, value] of Object.entries(this.filterBy)) {
                    if (key === 'gidon') continue;
                    if (value && pallet[key] !== value) return false;
                }
                return true;
            };

            const withGidon = (pallet, isContext = false) => {
                const result = { ...pallet, gidon: pallet.gidon ? "גדעון" : "" };
                if (isContext) result._isContext = true;
                return result;
            };

            const matched = this.pallets.filter(passesFilter).map(p => withGidon(p));

            if (!this.hasActiveFilter) return matched;

            const matchedIds = new Set(matched.map(p => p.id));
            const mixedMatchedNumbers = new Set(
                matched
                    .filter(p => this.globalMixedPalletNumbers.has(String(p.palletNumber)))
                    .map(p => String(p.palletNumber))
            );

            if (mixedMatchedNumbers.size === 0) return matched;

            const contextRows = this.pallets
                .filter(p => mixedMatchedNumbers.has(String(p.palletNumber)) && !matchedIds.has(p.id))
                .map(p => withGidon(p, true));

            return [...matched, ...contextRows];
        },
        filteredDestinations() {
            if (!this.destinationFilterText) return this.destinations;
            const text = this.destinationFilterText.toLowerCase();
            return this.destinations.filter(dest => dest.toLowerCase().includes(text));
        },
        isSendingPalletLoading() {
            return this.isCreatingLabel
        },
        sortedPallets() {
            const sorted = [...this.filteredPallets].sort((a, b) => {
                const aVal = a[this.sortField];
                const bVal = b[this.sortField];

                let cmp;
                if (this.sortField === 'palletNumber') {
                    cmp = this.sortDirection === 'asc'
                        ? parseInt(aVal) - parseInt(bVal)
                        : parseInt(bVal) - parseInt(aVal);
                } else {
                    cmp = this.sortDirection === 'asc'
                        ? String(aVal ?? '').localeCompare(String(bVal ?? ''))
                        : String(bVal ?? '').localeCompare(String(aVal ?? ''));
                }

                if (cmp !== 0) return cmp;
                if (!!a._isContext !== !!b._isContext) return a._isContext ? 1 : -1;
                return 0;
            });

            // Count context siblings per palletNumber
            const contextCount = {};
            for (const p of sorted) {
                if (p._isContext) {
                    const k = String(p.palletNumber);
                    contextCount[k] = (contextCount[k] || 0) + 1;
                }
            }

            // Build output: annotate group leaders, skip collapsed context rows
            const seenLeaders = new Set();
            const result = [];
            for (const p of sorted) {
                const k = String(p.palletNumber);
                if (p._isContext) {
                    if (!this.collapsedPallets.has(k)) result.push(p);
                    continue;
                }
                if (contextCount[k] && !seenLeaders.has(k)) {
                    seenLeaders.add(k);
                    result.push({ ...p, _isGroupLeader: true, _contextCount: contextCount[k] });
                } else {
                    result.push(p);
                }
            }
            return result;
        },
        AmountOfPallets() {
            const uniquePalletNumbers = new Set(this.filteredPallets.map(pallet => pallet.palletNumber));
            return uniquePalletNumbers.size;
        },
        mixPalletColorMap() {
            const PALETTE = [
                { border: '#8b5cf6', bg: 'rgba(139,92,246,0.09)' },
                { border: '#3b82f6', bg: 'rgba(59,130,246,0.09)' },
                { border: '#06b6d4', bg: 'rgba(6,182,212,0.09)' },
                { border: '#10b981', bg: 'rgba(16,185,129,0.09)' },
                { border: '#f97316', bg: 'rgba(249,115,22,0.09)' },
                { border: '#ec4899', bg: 'rgba(236,72,153,0.09)' },
                { border: '#84cc16', bg: 'rgba(132,204,22,0.09)' },
                { border: '#ef4444', bg: 'rgba(239,68,68,0.09)' },
            ];
            const counts = {};
            for (const p of this.pallets) {
                const k = String(p.palletNumber);
                counts[k] = (counts[k] || 0) + 1;
            }
            const map = {};
            let ci = 0;
            for (const [num, cnt] of Object.entries(counts)) {
                if (cnt > 1) {
                    map[num] = PALETTE[ci % PALETTE.length];
                    ci++;
                }
            }
            return map;
        }
    },

    methods: {
        async deleteEditing() {
            const p = this.pallets.find(x => x.id === this.editingId);
            if (!p) return;
            const ok = await requestConfirm({ title: 'מחיקת משטח', confirmText: 'מחק משטח',
                message: `למחוק את משטח ${p.palletNumber}? מנהל יכול לשחזר אותו מההגדרות (משטחים שנמחקו).` });
            if (!ok) return;
            try {
                await deleteRecord(this.farmer, p.id);
                this.$emit('update:pallets', this.pallets.filter(x => x.id !== p.id));
                this.editingId = null;
                this.editingPallet = null;
            } catch (e) {
                await requestAlert({ title: 'המחיקה נכשלה', message: e.message, variant: 'error' });
            }
        },

        toggleCollapse(palletNumber) {
            const k = String(palletNumber);
            if (this.collapsedPallets.has(k)) {
                this.collapsedPallets.delete(k);
            } else {
                this.collapsedPallets.add(k);
            }
        },

        getMixStyle(pallet) {
            const mixInfo = this.mixPalletColorMap[String(pallet.palletNumber)];
            if (!mixInfo) return {};
            return { 'border-right': `4px solid ${mixInfo.border}` };
        },

        formatEditedAt(isoString) {
            if (!isoString) return '';
            try {
                return new Date(isoString).toLocaleString('he-IL');
            } catch {
                return isoString;
            }
        },

        getFilterOptions(key) {
            if (key === 'gidon') {
                return [...new Set(this.pallets.map(p => p.gidon ? "גדעון" : "אין הערה"))];
            }
            return [...new Set(this.pallets.map(p => p[key]))];
        },

        async startEditing(pallet) {
            const raw = this.pallets.find(p => p.id === pallet.id) || pallet;
            const hasCertificate = raw.cardId !== undefined && raw.cardId !== null
                && String(raw.cardId).trim() !== '' && Number(raw.cardId) !== 0;
            if (raw.sent === true || hasCertificate) {
                const ok = await requestConfirm({
                    title: 'המשטח כבר יצא',
                    message: 'המשטח כבר יצא / הונפקה לו תעודה — לשנות בכל זאת?',
                    variant: 'yellow',
                });
                if (!ok) return;
            }
            this.editingId = pallet.id;
            this.editingPallet = {
                ...raw,
                sent: !!raw.sent,
                gidon: !!raw.gidon
            };
            this.$nextTick(() => {
                const row = this.$el.querySelector(`tr[data-id="${pallet.id}"]`);
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        },

        closeEditing() {
            this.editingId = null;
            this.editingPallet = null;
        },
        async confirmBulkAction(toSend) {
            const selectedData = this.filteredPallets.filter(p => this.selectedPallets.includes(p.id));
            const destinations = [...new Set(selectedData.map(p => p.destination).filter(Boolean))];
            const message = toSend
                ? `האם להעביר ${selectedData.length} משטחים למשלוח?`
                : `האם להוריד ${selectedData.length} משטחים מהמשלוח?`;
            const details = destinations.length ? `יעדים: ${destinations.join(', ')}` : '';
            const ok = await requestConfirm({ message, details, variant: toSend ? 'emerald' : 'amber' });
            if (ok) this.updateToDestinations(toSend);
        },

        async updateToDestinations(toSend) {
            this.isCreatingLabel = true
            const selectedPalletsData = this.filteredPallets.filter(p =>
                this.selectedPallets.includes(p.id)
            );
            try {
                let url = ''
                if(toSend){
                    url = `${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/destinations/toSend`
                } else {
                    url = `${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/destinations/Sent`
                }
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify(selectedPalletsData),
                });

                if (!response.ok) {
                    throw new Error('Failed to send pallets');
                }

                this.selectedPallets = [];
                this.isCreatingLabel = false
            } catch (err) {
                this.isCreatingLabel = false
                this.error = err.message;
                setTimeout(() => {
                    this.error = null;
                }, 5000);
            }
        },
        async savePallet() {
            const originalPallet = { ...this.pallets.find(p => p.id === this.editingId) };
            this.isLoading = true
            this.editingPallet.palletNumber = Number(this.editingPallet.palletNumber);
            // Empty stays empty — Number('') is 0, which showed a "0" certificate number after save.
            for (const key of ['cardId', 'boxes', 'weight']) {
                const v = this.editingPallet[key];
                if (v !== undefined && v !== '' && v !== null) this.editingPallet[key] = Number(v);
            }
            this.editingPallet.gidon = !!this.editingPallet.gidon;
            this.editingPallet.sent = !!this.editingPallet.sent;

            try {
                const response = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/records/${this.editingId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify(this.editingPallet),
                });

                if (!response.ok) {
                    this.isLoading = false;
                    throw new Error('Failed to update pallet');
                }

                // The server decides cardId/sent (a certified row keeps its own) — take the stored values back.
                const { data: stored } = await response.json().catch(() => ({}));
                const index = this.pallets.findIndex(pallet => pallet.id === this.editingId);

                if (index !== -1) {
                    // Create a new array to trigger reactivity
                    const newPallets = [...this.pallets];
                    newPallets[index] = { ...originalPallet, ...this.editingPallet,
                        ...(stored ? { cardId: stored.cardId, sent: stored.sent } : {}) };
                    this.$emit('update:pallets', newPallets);
                }

                this.editingId = null;
                this.editingPallet = null;
                this.isLoading = false;
            } catch (err) {
                this.error = err.message;
                const index = this.pallets.findIndex(pallet => pallet.id === this.editingId);

                if (index !== -1) {
                    const newPallets = [...this.pallets];
                    newPallets[index] = originalPallet;
                    this.$emit('update:pallets', newPallets);
                }

                setTimeout(() => {
                    this.error = null;
                }, 5000);

                this.editingId = null;
                this.editingPallet = null;
                this.isLoading = false;
            }
        },

        sortBy(field) {
            this.sortDirection = this.sortField === field && this.sortDirection === 'asc'
                ? 'desc'
                : 'asc';
            this.sortField = field;
        },

        toggleSelectAll() {
            this.selectedPallets = this.selectedPallets.length === this.selectablePallets.length
                ? []
                : this.selectablePallets.map(p => p.id);
        },

        toggleSentView() {
            this.sentView = !this.sentView;
        },
        async sendSelectedPallets() {
            const ids = [...this.selectedPallets];
            this.isCreatingLabel = true;
            preloadPdf(); // warm pdfmake + font now so printing right after issue stays within the tap window
            try {
                const pv = await previewCertificates(this.farmer, ids);
                const sizes = pv.chunks.map(c => c.rows);
                const summary = sizes.length === 1
                    ? `תיווצר תעודה אחת (${sizes[0]} שורות)`
                    : `ייווצרו ${sizes.length} תעודות: ${sizes.join(' + ')}`;
                const ok = await requestConfirm({
                    title: 'הפקת תעודת משלוח',
                    message: summary,
                    details: `יעד: ${pv.destination} · תאריך: ${pv.shipmentDate}`,
                    confirmText: 'אשר',
                });
                if (!ok) return;
                const { certificates } = await issueCertificates(this.farmer, ids);
                const byRecord = new Map();
                certificates.forEach(c => c.snapshot.rows.forEach(r => byRecord.set(r.recordId, c.number)));
                const updated = this.pallets.map(p => byRecord.has(p.id)
                    ? { ...p, cardId: byRecord.get(p.id), sent: true, mark: false } : p);
                this.$emit('update:pallets', updated);
                this.selectedPallets = [];
                const numbers = certificates.map(c => c.number).join('-');
                try {
                    await printWithRetap(certificates.map(c => c.snapshot), `תעודת-משלוח-${numbers}.pdf`, requestConfirm);
                } catch {
                    await requestAlert({ title: 'ההדפסה לא הושלמה',
                        message: `התעודה נשמרה (${numbers}). ניתן להדפיס אותה שוב ממסך "תעודות".`, variant: 'warning' });
                }
            } catch (err) {
                const soft = err.status === 400 || err.status === 409;
                await requestAlert({ title: soft ? 'לא ניתן להפיק תעודה' : 'שגיאה',
                    message: err.message, variant: soft ? 'warning' : 'error' });
            } finally {
                this.isCreatingLabel = false;
            }
        },

        async applyShipmentDateToSelected() {
            const ids = this.selectedPallets.slice();
            if (!ids.length) return;
            if (!this.bulkShipmentDate) {
                await requestAlert({ title: 'חסר תאריך', message: 'יש לבחור תאריך משלוח לפני הלחיצה על "החל על הכל"', variant: 'warning' });
                return;
            }
            const date = this.bulkShipmentDate;
            const ok = await requestConfirm({
                title: 'עדכון תאריך משלוח',
                message: `האם לקבוע תאריך משלוח ${date} ל-${ids.length} משטחים?`,
                variant: 'amber',
            });
            if (!ok) return;

            this.isApplyingDate = true;
            try {
                const response = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/records/shipmentDate`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify({ palletIds: ids, shipmentDate: date }),
                });
                if (!response.ok) {
                    throw new Error('Failed to update shipment date');
                }
                const updatedPallets = this.pallets.map(p => ids.includes(p.id) ? { ...p, shipmentDate: date } : p);
                this.$emit('update:pallets', updatedPallets);
                this.selectedPallets = [];
            } catch (err) {
                await requestAlert({ title: 'שגיאה', message: 'עדכון תאריך המשלוח נכשל, נסה שוב', variant: 'error' });
            } finally {
                this.isApplyingDate = false;
            }
        },

        async returnSentPallets() {
            const selectedPalletIds = this.filteredPallets
                .filter(p => this.selectedPallets.includes(p.id))
                .map(p => p.id); // Extract only the IDs

            try {
                const response = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/records/resetPallets`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(await authHeaders()),
                    },
                    body: JSON.stringify({ palletIds: selectedPalletIds }), // Send only IDs
                });

                if (!response.ok) {
                    throw new Error('Failed to send pallets');
                }

                // The server reports the stored state (certified rows also lose cardId and return to prep).
                const { updated = [] } = await response.json().catch(() => ({}));
                const byId = new Map(updated.map(u => [u.id, u]));
                const updatedPallets = this.pallets.map(p => {
                    if (selectedPalletIds.includes(p.id)) {
                        return { ...p, sent: false, ...(byId.get(p.id) || {}) };
                    }
                    return p;
                });
                this.$emit('update:pallets', updatedPallets);
                this.selectedPallets = [];
            } catch (err) {
                this.error = err.message;
                setTimeout(() => {
                    this.error = null;
                }, 5000);
            }
        },

        async printPDF() {
            const originalPallet = { ...this.pallets.find(p => p.id === this.selectedPallets[0]) };
            console.log(`this.editingId: ${this.selectedPallets}, orginalPallet: `, originalPallet)
            // Sample Data
            const sampleData = {
                platformNumber: originalPallet.palletNumber || "",
                farmer: this.farmer || "",
                variety: originalPallet.kind || "",
                size: originalPallet.size || "",
                quantity: originalPallet.boxes || "",
                weight: originalPallet.weight || "",

            };

            await createStickerPDF(sampleData);
        },

        async fetchLastPallet(farmer) {
            try {
                const encodedFarmer = encodeURIComponent(farmer);
                const URL = `${baseUrl}/api/farmers/${encodedFarmer}/records/lastPallet`;
                const response = await fetch(URL, {
                    method: 'GET',
                    headers: { ...(await authHeaders()) },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch last pallet: ${response.statusText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`Error fetching last pallet:`, error);
                throw error;
            }
        }
    }
}
</script>

<style scoped>
@keyframes palletFlash {
    0%   { background-color: #fef08a; }
    60%  { background-color: #fef9c3; }
    100% { background-color: inherit; }
}
.pallet-flash { animation: palletFlash 3s ease-out forwards; }

@media (max-width: 1366px) {
    .toolbar-identity {
        display: none;
    }
}

table {
    border-collapse: collapse;
}

thead th {
    position: sticky;
    top: 0;
    z-index: 2;
}

td, th {
    height: 44px;
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
    vertical-align: middle;
}

td {
    border-bottom: 1px solid #b2b8c1;
}

.rtl {
    direction: rtl;
}
</style>
