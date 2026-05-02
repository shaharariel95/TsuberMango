<template>
    <div class="w-full flex flex-col animate-fade-in">
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
                    <button @click="sendSelectedPallets" :disabled="isCreateLabelAllowed || isCreatingLabel"
                        class="btn-primary text-sm flex items-center gap-1.5 min-h-[36px] px-3"
                        v-if="isEditable">
                        <span v-if="isSendingPalletLoading == false">צור תעודת משלוח</span>
                        <span v-else class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white"></span>
                    </button>
                    <button @click="returnSentPallets" :disabled="selectedPallets.length === 0"
                        class="btn-primary text-sm min-h-[36px] px-3" v-else>
                        החזר משטחים נשלחו
                    </button>
                    <button @click="printPDF" :disabled="selectedPallets.length !== 1 || isCreatingLabel"
                        class="btn-ghost text-sm border border-slate-200 flex items-center gap-1.5 min-h-[36px] px-3"
                        v-if="isEditable">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span v-if="isSendingPalletLoading == false">הפק מדבקה</span>
                        <span v-else class="loading-spinner !w-4 !h-4"></span>
                    </button>
                    <button @click="updateToDestinations(true)" :disabled="selectedPallets.length === 0 || isCreatingLabel"
                        class="btn-primary text-sm bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 flex items-center gap-1.5 min-h-[36px] px-3"
                        v-if="isEditable">
                        <span v-if="isSendingPalletLoading == false">העבר למשלוח</span>
                        <span v-else class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white"></span>
                    </button>
                    <button @click="updateToDestinations(false)" :disabled="selectedPallets.length === 0 || isCreatingLabel"
                        class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3"
                        v-if="isEditable">
                        <span v-if="isSendingPalletLoading == false">הורד ממשלוח</span>
                        <span v-else class="loading-spinner !w-4 !h-4"></span>
                    </button>
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
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white" style="overflow-y: clip; -webkit-overflow-scrolling: touch;">
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
                                    :checked="selectedPallets.length === filteredPallets.length && filteredPallets.length > 0"
                                    class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                            </div>
                        </th>
                        <th class="px-3 py-3 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-[2]"
                            style="min-width: 80px" v-if="isEditable">עריכה</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(pallet, index) in sortedPallets" :key="pallet.id"
                        :class="[
                            'text-center text-sm transition-colors duration-100',
                            index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                            'hover:bg-mango-50/40'
                        ]">
                        <template v-if="editingId === pallet.id">
                            <td v-for="col in columns" :key="col.key" class="border-b border-slate-100 px-2 py-1.5">
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
                            <td class="border-b border-slate-100 px-2 py-1.5">
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
                                </div>
                            </td>
                        </template>
                        <template v-else>
                            <td v-for="col in columns" :key="col.key" class="border-b border-slate-100 px-3 py-2.5">
                                <template v-if="col.key === 'selected'">
                                    <input type="checkbox" v-model="selectedPallets" :value="pallet.id"
                                        class="w-5 h-5 rounded border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                                </template>
                                <template v-if="col.key === 'sent'">
                                    <span :class="[
                                        'inline-flex items-center justify-center w-3 h-3 rounded-full',
                                        pallet[col.key] ? 'bg-emerald-400 shadow-sm shadow-emerald-200' : 'bg-slate-300'
                                    ]"></span>
                                </template>
                                <template v-else>{{ pallet[col.key] }}</template>
                            </td>
                            <td class="border-b border-slate-100 px-3 py-2.5" v-if="isEditable">
                                <button @click="startEditing(pallet)"
                                    class="text-xs text-mango-600 hover:text-mango-800 font-medium hover:bg-mango-50 px-3 py-1.5 rounded transition-colors min-h-[32px]">
                                    ערוך
                                </button>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Error Toast -->
        <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-4">
            <div v-if="error" class="toast-error" role="alert">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{{ error }}</span>
                <button class="mr-2 hover:text-red-200 transition-colors font-bold text-lg leading-none" @click="error = null">&times;</button>
            </div>
        </Transition>
    </div>
