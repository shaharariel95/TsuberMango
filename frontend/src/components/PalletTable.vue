<template>
    <div class="h-full">
        <div class="mb-4 flex flex-row justify-between">
            <button @click="sendSelectedPallets" :disabled="selectedPallets.length === 0"
                class="p-4 font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                Send Selected Pallets
            </button>

            <button @click="toggleSentView"
                class="p-4 font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                <span v-if="sentView">Show sent Pallets</span>
                <span v-else>Hide sent Pallets</span>
            </button>
        </div>

        <table class="w-full h-full bg-white border-collapse rtl">
            <thead>
                <tr>
                    <th v-for="col in columns" :key="col.key" :class="col.class">
                        <div class="flex items-center">
                            {{ col.label }}
                            <select v-if="col.filter" v-model="filterBy[col.key]" class="ml-2 bg-gray-300">
                                <option value="">הכל</option>
                                <option v-for="option in getFilterOptions(col.key)" :key="option" :value="option">
                                    {{ option }}
                                </option>
                            </select>
                            <span v-if="col.sortable" @click="sortBy(col.key)" class="cursor-pointer">
                                {{ sortField === col.key ? (sortDirection === 'asc' ? '▲' : '▼') : '' }}
                            </span>
                            <input v-if="col.key === 'selected'" type="checkbox" @change="toggleSelectAll"
                                :checked="selectedPallets.length === filteredPallets.length" />
                        </div>
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]">עריכה</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="pallet in sortedPallets" :key="pallet.id" class="border-b text-center">
                    <template v-if="editingId === pallet.id">
                        <td v-for="col in columns" :key="col.key" class="border-b border-r border-black px-4 py-2">
                            <template v-if="col.editable">
                                <div v-if="col.key === 'kind'">
                                    <select v-model="editingPallet[col.key]" class="w-full border rounded px-2 py-1">
                                        <option v-for="kind in kinds" :key="kind" :value="kind">{{ kind }}</option>
                                    </select>
                                </div>
                                <div v-else-if="col.key === 'size'">
                                    <select v-model="editingPallet[col.key]" class="w-full border rounded px-2 py-1">
                                        <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
                                    </select>
                                </div>
                                <div v-else-if="col.key === 'destination'">
                                    <select v-model="editingPallet[col.key]" class="w-full border rounded px-2 py-1">
                                        <option v-for="destination in destinations" :key="destination"
                                            :value="destination">{{ destination }}</option>
                                    </select>
                                </div>
                                <div v-else-if="col.key == 'sent'">
                                    <input type="checkbox" v-model="editingPallet[col.key]"
                                        class="w-full h-5 border rounded px-2 py-1" />
                                </div>
                                <div v-else-if="col.key == 'shipmentDate'">
                                    <input type="date" v-model="editingPallet[col.key]"
                                        class="w-full border rounded px-2 py-1" />
                                </div>
                                <div v-else>
                                    <input v-model="editingPallet[col.key]" class="w-full border rounded px-2 py-1"
                                        style="width: 100%;" :class="{ 'w-20': !col.key.includes('date') }" />
                                </div>
                            </template>
                            <template v-else-if="col.key === 'selected'">
                                <input type="checkbox" v-model="selectedPallets" :value="pallet.id" />
                            </template>
                            <template v-else>{{ pallet[col.key] }}</template>
                        </td>
                        <td class="border border-b border-black px-4 py-2">
                            <button v-if="!isLoading" @click="savePallet"
                                class="p-1 border-2 border-black rounded w-full hover:bg-green-100 text-green-600 mb-1">Save</button>
                            <button v-else
                                class="p-1 border-2 border-black rounded w-full hover:bg-yellow-100 text-yellow-600 mb-1">Loading</button>
                            <button @click="closeEditing"
                                class="p-1 border-2 border-black rounded w-full hover:bg-red-100 text-red-600">Cancel</button>
                        </td>
                    </template>
                    <template v-else>
                        <td v-for="col in columns" :key="col.key" class="border-b border-r border-black px-4 py-2">
                            <template v-if="col.key === 'selected'">
                                <input type="checkbox" v-model="selectedPallets" :value="pallet.id" />
                            </template>
                            <template v-if="col.key === 'sent'">
                                <span :class="pallet[col.key] ? 'bg-green-500' : 'bg-gray-400'"
                                    class="inline-block w-3 h-3 rounded-full mr-2"></span>
                            </template>
                            <template v-else>{{ pallet[col.key] }}</template>
                        </td>
                        <td class="border border-b border-black px-4 py-2">
                            <button @click="startEditing(pallet)" class="text-blue-600">Edit</button>
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>

        <div v-if="error"
            class="fixed inset-0 m-4 z-10 sm:m-40 w-auto h-fit bg-amber-300 border border-amber-500 text-amber-800 px-4 py-3 rounded mb-4 flex justify-center items-center"
            role="alert">
            <div>
                <strong class="font-bold">Error:</strong>
                <span class="block sm:inline">{{ error }}</span>
            </div>
            <button class="absolute top-2 right-2 w-14 text-center" @click="error = null">x</button>
        </div>
    </div>
