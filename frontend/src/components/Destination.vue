<template>
    <div class="h-full animate-fade-in">
        <LoadingState v-if="isLoading" />
        <PalletTable v-else v-model:pallets="pallets" :farmer="farmerName" :isEditable="true" :destinationOnly="false"
            title="הכנה למשלוח" subtitle="עריכת יעדים וסימון משטחים"
            :highlighted-ids="highlightedIds" />
    </div>
</template>

<script>
import { ref, watch, inject } from 'vue'
import PalletTable from './PalletTable.vue'
import LoadingState from './shared/LoadingState.vue'
import { useFarmerEvents } from '../composables/useFarmerEvents'
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
    components: {
        PalletTable,
        LoadingState
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
        const error = ref(null)
        const isLoading = ref(false)
        const farmerName = ref('')
        const currentUserEmail = inject('currentUserEmail', ref(''))
        const { highlightedIds } = useFarmerEvents(farmerName, pallets, {
          currentUserEmail, filter: p => p.mark === true
        })

        const getPallets = async (farmer) => {
            if (!farmer) return;

            isLoading.value = true
            try {
                const hebrewName = encodeURIComponent(farmer)
                const URL = `${baseUrl}/api/farmers/${hebrewName}/records/destinations`
                const res = await fetch(URL, { credentials: 'include' })

                if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)

                const data = await res.json()
                pallets.value = data.data;
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

        return { pallets, showError, error, isLoading, farmerName, highlightedIds }
    }
}
</script>