</template>

<script>
import { kinds, sizes, destinations, farmerConfigs as staticFarmerConfigs } from '../data/data.js';
import { inject } from 'vue';
import createStickerPDF from '../data/printData.js';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
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
        }
    },
    inject: ['config'],

    data() {
        let columns = [
            { key: 'sent', label: 'נשלח', editable: true, minWidth: '70px' },
            { key: 'shipmentDate', label: 'תאריך משלוח', sortable: true, editable: true, minWidth: '120px' },
            { key: 'cardId', label: 'מספר תעודה', filter: true, editable: true, minWidth: '100px' },
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
            sentView: false,
            destinationFilterText: '',
            searchText: '',
        }
    },

    watch: {
        farmer() {
            this.searchText = '';
        }
    },

    computed: {
        kinds() { return this.config.kinds || []; },
        sizes() { return this.config.sizes || []; },
        destinations() { return this.config.destinations || []; },
        isCreateLabelAllowed() {
            return this.selectedPallets.length === 0 || this.selectedPallets.length > 13
        },
        filteredPallets() {
            const search = this.searchText.trim().toLowerCase();
            return this.pallets.filter(pallet => {
                const matchesSent = this.sentView ? pallet.sent === false : true;

                if (search) {
                    const hit = ['palletNumber', 'cardId', 'shipmentDate', 'harvestDate', 'kind', 'size', 'boxes', 'weight', 'destination'].some(
                        f => String(pallet[f] ?? '').toLowerCase().includes(search)
                    );
                    if (!hit) return false;
                }

                let allFiltersMatch = true;

                if (this.filterBy.gidon !== undefined && this.filterBy.gidon !== null) {
                    if (this.filterBy.gidon === "גדעון") {
                        if (!pallet.gidon) return false;
                    } else if (this.filterBy.gidon === "אין הערה") {
                        if (pallet.gidon) return false;
                    }
                }

                for (const [key, value] of Object.entries(this.filterBy)) {
                    if (key === 'gidon') continue;
                    if (value && pallet[key] !== value) {
                        allFiltersMatch = false;
                        break;
                    }
                }

                return matchesSent && allFiltersMatch;
            }).map(pallet => {
                // Create a new object with modified gidon
                const result = { ...pallet };
                result.gidon = pallet.gidon ? "גדעון" : "";
                return result;
            });
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
            return [...this.filteredPallets].sort((a, b) => {
                const aVal = a[this.sortField];
                const bVal = b[this.sortField];

                if (this.sortField === 'palletNumber') {
                    return this.sortDirection === 'asc'
                        ? parseInt(aVal) - parseInt(bVal)
                        : parseInt(bVal) - parseInt(aVal);
                }

                return this.sortDirection === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            });
        },
        AmountOfPallets() {
            const uniquePalletNumbers = new Set(this.filteredPallets.map(pallet => pallet.palletNumber));
            return uniquePalletNumbers.size;
        }
    },

    methods: {
        getFilterOptions(key) {
            if (key === 'gidon') {
                return [...new Set(this.pallets.map(p => p.gidon ? "גדעון" : "אין הערה"))];
            }
            return [...new Set(this.pallets.map(p => p[key]))];
        },

        startEditing(pallet) {
            this.editingId = pallet.id;
            this.editingPallet = {
                ...pallet,
                sent: !!pallet.sent,
                gidon: !!pallet.gidon
            };
        },

        closeEditing() {
            this.editingId = null;
            this.editingPallet = null;
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
                    },
                    body: JSON.stringify(selectedPalletsData),
                    credentials: 'include',
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
            // Ensure numeric fields are numbers
            this.editingPallet.palletNumber = Number(this.editingPallet.palletNumber);
            if (this.editingPallet.cardId !== undefined) this.editingPallet.cardId = Number(this.editingPallet.cardId);
            if (this.editingPallet.boxes !== undefined) this.editingPallet.boxes = Number(this.editingPallet.boxes);
            if (this.editingPallet.weight !== undefined) this.editingPallet.weight = Number(this.editingPallet.weight);

            try {
                const response = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/records/${this.editingId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.editingPallet),
                    credentials: 'include',
                });

                if (!response.ok) {
                    this.isLoading = false;
                    throw new Error('Failed to update pallet');
                }

                const index = this.pallets.findIndex(pallet => pallet.id === this.editingId);

                if (index !== -1) {
                    // Create a new array to trigger reactivity
                    const newPallets = [...this.pallets];
                    newPallets[index] = { ...originalPallet, ...this.editingPallet };
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
            this.selectedPallets = this.selectedPallets.length === this.filteredPallets.length
                ? []
                : this.filteredPallets.map(p => p.id);
        },

        toggleSentView() {
            this.sentView = !this.sentView;
        },
        validatePallet(pallet) {
            const requiredFields = ['boxes', 'weight', 'size', 'kind', 'destination', 'shipmentDate', 'harvestDate'];
            for (const field of requiredFields) {
                if (!pallet[field]) {
                    this.error = `Missing field: ${field}`;
                    setTimeout(() => {
                        this.error = null;
                    }, 5000);
                    return false;
                }
            }
            return true;
        },
        async sendSelectedPallets() {
            this.isCreatingLabel = true
            const selectedPalletsData = this.filteredPallets.filter(p =>
                this.selectedPallets.includes(p.id)
            );

            try {
                selectedPalletsData.forEach(pallet => {
                    if (!this.validatePallet(pallet)) {
                        throw new Error('Missing required fields in pallet data');
                    }
                });
                const response = await fetch(`${baseUrl}/api/shipping/newlabel`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ pallets: selectedPalletsData, farmer: this.farmer }),
                    credentials: 'include',
                });
                const res = await response.json();  // or just handle this if you have a response
                console.log(`respose: `, res)
                if (!response.ok) {
                    throw new Error(res['error'] || 'Failed to create label');
                }
                // Update selected pallets with the new label name and sent status
                const palletsToUpdate = selectedPalletsData.map(pallet => ({
                    ...pallet,               // Spread the original pallet
                    cardId: Number(res['result'].name), // Assign the new cardId
                    sent: true,               // Set sent to true
                    mark: false,
                }));
                console.log(`paleltsToUpdate: `, palletsToUpdate)
                const response2 = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/records/updatemany`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(palletsToUpdate),
                    credentials: 'include',
                });
                console.log(response2)
                const updatedPallets = [...this.pallets];
                selectedPalletsData.forEach((selectedPallet) => {
                    const index = this.pallets.findIndex(pallet => pallet.id === selectedPallet.id);
                    if (index !== -1) {
                        updatedPallets[index] = {
                            ...updatedPallets[index],
                            cardId: Number(res['result'].name),  // Update the label name (as number)
                            sent: true                    // Set the sent flag to true
                        };
                    }
                });

                this.$emit('update:pallets', updatedPallets);
                this.selectedPallets = [];
                this.isCreatingLabel = false
            } catch (err) {
                this.error = err.message;
                setTimeout(() => {
                    this.error = null;
                    this.selectedPallets = [];
                    this.isCreatingLabel = false;
                }, 5000);
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
                    },
                    body: JSON.stringify({ palletIds: selectedPalletIds }), // Send only IDs
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to send pallets');
                }

                const updatedPallets = this.pallets.map(p => {
                    if (selectedPalletIds.includes(p.id)) {
                        return { ...p, sent: false };
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

        printPDF() {
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

            createStickerPDF(sampleData);
        },

        async fetchLastPallet(farmer) {
            try {
                const encodedFarmer = encodeURIComponent(farmer);
                const URL = `${baseUrl}/api/farmers/${encodedFarmer}/records/lastPallet`;
                const response = await fetch(URL, {
                    method: 'GET',
                    credentials: 'include', // Include cookies for authentication
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

.rtl {
    direction: rtl;
}
</style>
