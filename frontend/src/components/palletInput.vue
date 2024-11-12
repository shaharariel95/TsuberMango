<template>
    <div class="flex flex-col">
        <h1 class="font-bold p-2 text-3xl ">קליטה</h1>
        <div v-if="isLoading">Loading...</div>
        <h2 v-else>{{ message }}</h2>
    </div>
</template>

<script>
import { ref, watch } from 'vue'

export default {
    props: {
        selectedFarmer: {
            type: String,
            required: true
        }
    },
    setup(props) {
        const message = ref("Loading...")
        const showError = ref(false)
        const error = ref(null)
        const isLoading = ref(false)

        // Function to fetch data
        const fetchData = async (farmer) => {
            if (!farmer) return; // Don't fetch if no farmer selected

            isLoading.value = true
            try {
                const encodedFarmer = encodeURIComponent(farmer)
                const URL = `http://localhost:3000/farmers/${encodedFarmer}/records/lastPallet`
                const res = await fetch(URL)
                const data = await res.json()
                message.value = data.data
            } catch (err) {
                showError.value = true
                error.value = err.message
            } finally {
                isLoading.value = false
            }
        }

        // Watch for changes in selectedFarmer and fetch data
        watch(() => props.selectedFarmer, (newFarmer) => {
            if (newFarmer) {
                fetchData(newFarmer)
            }
        }, { immediate: true }) // immediate: true will run on component mount

        return { message, showError, error, isLoading }
    }
}
</script>