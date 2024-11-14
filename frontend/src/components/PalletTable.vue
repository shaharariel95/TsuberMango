<template>
    <div>
        <div class="mb-4">
            <button @click="sendSelectedPallets" :disabled="selectedPallets.length === 0"
                class="p-4 font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                Send Selected Pallets
            </button>
        </div>
        <table class="w-full bg-gray-200 border-collapse rtl">
            <thead>
                <tr>
                    <th class="border border-black px-4 py-2 w-[6%]">
                        <button @click="sortBy('palletNumber')" class="flex items-center">
                            מספר משטח
                            <span v-if="sortField === 'palletNumber'"
                                :class="sortDirection === 'asc' ? '▲' : '▼'"></span>
                        </button>
                    </th>
                    <th class="border border-black px-4 py-2 w-[8%]">
                        <button @click="sortBy('shipmentDate')" class="flex items-center">
                            תאריך משלוח
                            <span v-if="sortField === 'shipmentDate'"
                                :class="sortDirection === 'asc' ? '▲' : '▼'"></span>
                        </button>
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]">מספר תעודה</th>
                    <th class="border border-black px-4 py-2 w-[8%]">תאריך קטיף</th>
                    <th class="border border-black px-4 py-2 w-[8%]"> זן:
                        <select v-model="filterBy.kind" class="ml-2 bg-gray-300">
                            <option value="">הכל</option>
                            <option v-for="option in kindOptions" :value="option" :key="option">{{ option }}</option>
                        </select>
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]"> גודל:
                        <select v-model="filterBy.size" class="ml-2 bg-gray-300">
                            <option value="">הכל</option>
                            <option v-for="size in sizeOptions" :value="size" :key="size">{{ size }}</option>
                        </select>
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]">ארגזים</th>
                    <th class="border border-black px-4 py-2 w-[8%]">משקל</th>
                    <th class="border border-black px-4 py-2 w-[20%]"> יעד:
                        <select v-model="filterBy.destination" class="ml-2 bg-gray-300">
                            <option value="">הכל</option>
                            <option v-for="option in destinationOptions" :value="option" :key="option">{{ option }}
                            </option>
                        </select>
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]">
                        בחירה לתעודת משלוח
                        <input type="checkbox" v-model="selectedPallets" @change="toggleSelectAll" />
                    </th>
                    <th class="border border-black px-4 py-2 w-[6%]">עריכה</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="pallet in sortedPallets" :key="pallet.id" class="border-b text-center">
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.palletNumber }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.shipmentDate }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.cardId }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.harvestDate }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.kind }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.size }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.boxes }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.weight }}</td>
                    <td class="border-b border-r border-black px-4 py-2">{{ pallet.destination }}</td>
                    <td class="border border-b border-black px-4 py-2">
                        <input type="checkbox" v-model="selectedPallets" :value="pallet.id" />
                    </td>
                    <td class="border border-b border-black px-4 py-2">
                        <button @click="editPallet(pallet)">Edit</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
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
            filterBy: {
                kind: '',
                size: '',
                destination: ''
            },
            selectedPallets: [],
            sortField: 'palletNumber',
            sortDirection: 'asc'
        }
    },
    computed: {
        filteredPallets() {
            return this.pallets.filter(pallet => {
                return (
                    (this.filterBy.kind === '' || pallet.kind === this.filterBy.kind) &&
                    (this.filterBy.size === '' || pallet.size === this.filterBy.size) &&
                    (this.filterBy.destination === '' || pallet.destination === this.filterBy.destination)
                );
            });
        },
        sortedPallets() {
            return this.filteredPallets.sort((a, b) => {
                // Sort by pallet number first, then by the current sort field
                return this.sortField === 'palletNumber'
                    ? this.sortPalletNumbers(a, b)
                    : this.sortByField(a, b);
            });
        },
        kindOptions() {
            return [...new Set(this.pallets.map(p => p.kind))];
        },
        sizeOptions() {
            return [...new Set(this.pallets.map(p => p.size))];
        },
        destinationOptions() {
            return [...new Set(this.pallets.map(p => p.destination))];
        }
    },
    methods: {
        toggleSelectAll() {
            this.selectedPallets = this.selectedPallets.length === this.filteredPallets.length ? [] : this.filteredPallets.map(p => p.id);
        },
        editPallet(pallet) {
            this.$router.push(`/edit-pallet/${pallet.id}`, pallet);
        },
        sendSelectedPallets() {
            const selectedPalletsData = this.filteredPallets.filter(p => this.selectedPallets.includes(p.id));
            console.log('Sending selected pallets:', selectedPalletsData);
            this.selectedPallets = [];
        },
        sortBy(field) {
            this.sortField = field;
            this.sortDirection = this.sortField === field && this.sortDirection === 'asc' ? 'desc' : 'asc';
        },
        sortPalletNumbers(a, b) {
            // Convert the pallet numbers to numbers and sort numerically
            const aNum = parseInt(a.palletNumber);
            const bNum = parseInt(b.palletNumber);
            if (aNum < bNum) return this.sortDirection === 'asc' ? -1 : 1;
            if (aNum > bNum) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        },
        sortByField(a, b) {
            if (a[this.sortField] < b[this.sortField]) return this.sortDirection === 'asc' ? -1 : 1;
            if (a[this.sortField] > b[this.sortField]) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        }
    }
}
</script>

<style scoped>
table {
    table-layout: fixed;
}

.rtl {
    direction: rtl;
}
</style>