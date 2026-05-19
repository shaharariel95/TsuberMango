<template>
    <div class="h-auto lg:h-full animate-fade-in">
        <!-- Loading -->
        <LoadingState v-if="isLoading" />

        <!-- Error state -->
        <ErrorState v-else-if="showError" title="שגיאה:" :message="errorMessage" @retry="getPallets(farmerName)" />

        <!-- Empty state -->
        <EmptyState v-else-if="pallets.length === 0" />

        <!-- Table -->
        <PalletTable v-else v-model:pallets="pallets" :farmer="farmerName" :isEditable="false"
            :columnsFilter="['sent','gidon','harvestDate','selected']"
            title="יצאו למשלוח" subtitle="משטחים שנשלחו עם פרטי משלוח" />
    </div>
</template>

<script>
import { ref, watch } from 'vue'
import PalletTable from './PalletTable.vue'
import { useNotification } from '../composables/useNotification'
import LoadingState from './shared/LoadingState.vue'
import ErrorState from './shared/ErrorState.vue'
import EmptyState from './shared/EmptyState.vue'
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
    components: {
        PalletTable,
        LoadingState,
        ErrorState,
        EmptyState
    },
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },
    setup(props) {
        const pallets = ref([])
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
                pallets.value = data.data.filter(item => item.sent === true);
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

        return { pallets, showError, errorMessage, isLoading, farmerName, getPallets }
    }
}
</script>
