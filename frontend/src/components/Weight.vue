<template>
    <div class="h-full animate-fade-in">
        <!-- Loading -->
        <LoadingState v-if="isLoading" />

        <!-- Error state -->
        <ErrorState v-else-if="showError" title="שגיאה:" :message="errorMessage" @retry="getPallets(farmerName)" />

        <!-- Empty state -->
        <EmptyState v-else-if="message.length === 0" />

        <!-- Table + H4 controls -->
        <div v-else class="h-full flex flex-col gap-2">
            <div class="flex items-center gap-2 flex-shrink-0 flex-wrap rtl">
                <span :class="[
                    'text-sm font-semibold rounded-lg px-3 py-1.5',
                    missingWeightCount > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                ]">
                    {{ missingWeightCount }} משטחים ללא משקל
                </span>
                <button @click="filterMissingWeight = !filterMissingWeight"
                    :class="[
                        'text-sm font-semibold rounded-lg px-3 py-1.5 border transition-all',
                        filterMissingWeight
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700'
                    ]">
                    {{ filterMissingWeight ? 'הצג הכל' : 'סנן חסרי משקל' }}
                </button>
            </div>
            <div class="flex-1 min-h-0">
                <PalletTable v-model:pallets="message" :farmer="farmerName"
                    title="טבלת נתונים" subtitle="כל המשטחים של המגדל"
                    :filter-missing-weight="filterMissingWeight"
                    :highlight-missing-weight="true"
                    :highlighted-ids="highlightedIds" />
            </div>
        </div>
    </div>
</template>

<script>
import { ref, watch, computed, inject } from 'vue'
import { useRoute } from 'vue-router'
import PalletTable from './PalletTable.vue'
import { useNotification } from '../composables/useNotification'
import { useFarmerEvents } from '../composables/useFarmerEvents'
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
        const route = useRoute()
        const message = ref([])
        const showError = ref(false)
        const errorMessage = ref('')
        const isLoading = ref(false)
        const farmerName = ref('')
        const filterMissingWeight = ref(route.query.filter === 'missingWeight')
        const missingWeightCount = computed(() => message.value.filter(r => !r.weight).length)
        const { notify } = useNotification()
        const currentUserEmail = inject('currentUserEmail', ref(''))
        const { highlightedIds } = useFarmerEvents(farmerName, message, { currentUserEmail })

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

        return { message, showError, errorMessage, isLoading, farmerName, getPallets, filterMissingWeight, missingWeightCount, highlightedIds }
    }
}
</script>
