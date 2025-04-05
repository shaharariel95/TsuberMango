<template>
    <div class="flex flex-col space-y-4 p-4">
        <!-- Loading state and last pallet number -->
        <div class="mb-4 rtl">
            <h2 class="text-5xl mb-4 font-bold ">קליטה - רישום משטח חדש</h2>
            <!-- Farmer -->
            <div class="form-group text-2xl mt-4">
                <label class="block text-right">מגדל:
                    <label class="text-bold border border-black rounded-lg p-2 bg-white ">{{ selectedFarmer }}</label>
                </label>
            </div>
        </div>


        <form @submit.prevent="submitForm" class="space-y-4 rtl">
            <!-- First Row: Harvest Date and Pallet Number -->
            <div class="flex gap-4 text-xl font-bold">
                <div class="flex-1">
                    <label class="block text-right">
                        תאריך קטיף
                        <span class="text-red-500">*</span>
                    </label>
                    <input type="date" v-model="formData.harvestDate" required class="w-full p-2 border rounded-md" />
                </div>
                <div class="flex-1">
                    <label class="block text-right">
                        מספר משטח
                        <span class="text-red-500">*</span>
                    </label>
                    <input type="number" v-model="formData.palletNumber" required min="1"
                        class="w-full p-2 border rounded-md" />
                    <div v-if="isLoading" class="font-normal">טוען...</div>
                    <div v-else class="font-normal">מספר משטח אחרון: {{ message }}</div>
                </div>
                <div class="flex-1">
                    <label class="block text-right">
                        ארגזים
                        <span class="text-red-500">*</span>
                    </label>
                    <input type="number" v-model="formData.boxes" min="0" class="w-full p-2 border rounded-md" />
                </div>
            </div>

            <!-- Second Row: Kind and Size -->
            <div class="flex gap-4 text-xl font-bold">
                <div class="flex-1">
                    <label class="block text-right">
                        זן
                        <span class="text-red-500">*</span>
                    </label>
                    <div class="flex flex-wrap gap-2 p-4">
                        <template v-for="option in kinds" :key="option">
                            <label class="relative">
                                <input type="radio" v-model="formData.kind" :value="option" required
                                    class="absolute opacity-0 w-0 h-0" />
                                <span class="px-4 py-2 border rounded-md cursor-pointer block text-center"
                                    :class="formData.kind === option ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-100 border-gray-300'">
                                    {{ option }}
                                </span>
                            </label>
                        </template>
                    </div>
                </div>
                <div class="flex-1">
                    <label class="block text-right">
                        גודל
                        <span class="text-red-500">*</span>
                    </label>
                    <div class="flex flex-wrap gap-2 p-4">
                        <template v-for="size in sizes" :key="size">
                            <label class="relative">
                                <input type="radio" v-model="formData.size" :value="size" required
                                    class="absolute opacity-0 w-0 h-0" />
                                <span class="px-4 py-2 border rounded-md cursor-pointer block text-center min-w-[60px]"
                                    :class="formData.size === size ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-100 border-gray-300'">
                                    {{ size }}
                                </span>
                            </label>
                        </template>
                    </div>
                </div>
                <div>
                    <label class="block text-right pb-2">
                        הערה  
                    </label>
                    <label class="relative">
                        <input type="checkbox" v-model="formData.gidon"
                            class="absolute opacity-0 w-0 h-0" />
                        <span class="px-4 py-2 border rounded-md cursor-pointer block text-center min-w-[60px]"
                            :class="formData.gidon ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-100 border-gray-300'">
                            גדעון
                        </span>
                    </label>
                </div>
            </div>

            <!-- Seperation line from requirent to not required-->
            <div class="border-t border-gray-700 my-4"></div>

            <!-- Third Row: Shipment Date, Card ID, Boxes, Weight -->
            <div class="flex gap-4 text-xl">
                <div class="flex-1">
                    <label class="block text-right">תאריך משלוח</label>
                    <input type="date" v-model="formData.shipmentDate" class="w-full p-2 border rounded-md" />
                </div>
                <div class="flex-1">
                    <label class="block text-right">מספר כרטיס</label>
                    <input type="number" v-model="formData.cardId" class="w-full p-2 border rounded-md" />
                </div>
                <div class="flex-1">
                    <label class="block text-right">משקל</label>
                    <input type="number" v-model="formData.weight" min="0" class="w-full p-2 border rounded-md" />
                </div>
            </div>

            <!-- Fourth Row: Destination -->
            <div class="form-group text-xl">
                <label class="block text-right">יעד</label>
                <select v-model="formData.destination" class="w-full p-2 border rounded-md bg-white">
                    <option v-for="destination in destinations" :value="destination" :key="destination">{{ destination
                        }}</option>
                </select>
            </div>

            <!-- Submit Button and Status Messages Row -->
            <div class="flex items-center justify-center gap-4">
                <div class="flex-1 text-xl">
                    <!-- Success/Error Messages -->
                    <div v-if="submitStatus"
                        :class="'font-bold text-2xl', {'text-yellow-300': submitStatus === 'success', 'text-red-500': submitStatus === 'error' }"
                        class="text-left">
                        {{ statusMessage }}
                    </div>
                </div>
                <button type="submit"
                    class="text-2xl p-4 font-bold bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                    :disabled="isSubmitting">
                    {{ isSubmitting ? 'מוסיף...' : 'הוסף' }}
                </button>
            </div>
        </form>

        <!-- last form data -->
        <div v-if="lastFormData" class="mt-8 p-4 border rounded-lg bg-gray-50 rtl">
            <h3 class="text-2xl font-bold mb-4">פרטי משטח אחרון שנשלח:</h3>
            <div class="grid grid-cols-2 gap-4 text-xl">
                <div class="col-span-2">
                    <span class="font-bold">מגדל: </span>
                    <span>{{ lastFormData.farmer }}</span>
                </div>
                <div>
                    <span class="font-bold">תאריך קטיף: </span>
                    <span>{{ lastFormData.harvestDate }}</span>
                </div>
                <div>
                    <span class="font-bold">תאריך משלוח: </span>
                    <span>{{ lastFormData.shipmentDate || 'לא צוין' }}</span>
                </div>
                <div>
                    <span class="font-bold">מספר משטח: </span>
                    <span>{{ lastFormData.palletNumber }}</span>
                </div>
                <div>
                    <span class="font-bold">מספר כרטיס: </span>
                    <span>{{ lastFormData.cardId || 'לא צוין' }}</span>
                </div>
                <div>
                    <span class="font-bold">זן: </span>
                    <span>{{ lastFormData.kind }}</span>
                </div>
                <div>
                    <span class="font-bold">גודל: </span>
                    <span>{{ lastFormData.size }}</span>
                </div>
                <div>
                    <span class="font-bold">גדעון: </span>
                    <span>{{ lastFormData.gidon ? 'כן' : 'לא' }}</span>
                </div>
                <div>
                    <span class="font-bold">ארגזים: </span>
                    <span>{{ lastFormData.boxes }}</span>
                </div>
                <div>
                    <span class="font-bold">משקל: </span>
                    <span>{{ lastFormData.weight || 'לא צוין' }}</span>
                </div>
                <div>
                    <span class="font-bold">יעד: </span>
                    <span>{{ lastFormData.destination || 'לא צוין' }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { kinds, sizes, destinations } from "../data/data.js"
import { ref, reactive, watch } from 'vue'

export default {
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },

    setup(props) {
        destinations
        kinds
        sizes
        const isSubmitting = ref(false)
        const submitStatus = ref('')
        const statusMessage = ref('')
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
                const URL = `http://localhost:3000/farmers/${encodedFarmer}/records/lastPallet`
                const res = await fetch(URL)
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
                const response = await fetch('http://localhost:3000/records', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formattedData)
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
            lastFormData  // Make sure to return lastFormData
        }
    }
}
</script>

<style scoped>
.rtl {
    direction: rtl;
}
</style>