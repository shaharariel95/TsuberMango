<template>
    <div class="h-full animate-fade-in">
        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
            <span class="loading-spinner !w-10 !h-10 !border-[3px]"></span>
            <span class="text-slate-400 text-sm font-medium">טוען נתונים...</span>
        </div>

        <!-- Error state -->
        <div v-else-if="showError" class="flex flex-col items-center justify-center py-20 gap-4">
            <div class="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full text-center shadow-sm">
                <svg class="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p class="text-red-700 font-semibold text-sm mb-1">שגיאה:</p>
                <p class="text-red-600 text-sm mb-4">{{ errorMessage }}</p>
                <button @click="getPallets(farmerName)"
                    class="px-4 py-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all">
                    נסה שוב
                </button>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="message.length === 0" class="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span class="text-sm font-medium">אין נתונים להצגה</span>
        </div>

        <!-- Table -->
        <PalletTable v-else v-model:pallets="message" :farmer="farmerName"
            title="טבלת נתונים" subtitle="כל המשטחים של המגדל" />
    </div>
</template>

<script>
import { ref, watch } from 'vue'
import PalletTable from './PalletTable.vue'
import { useNotification } from '../composables/useNotification'
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
    components: {
        PalletTable
    },
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },
    setup(props) {
        const message = ref([])
        const showError = ref(false)
        const errorMessage = ref('')
        const isLoading = ref(false)
        const farmerName = ref('')
        const { notify } = useNotification()

        const getPallets = async (farmer) => {
            if (!farmer) return;

            isLoading.value = true
            showError.value = false
            errorMessage.value = ''
            try {
                const hebrewName = encodeURIComponent(farmer)
                const URL = `${baseUrl}/api/farmers/${hebrewName}/records`
                const res = await fetch(URL, { credentials: 'include' })

                if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)

                const data = await res.json()
                console.log(`data: `, data)
                message.value = data.data
            } catch (err) {
                showError.value = true
                errorMessage.value = err.message
                notify(err.message, 'error')
            } finally {
                isLoading.value = false
            }
        }

        watch(() => props.selectedFarmer, async (newFarmer) => {
            if (newFarmer) {
                farmerName.value = newFarmer
                await getPallets(newFarmer)
            }
        }, { immediate: true })

        return { message, showError, errorMessage, isLoading, farmerName, getPallets }
    }
}
</script>
