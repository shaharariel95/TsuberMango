<template>
    <div class="flex flex-col space-y-4 p-4">
        <!-- Loading state and last pallet number -->
        <div class="mb-4">
            <div v-if="isLoading" class="text-xl">טוען...</div>
            <h2 v-else class="text-xl font-bold">מספר משטח אחרון: {{ message }}</h2>
        </div>

        <h2 class="text-2xl font-bold">הוספת רשומה חדשה</h2>

        <form @submit.prevent="submitForm" class="space-y-4 rtl">
            <!-- Farmer (from props) -->
            <div class="form-group">
                <label class="block text-right">חקלאי: {{ selectedFarmer }}</label>
                <!-- <input type="text" v-model="formData.farmer" :value="selectedFarmer" disabled
                    class="w-full p-2 border rounded-md bg-gray-100" /> -->
            </div>

            <!-- Shipment Date -->
            <div class="form-group">
                <label class="block text-right">
                    תאריך משלוח
                    <span class="text-red-500">*</span>
                </label>
                <input type="date" v-model="formData.shipmentDate" required class="w-full p-2 border rounded-md" />
            </div>

            <!-- Card ID -->
            <div class="form-group">
                <label class="block text-right">מספר כרטיס</label>
                <input type="number" v-model="formData.cardId" class="w-full p-2 border rounded-md" />
            </div>

            <!-- Harvest Date -->
            <div class="form-group">
                <label class="block text-right">
                    תאריך קטיף
                    <span class="text-red-500">*</span>
                </label>
                <input type="date" v-model="formData.harvestDate" required class="w-full p-2 border rounded-md" />
            </div>

            <!-- Pallet Number -->
            <div class="form-group">
                <label class="block text-right">
                    מספר משטח
                    <span class="text-red-500">*</span>
                </label>
                <input type="number" v-model="formData.palletNumber" required min="1"
                    class="w-full p-2 border rounded-md" />
            </div>

            <!-- Kind - Button Style Radio -->
            <div class="form-group">
                <label class="block text-right">
                    זן
                    <span class="text-red-500">*</span>
                </label>
                <div class="flex flex-wrap gap-2 p-4">
                    <template v-for="option in kinds" :key="option">
                        <label class="relative">
                            <input type="radio" v-model="formData.kind" :value="option" required
                                class="absolute opacity-0 w-0 h-0" />
                            <span class="px-4 py-2 border rounded-md cursor-pointer block text-center" :class="formData.kind === option ?
                                'bg-blue-500 text-white border-blue-500' :
                                'bg-white hover:bg-gray-100 border-gray-300'">
                                {{ option }}
                            </span>
                        </label>
                    </template>
                </div>
            </div>

            <!-- Size - Button Style Radio -->
            <div class="form-group">
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
                                :class="formData.size === size ?
                                    'bg-blue-500 text-white border-blue-500' :
                                    'bg-white hover:bg-gray-100 border-gray-300'">
                                {{ size }}
                            </span>
                        </label>
                    </template>
                </div>
            </div>

            <!-- Boxes -->
            <div class="form-group">
                <label class="block text-right">מספר קרטונים</label>
                <input type="number" v-model="formData.boxes" min="0" class="w-full p-2 border rounded-md" />
            </div>

            <!-- Weight -->
            <div class="form-group">
                <label class="block text-right">משקל</label>
                <input type="number" v-model="formData.weight" min="0" class="w-full p-2 border rounded-md" />
            </div>

            <!-- Destination -->
            <div class="form-group">
                <label class="block text-right">יעד</label>
                <input type="text" v-model="formData.destination" class="w-full p-2 border rounded-md" />
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end">
                <button type="submit"
                    class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                    :disabled="isSubmitting">
                    {{ isSubmitting ? 'מוסיף...' : 'הוסף' }}
                </button>
            </div>

            <!-- Success/Error Messages -->
            <div v-if="submitStatus"
                :class="{ 'text-green-500': submitStatus === 'success', 'text-red-500': submitStatus === 'error' }"
                class="text-right">
                {{ statusMessage }}
            </div>
        </form>
    </div>
</template>

<script>
import { ref, reactive, watch } from 'vue'

export default {
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },

    setup(props) {
        const kinds = ['שלי', 'טומי', 'מאיה', 'היידן']
        const sizes = [12, 15, 18, 21, 24, 28, 32]
        const isSubmitting = ref(false)
        const submitStatus = ref('')
        const statusMessage = ref('')
        const isLoading = ref(false)
        const message = ref("Loading...")

        const formData = reactive({
            farmer: props.selectedFarmer,
            shipmentDate: new Date().toISOString().split('T')[0],
            cardId: null,
            harvestDate: new Date().toISOString().split('T')[0],
            palletNumber: null,
            kind: '',
            size: null,
            boxes: null,
            weight: null,
            destination: ''
        })

        // Watch for changes in selectedFarmer and fetch data
        watch(() => props.selectedFarmer, async (newFarmer) => {
            formData.farmer = newFarmer
            if (newFarmer) {
                await fetchLastPallet(newFarmer)
            }
        }, { immediate: true })

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

        const resetForm = () => {
            formData.cardId = null
            formData.palletNumber = null
            formData.kind = ''
            formData.size = null
            formData.boxes = null
            formData.weight = null
            formData.destination = ''
            // Reset dates to current date
            formData.shipmentDate = new Date().toISOString().split('T')[0]
            formData.harvestDate = new Date().toISOString().split('T')[0]
        }

        const submitForm = async () => {
            isSubmitting.value = true
            submitStatus.value = ''
            statusMessage.value = ''
            try {
                const response = await fetch('http://localhost:3000/records', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ...formData,
                        shipmentDate: new Date(formData.shipmentDate)
                            .toLocaleDateString('en-GB'),
                        harvestDate: new Date(formData.harvestDate)
                            .toLocaleDateString('en-GB').slice(0, 5),
                    })
                })

                if (!response.ok) {
                    throw new Error('שגיאה בשליחת הטופס')
                }

                submitStatus.value = 'success'
                statusMessage.value = 'הנתונים נשלחו בהצלחה'
                resetForm()
                // Fetch updated last pallet number after successful submission
                await fetchLastPallet(formData.farmer)
            } catch (error) {
                submitStatus.value = 'error'
                statusMessage.value = error.message
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
            message
        }
    }
}
</script>

<style scoped>
.rtl {
    direction: rtl;
}
</style>