<template>
    <div class="animate-fade-in">
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
            <span class="loading-spinner !w-10 !h-10 !border-[3px]"></span>
            <span class="text-slate-400 text-sm font-medium">טוען נתונים...</span>
        </div>
        <PalletTable v-else v-model:pallets="message" :farmer="farmerName"
            title="טבלת נתונים" subtitle="כל המשטחים של המגדל" />
    </div>
</template>

<script>
import { ref, watch } from 'vue'
import PalletTable from './PalletTable.vue'
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
        const error = ref(null)
        const isLoading = ref(false)
        const farmerName = ref('')

        const getPallets = async (farmer) => {
            if (!farmer) return;

            isLoading.value = true
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
                error.value = err.message
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

        return { message, showError, error, isLoading, farmerName }
    }
}
</script>