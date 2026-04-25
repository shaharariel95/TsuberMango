<template>
    <div class="flex flex-col gap-6 animate-fade-in">
        <!-- Page Header -->
        <div class="flex items-center justify-between rtl">
            <div>
                <h2 class="text-3xl font-bold text-slate-800">קליטה</h2>
                <p class="text-slate-500 text-sm mt-0.5">רישום משטח חדש</p>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-slate-500 text-sm">מגדל:</span>
                <span class="font-bold text-base bg-mango-50 text-mango-800 border border-mango-200 rounded-lg px-4 py-1.5">
                    {{ selectedFarmer }}
                </span>
            </div>
        </div>

        <!-- Form -->
        <form @submit.prevent="submitForm" class="space-y-5 rtl">
            <!-- Required Fields Section -->
            <div class="card space-y-5">
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-1 h-5 bg-mango-500 rounded-full"></div>
                    <span class="text-sm font-semibold text-slate-500 uppercase tracking-wide">שדות חובה</span>
                </div>

                <!-- Row 1: Date, Pallet Number, Boxes -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-base font-medium">
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">
                            תאריך קטיף <span class="text-red-400">*</span>
                        </label>
                        <input type="date" v-model="formData.harvestDate" required class="input-field" />
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">
                            מספר משטח <span class="text-red-400">*</span>
                        </label>
                        <input type="number" v-model="formData.palletNumber" required min="1" class="input-field" />
                        <div class="mt-1 text-xs text-slate-400">
                            <span v-if="isLoading" class="flex items-center gap-1">
                                <span class="loading-spinner !w-3 !h-3"></span> טוען...
                            </span>
                            <span v-else>משטח אחרון: <strong class="text-mango-600">{{ message }}</strong></span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">
                            ארגזים <span class="text-red-400">*</span>
                        </label>
                        <input type="number" v-model="formData.boxes" min="0" class="input-field" />
                    </div>
                </div>

                <!-- Row 2: Kind and Size chips -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-slate-600 mb-2 text-sm font-medium">
                            זן <span class="text-red-400">*</span>
                        </label>
                        <div class="flex flex-wrap gap-2">
                            <template v-for="option in kinds" :key="option">
                                <label class="relative cursor-pointer">
                                    <input type="radio" v-model="formData.kind" :value="option" required
                                        class="absolute opacity-0 w-0 h-0" />
                                    <span class="chip" :class="{ 'chip-active': formData.kind === option }">
                                        {{ option }}
                                    </span>
                                </label>
                            </template>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-2 text-sm font-medium">
                            גודל <span class="text-red-400">*</span>
                        </label>
                        <div class="flex flex-wrap gap-2">
                            <template v-for="size in sizes" :key="size">
                                <label class="relative cursor-pointer">
                                    <input type="radio" v-model="formData.size" :value="size" required
                                        class="absolute opacity-0 w-0 h-0" />
                                    <span class="chip min-w-[52px]" :class="{ 'chip-active': formData.size === size }">
                                        {{ size }}
                                    </span>
                                </label>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- Gidon checkbox (conditional) -->
                <div v-if="farmerConfigs[selectedFarmer]?.allowGidon" class="flex items-center gap-3">
                    <label class="relative cursor-pointer">
                        <input type="checkbox" v-model="formData.gidon" class="absolute opacity-0 w-0 h-0" />
                        <span class="chip" :class="{ 'chip-active': formData.gidon }">
                            גדעון
                        </span>
                    </label>
                    <span class="text-xs text-slate-400">הערה</span>
                </div>
            </div>

            <!-- Optional Fields Section -->
            <div class="card space-y-4">
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-1 h-5 bg-slate-300 rounded-full"></div>
                    <span class="text-sm font-semibold text-slate-400 uppercase tracking-wide">שדות נוספים</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-base">
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">תאריך משלוח</label>
                        <input type="date" v-model="formData.shipmentDate" class="input-field" />
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">מספר תעודה</label>
                        <input type="number" v-model="formData.cardId" class="input-field" />
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1.5 text-sm">משקל</label>
                        <input type="number" v-model="formData.weight" min="0" class="input-field" />
                    </div>
                </div>

                <div>
                    <label class="block text-slate-600 mb-1.5 text-sm">יעד</label>
                    <select v-model="formData.destination" class="input-field font-medium">
                        <option v-for="destination in destinations" :value="destination" :key="destination">
                            {{ destination }}
                        </option>
                    </select>
                </div>
            </div>

            <!-- Submit Row -->
            <div class="flex items-center justify-between gap-4">
                <div class="flex-1">
                    <Transition
                        enter-active-class="transition-all duration-300"
                        enter-from-class="opacity-0 translate-y-2"
                        enter-to-class="opacity-100 translate-y-0">
                        <div v-if="submitStatus"
                            :class="[
                                'font-semibold text-sm rounded-lg px-4 py-2 inline-flex items-center gap-2',
                                submitStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                            ]">
                            <svg v-if="submitStatus === 'success'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {{ statusMessage }}
                        </div>
                    </Transition>
                </div>
                <button type="submit"
                    class="btn-primary text-lg px-8 py-3 flex items-center gap-2"
                    :disabled="isSubmitting">
                    <span class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white" v-if="isSubmitting"></span>
                    {{ isSubmitting ? 'מוסיף...' : 'הוסף' }}
                </button>
            </div>
        </form>

        <!-- Last Submitted Pallet -->
        <Transition
            enter-active-class="transition-all duration-300"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0">
            <div v-if="lastFormData" class="card border-r-4 border-r-mango-400 rtl">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-slate-700 flex items-center gap-2">
                        <svg class="w-5 h-5 text-mango-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        פרטי משטח אחרון שנשלח
                    </h3>
                    <button @click="printPDF" class="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        הפק מדבקה
                    </button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">מגדל</span>
                        <span class="font-semibold">{{ lastFormData.farmer }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">תאריך קטיף</span>
                        <span class="font-semibold">{{ lastFormData.harvestDate }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">תאריך משלוח</span>
                        <span class="font-semibold">{{ lastFormData.shipmentDate || 'לא צוין' }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">מספר משטח</span>
                        <span class="font-semibold">{{ lastFormData.palletNumber }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">מספר כרטיס</span>
                        <span class="font-semibold">{{ lastFormData.cardId || 'לא צוין' }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">זן</span>
                        <span class="font-semibold">{{ lastFormData.kind }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">גודל</span>
                        <span class="font-semibold">{{ lastFormData.size }}</span>
                    </div>
                    <div v-if="farmerConfigs[selectedFarmer]?.allowGidon" class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">גדעון</span>
                        <span class="font-semibold">{{ lastFormData.gidon ? 'כן' : 'לא' }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">ארגזים</span>
                        <span class="font-semibold">{{ lastFormData.boxes }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">משקל</span>
                        <span class="font-semibold">{{ lastFormData.weight || 'לא צוין' }}</span>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-2.5">
                        <span class="text-slate-400 text-xs block">יעד</span>
                        <span class="font-semibold">{{ lastFormData.destination || 'לא צוין' }}</span>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script>
import { inject, ref, reactive, watch, computed } from 'vue'
import createStickerPDF from '../data/printData.js';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },

    setup(props) {
        const isSubmitting = ref(false)
        const submitStatus = ref('')
        const statusMessage = ref('')
        const config = inject('config');

        // Reactive lists from config
        const kinds = computed(() => config.kinds || []);
        const sizes = computed(() => config.sizes || []);
        const destinations = computed(() => config.destinations || []);
        const farmerConfigs = computed(() => config.farmerConfigs || {});

        const isLoading = ref(false)
        const message = ref("Loading...")
        const lastFormData = ref(null)

        const formData = reactive({
            farmer: props.selectedFarmer,
            shipmentDate: '',
            cardId: null,
            harvestDate: new Date().toISOString().split('T')[0],
            palletNumber: null,
            kind: '',
            size: null,
            boxes: null,
            weight: null,
            destination: '',
            gidon: false,
        })

        // Define fetchLastPallet before using it in watch
        const fetchLastPallet = async (farmer) => {
            if (!farmer) return;

            isLoading.value = true
            try {
                const encodedFarmer = encodeURIComponent(farmer)
                const URL = `${baseUrl}/api/farmers/${encodedFarmer}/records/lastPallet`
                const res = await fetch(URL, { credentials: 'include' })
                const data = await res.json()
                message.value = data.data
            } catch (err) {
                console.error('Error fetching last pallet:', err)
            } finally {
                isLoading.value = false
            }
        }

        // Watch for changes in selectedFarmer
        watch(() => props.selectedFarmer, async (newFarmer) => {
            formData.farmer = newFarmer
            if (newFarmer) {
                await fetchLastPallet(newFarmer)
            }
        }, { immediate: true })

        const resetForm = () => {
            formData.cardId = null
            formData.palletNumber = null
            formData.kind = ''
            formData.size = null
            formData.boxes = null
            formData.weight = null
            formData.destination = ''
            formData.shipmentDate = ''
            formData.harvestDate = new Date().toISOString().split('T')[0]
            formData.gidon = false
        }

        const submitForm = async () => {
            isSubmitting.value = true
            submitStatus.value = ''
            statusMessage.value = ''

            try {
                const formattedData = {
                    ...formData,
                    shipmentDate: formData.shipmentDate ?
                        new Date(formData.shipmentDate).toLocaleDateString('en-GB') : '',
                    harvestDate: new Date(formData.harvestDate)
                        .toLocaleDateString('en-GB').slice(0, 5),
                }
                console.log('Formatted Data:', formattedData)
                const response = await fetch(`${baseUrl}/api/records`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formattedData),
                    credentials: 'include'
                })

                if (!response.ok) {
                    throw new Error('שגיאה בשליחת הטופס')
                }

                submitStatus.value = 'success'
                statusMessage.value = 'הנתונים נשלחו בהצלחה'
                lastFormData.value = { ...formattedData }  // Create a new object to ensure reactivity
                await fetchLastPallet(formData.farmer)
                resetForm()
            } catch (error) {
                submitStatus.value = 'error'
                statusMessage.value = error.message
                console.error('Submit error:', error)
            } finally {
                isSubmitting.value = false
            }
        }

        return {
            formData,
            kinds,
            sizes,
            isSubmitting,
            submitForm,
            submitStatus,
            statusMessage,
            isLoading,
            message,
            destinations,
            kinds,
            sizes,
            farmerConfigs,
            lastFormData  // Make sure to return lastFormData
        }
    },
    methods: {
        printPDF() {
            // Sample Data
            const sampleData = {
                platformNumber: this.lastFormData.palletNumber || "",
                farmer: this.lastFormData.farmer || "",
                variety: this.lastFormData.kind || "",
                size: this.lastFormData.size || "",
                quantity: this.lastFormData.boxes || "",
                weight: this.lastFormData.weight || "",

            };

            createStickerPDF(sampleData);
        }
    }
}
</script>