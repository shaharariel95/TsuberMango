<template>
    <div class="h-full">
        <div class="mb-4 flex flex-row justify-between" >
            <div v-if="!destinationOnly && !columnsFilter.length">
                <button @click="sendSelectedPallets" :disabled="isCreateLabelAllowed || isCreatingLabel"
                    class="font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                    :class="[(isCreateLabelAllowed || isCreatingLabel) ? 'bg-gray-400 hover:bg-gray-400' : '']"
                    v-if="isEditable">
                    <span v-if="isSendingPalletLoading == false">
                        צור תעודת משלוח
                    </span>
                    <div v-else class="loading-circle"></div>
                </button>
                <button @click="returnSentPallets" :disabled="selectedPallets.length === 0"
                    class="font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                    :class="[(selectedPallets.length === 0) ? 'bg-gray-400 hover:bg-gray-400' : '']" v-else>
                    החזר משטחים נשלחו
                </button>
                <button @click="printPDF" :disabled="selectedPallets.length !== 1 || isCreatingLabel"
                    class="font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors mx-3"
                    :class="[(selectedPallets.length !== 1 || isCreatingLabel) ? 'bg-gray-400 hover:bg-gray-400' : '']"
                    v-if="isEditable">
                    <span v-if="isSendingPalletLoading == false">
                        הפק מדבקה
                    </span>
                    <div v-else class="loading-circle"></div>
                </button>
                <button @click="sendToDestinations" :disabled="selectedPallets.length === 0 || isCreatingLabel"
                    class="font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors "
                    :class="[(selectedPallets.length === 0 || isCreatingLabel) ? 'bg-gray-400 hover:bg-gray-400' : '']"
                    v-if="isEditable">
                    <span v-if="isSendingPalletLoading == false">
                        העבר למארק
                    </span>
                    <div v-else class="loading-circle"></div>
                </button>
            </div>
            <div>
                <span class="font-bold text-lg p-2 m-4 rounded-lg border-2 border-gray-400">כמות משטחים: {{  AmountOfPallets }}</span>
                <button v-if="isEditable && !destinationOnly && !columnsFilter.length" @click="toggleSentView"
                        class="p-4 font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                    <span v-if="sentView">הצג משטחים שנשלחו</span>
                    <span v-else>הסתר משטחים שנשלחו</span>
                </button>
            </div>
        </div>
        <div class="overflow-auto h-[calc(100vh-50px)] sm:h-[calc(100vh-140px)] w-100%">
            <table class="w-full bg-white border-collapse rtl">
                <thead>
                    <tr>
                        <th v-for="col in columns" :key="col.key" :class="col.class">
                            <div class="flex items-center flex-col">
                                {{ (col.key === 'selected' && !isEditable) ? 'הורדת סטטוס נשלח' : col.label }}
                                <select v-if="col.filter" v-model="filterBy[col.key]"
                                class="ml-2 border border-black rounded-md mx-2 bg-neutral-50 text-center text-ellipsis overflow-hidden max-w-[150px] ">
                                <option value="">הכל</option>
                                <option v-for="option in getFilterOptions(col.key)" :key="option" :value="option"
                                class="text-ellipsis overflow-hidden max-w-[150px]">
                                {{ option }}
                            </option>
                        </select>
                        <span v-if="col.sortable" @click="sortBy(col.key)" class="cursor-pointer">
                            {{ col.key === sortField ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅' }}
                        </span>
                            <input v-if="col.key === 'selected'" type="checkbox" @change="toggleSelectAll"
                                :checked="selectedPallets.length === filteredPallets.length" />
                            </div>
                        </th>
                        <th class="border border-black px-4 py-2 w-[6%]" v-if="isEditable">עריכה</th>
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
                                        <input type="text" v-model="destinationFilterText" placeholder="סנן יעד..." class="w-full border rounded px-2 py-1 mb-1" />
                                        <select v-model="editingPallet[col.key]" class="w-full border rounded px-2 py-1">
                                            <option v-for="destination in filteredDestinations" :key="destination" :value="destination">{{ destination }}</option>
                                        </select>
                                    </div>
                                    <div v-else-if="col.key == 'gidon'">
                                        <input type="checkbox" v-model="editingPallet[col.key]"
                                        class="w-full h-5 border rounded px-2 py-1" />
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
                        <td v-for="col in columns" :key="col.key" class="border-b border-r border-black px-4 py-2"
                        :class="!isEditable ? 'border-l' : ''">
                        <template v-if="col.key === 'selected'">
                            <input type="checkbox" v-model="selectedPallets" :value="pallet.id" />
                        </template>
                        <!-- <template v-if="col.key === 'gidon'">
                            <span :class="pallet[col.key] ? 'bg-green-500' : ''"
                            class="inline-block w-3 h-3 rounded-full mr-2"></span>
                        </template> -->
                        <template v-if="col.key === 'sent'">
                            <span :class="pallet[col.key] ? 'bg-green-500' : 'bg-gray-400'"
                            class="inline-block w-3 h-3 rounded-full mr-2"></span>
                        </template>
                        <template v-else>{{ pallet[col.key] }}</template>
                            </td>
                            <td class="border border-b border-black px-4 py-2" v-if="isEditable">
                                <button @click="startEditing(pallet)" class="text-blue-600">Edit</button>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
        </div>

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
        }
    },

    data() {
        let columns = [
            { key: 'sent', label: 'נשלח', editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'shipmentDate', label: 'תאריך משלוח', sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[11%]' },
            { key: 'cardId', label: 'מספר תעודה', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'harvestDate', label: 'תאריך קטיף', editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
            { key: 'palletNumber', label: 'מספר משטח', sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'kind', label: 'זן', filter: true, sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
            { key: 'size', label: 'גודל', filter: true, sortable: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'boxes', label: 'ארגזים', editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'weight', label: 'משקל', editable: true, class: 'border border-black px-4 py-2 w-[8%]' },
            { key: 'destination', label: 'יעד', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[15%]' },
            { key: 'gidon', label: 'הערה', filter: true, editable: true, class: 'border border-black px-4 py-2 w-[6%]' },
            { key: 'selected', label: 'בחירת משטח', class: 'border border-black px-4 py-2 w-[6%]' }
        ];
        if (this.destinationOnly) {
            columns = columns.filter(col => !['harvestDate', 'gidon', 'selected'].includes(col.key));
            columns = columns.map(col => ({
                ...col,
                editable: col.key === 'destination'
            }));
        }
        if (this.columnsFilter && this.columnsFilter.length > 0) {
            columns = columns.filter(col => !this.columnsFilter.includes(col.key));
        }
        // Only show gidon column for farmer גבי צוברי
        if (this.farmer !== 'גבי צוברי') {
            columns = columns.filter(col => col.key !== 'gidon');
        }
        return {
            kinds,
            sizes,
            destinations,
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
        }
    },

    computed: {
        isCreateLabelAllowed() {
            return this.selectedPallets.length === 0 || this.selectedPallets.length > 13
        },
        filteredPallets() {
            return this.pallets.filter(pallet => {
                const matchesSent = this.sentView ? pallet.sent === false : true;

                // Check each filter property
                let allFiltersMatch = true;

                // Special handling for gidon filter
                if (this.filterBy.gidon !== undefined && this.filterBy.gidon !== null) {
                    if (this.filterBy.gidon === "גדעון") {
                        // When filter is "גדעון", show only true values
                        if (!pallet.gidon) return false;
                    } else if (this.filterBy.gidon === "אין הערה") {
                        // When filter is empty string, show only false values
                        if (pallet.gidon) return false;
                    }
                }

                // Handle other filters
                for (const [key, value] of Object.entries(this.filterBy)) {
                    if (key === 'gidon') continue; // Skip gidon, already handled

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
        async sendToDestinations() {
            this.isCreatingLabel = true
            const selectedPalletsData = this.filteredPallets.filter(p =>
                this.selectedPallets.includes(p.id)
            );
            try {
                const response = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(this.farmer)}/destinations/toSend`, {
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
                console.log(palletsToUpdate)
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

                // Clear selected pallets upon success
                this.selectedPallets = [];
                window.location.reload();
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
td, th {
  height: 40px;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  vertical-align: middle;
}
tbody tr {
    background-color: white;
}

.rtl {
    direction: rtl;
}

.loading-circle {
    width: 25px;
    height: 25px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #34db8d;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>