</template>

<script>
import { kinds, sizes, destinations } from '../data/data.js';

export default {
    props: {
        pallets: {
            type: Array,
            required: true
        },
        farmer: {
            type: String,
            required: true
        }
    },

    data() {
        return {
            kinds,
            sizes,
            destinations,
            columns: [
                { key: 'sent', label: 'נשלח', editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
                { key: 'palletNumber', label: 'מספר משטח', sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
                { key: 'shipmentDate', label: 'תאריך משלוח', sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[11%]' },
                { key: 'cardId', label: 'מספר תעודה', editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
                { key: 'harvestDate', label: 'תאריך קטיף', editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
                { key: 'kind', label: 'זן', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
                { key: 'size', label: 'גודל', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
                { key: 'boxes', label: 'ארגזים', editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
                { key: 'weight', label: 'משקל', editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
                { key: 'destination', label: 'יעד', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[15%]' },
                { key: 'selected', label: 'בחירה לתעודת משלוח', class: 'border border-black px-4 py-2 w-[6%]' }
            ],
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
            sentView: false,
        }
    },

    computed: {
        filteredPallets() {
            return this.pallets.filter(pallet => {
                const matchesSent = this.sentView ? pallet.sent === false : true;
                const matchesFilters = Object.entries(this.filterBy).every(([key, value]) =>
                    !value || pallet[key] === value
                );
                return matchesSent && matchesFilters;
            });
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
        }
    },

    methods: {
        getFilterOptions(key) {
            return [...new Set(this.pallets.map(p => p[key]))];
        },

        startEditing(pallet) {
            this.editingId = pallet.id;
            this.editingPallet = {
                ...pallet,
                sent: !!pallet.sent
            };
        },

        closeEditing() {
            this.editingId = null;
            this.editingPallet = null;
        },

        async savePallet() {
            const originalPallet = { ...this.pallets.find(p => p.id === this.editingId) };
            this.isLoading = true

            try {
                const response = await fetch(`http://localhost:3000/farmers/${encodeURIComponent(this.farmer)}/records/${this.editingId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.editingPallet)
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

        async sendSelectedPallets() {
            const selectedPalletsData = this.filteredPallets.filter(p =>
                this.selectedPallets.includes(p.id)
            );

            try {
                const response = await fetch('/api/send-pallets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(selectedPalletsData)
                });

                if (!response.ok) {
                    throw new Error('Failed to send pallets');
                }

                this.selectedPallets = [];
            } catch (err) {
                this.error = err.message;
                setTimeout(() => {
                    this.error = null;
                }, 5000);
            }
        }
    }
}
</script>

<style scoped>
table thead th {
    position: sticky;
    top: -17px;
    z-index: 2;
    background-color: white;
}

table {
    table-layout: fixed;
    border-collapse: collapse;
    width: 100%;
}

tbody tr {
    background-color: white;
}

.rtl {
    direction: rtl;
}
</style>