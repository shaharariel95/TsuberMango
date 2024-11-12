<template>
    <div class="bg-blue-50 text-red-900">
        <div class="border-2 border-black border-spacing-1 rounded-md">
            <p v-for="item in message" :key="item" class="border-b-2 p-3 border-gray-700">{{ item }}</p>
        </div>
    </div>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
    setup() {
        const message = ref("Loading...")
        const showError = ref(false)
        const error = ref(null)

        onMounted(async () => {
            try {
                // const res = await fetch('http://localhost:3000/farmers/גבי/records')
                // const data = await res.json()
                const value = { "id": 1, "shipment2": "2012/20/20" }
                message.value = value

            } catch (err) {
                showError.value = true
                error.value = err.message
            }
        })

        return { message, showError, error }
    }
}
</script>