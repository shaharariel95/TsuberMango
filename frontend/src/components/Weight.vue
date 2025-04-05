<template>
    <div class="">
        <div class="  border-black border-spacing-1 rounded-md">
            <p v-if="isLoading" class="border-b-2 p-3 border-gray-700">Loading...</p>
            <PalletTable v-else v-model:pallets="message" :farmer="farmerName" />
        </div>
    </div>
</template>

<script>
import { ref, watch } from 'vue'
import PalletTable from './PalletTable.vue'

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
                const URL = `http://localhost:3000/farmers/${hebrewName}/records`
                const res = await fetch(URL)

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