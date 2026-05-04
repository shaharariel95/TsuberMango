<template>
    <div class="h-full animate-fade-in overflow-auto">
        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
            <span class="loading-spinner !w-10 !h-10 !border-[3px]"></span>
            <span class="text-slate-400 text-sm font-medium">טוען נתונים...</span>
        </div>

        <!-- Error -->
        <div v-else-if="fetchError" class="flex flex-col items-center justify-center py-20 gap-4">
            <div class="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full text-center shadow-sm">
                <svg class="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p class="text-red-700 font-semibold text-sm mb-1">שגיאה בטעינת נתונים</p>
                <p class="text-red-600 text-sm mb-4">{{ fetchError }}</p>
                <button @click="fetchAllFarmers"
                    class="px-4 py-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all">
                    נסה שוב
                </button>
            </div>
        </div>

        <!-- Content -->
        <div v-else class="space-y-5 rtl pb-6">
            <!-- Header -->
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 class="text-2xl sm:text-3xl font-bold text-slate-800">לוח בקרה</h2>
                    <p class="text-slate-500 text-sm mt-0.5">סיכום עונתי</p>
                </div>
                <button @click="fetchAllFarmers"
                    class="btn-ghost text-sm border border-slate-200 flex items-center gap-1.5 min-h-[36px] px-3">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    רענן
                </button>
            </div>

            <!-- Global Summary Cards -->
            <div class="grid grid-cols-3 gap-3">
                <div class="rounded-xl p-4 bg-gradient-to-br from-mango-400 to-mango-600 text-white shadow-sm">
                    <p class="text-xs font-semibold opacity-80 mb-1">סה"כ משטחים</p>
                    <p class="text-2xl font-bold">{{ globalStats.totalPallets.toLocaleString('he') }}</p>
                </div>
                <div class="rounded-xl p-4 bg-gradient-to-br from-mango-300 to-mango-500 text-white shadow-sm">
                    <p class="text-xs font-semibold opacity-80 mb-1">סה"כ ארגזים</p>
                    <p class="text-2xl font-bold">{{ globalStats.totalBoxes.toLocaleString('he') }}</p>
                </div>
                <div class="rounded-xl p-4 bg-gradient-to-br from-mango-500 to-mango-700 text-white shadow-sm">
                    <p class="text-xs font-semibold opacity-80 mb-1">משקל כולל (ק"ג)</p>
                    <p class="text-2xl font-bold">{{ globalStats.totalWeight.toLocaleString('he') }}</p>
                </div>
            </div>

            <!-- Today's Activity -->
            <div class="card">
                <div class="flex items-center gap-2 mb-3">
                    <svg class="w-4 h-4 text-mango-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 class="text-sm font-bold text-slate-700">פעילות היום</h3>
                    <span class="text-xs text-slate-400">({{ todayStr }})</span>
                </div>
                <div v-if="todayRecords.length === 0" class="text-center text-slate-400 text-sm py-4">
                    אין פעילות להיום
                </div>
                <div v-else class="divide-y divide-slate-100 -mx-3 sm:-mx-4">
                    <div v-for="(rec, idx) in todayRecords" :key="idx"
                        class="flex items-center justify-between px-3 sm:px-4 py-2 text-sm">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-xs text-slate-400 font-medium bg-slate-100 rounded px-1.5 py-0.5 flex-shrink-0">{{ rec.farmer }}</span>
                            <span class="font-semibold text-slate-700">משטח {{ rec.palletNumber }}</span>
                            <span class="text-slate-500 truncate hidden sm:inline">{{ rec.kind }} · {{ rec.size }}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0 mr-2">
                            <span class="text-slate-600">{{ rec.boxes }} ארגזים</span>
                            <span v-if="rec.weight" class="text-mango-600 font-semibold">{{ rec.weight }} ק"ג</span>
                            <span v-else class="text-amber-500 text-xs font-medium">חסר משקל</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Per-Farmer Cards -->
            <div>
                <h3 class="text-sm font-bold text-slate-700 mb-3">מגדלים</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div v-for="fd in farmerDataList" :key="fd.name"
                        class="card hover:shadow-md transition-shadow flex flex-col">
                        <!-- Card Header -->
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-slate-800">{{ fd.name }}</h4>
                            <span v-if="fd.error"
                                class="text-xs text-red-500 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">שגיאה</span>
                            <span v-else-if="fd.loading"
                                class="w-4 h-4 border-2 border-mango-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                        </div>

                        <div v-if="fd.error" class="text-sm text-red-500 text-center py-4 flex-1">{{ fd.error }}</div>
                        <div v-else class="grid grid-cols-2 gap-3 flex-1 mb-4">
                            <div class="bg-slate-50 rounded-lg p-2.5">
                                <p class="text-xs text-slate-400">משטחים</p>
                                <p class="text-lg font-bold text-slate-800">{{ fd.stats.totalPallets }}</p>
                            </div>
                            <div class="bg-slate-50 rounded-lg p-2.5">
                                <p class="text-xs text-slate-400">ארגזים</p>
                                <p class="text-lg font-bold text-slate-800">{{ fd.stats.totalBoxes.toLocaleString('he') }}</p>
                            </div>
                            <div class="bg-mango-50 rounded-lg p-2.5">
                                <p class="text-xs text-slate-400">משקל (ק"ג)</p>
                                <p class="text-lg font-bold text-mango-700">{{ fd.stats.totalWeight.toLocaleString('he') }}</p>
                            </div>
                            <div class="rounded-lg p-2.5" :class="fd.stats.unweighed > 0 ? 'bg-amber-50' : 'bg-emerald-50'">
                                <p class="text-xs text-slate-400">חסרי משקל</p>
                                <p class="text-lg font-bold" :class="fd.stats.unweighed > 0 ? 'text-amber-600' : 'text-emerald-600'">
                                    {{ fd.stats.unweighed }}
                                </p>
                            </div>
                            <div class="col-span-2 rounded-lg p-2.5"
                                :class="fd.stats.pendingDestination > 0 ? 'bg-blue-50' : 'bg-slate-50'">
                                <p class="text-xs text-slate-400">ממתינים לשיגור</p>
                                <p class="text-base font-bold"
                                    :class="fd.stats.pendingDestination > 0 ? 'text-blue-600' : 'text-slate-400'">
                                    {{ fd.stats.pendingDestination }} משטחים
                                </p>
                            </div>
                        </div>

                        <!-- Quick-action buttons -->
                        <div class="flex gap-2 mt-auto">
                            <button @click="goToIntake(fd.name)"
                                class="flex-1 btn-primary text-xs py-2">
                                עבור לקליטה
                            </button>
                            <button @click="goToWeight(fd.name)"
                                class="flex-1 btn-ghost text-xs py-2 border border-slate-200">
                                הצג חסרי משקל
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'

const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '')

function getTodayStr() {
    const d = new Date()
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function computeStats(records) {
    const palletNums = new Set(records.map(r => r.palletNumber))
    const totalBoxes = records.reduce((s, r) => s + (Number(r.boxes) || 0), 0)
    const totalWeight = records.reduce((s, r) => s + (r.weight ? Number(r.weight) || 0 : 0), 0)
    const unweighed = records.filter(r => !r.weight).length
    const pendingDestination = records.filter(r => !r.sent && !r.mark).length
    return {
        totalPallets: palletNums.size,
        totalBoxes,
        totalWeight: Math.round(totalWeight),
        unweighed,
        pendingDestination
    }
}

export default {
    name: 'Dashboard',
    setup() {
        const router = useRouter()
        const config = inject('config', { farmers: [], farmerConfigs: {} })
        const selectedFarmerRef = inject('selectedFarmer', ref(''))

        const isLoading = ref(false)
        const fetchError = ref(null)
        const farmerDataList = ref([])
        const todayStr = getTodayStr()

        const todayRecords = computed(() => {
            const all = []
            for (const fd of farmerDataList.value) {
                if (!fd.records) continue
                for (const rec of fd.records) {
                    const date = String(rec.shipmentDate || '').trim().split(' ')[0]
                    if (date === todayStr) {
                        all.push({ farmer: fd.name, ...rec })
                    }
                }
            }
            all.sort((a, b) => Number(b.palletNumber) - Number(a.palletNumber))
            return all.slice(0, 5)
        })

        const globalStats = computed(() =>
            farmerDataList.value.reduce((acc, fd) => {
                if (!fd.stats) return acc
                return {
                    totalPallets: acc.totalPallets + fd.stats.totalPallets,
                    totalBoxes: acc.totalBoxes + fd.stats.totalBoxes,
                    totalWeight: acc.totalWeight + fd.stats.totalWeight
                }
            }, { totalPallets: 0, totalBoxes: 0, totalWeight: 0 })
        )

        const fetchAllFarmers = async () => {
            const farmers = config.farmers || []
            if (!farmers.length) return

            isLoading.value = true
            fetchError.value = null
            farmerDataList.value = farmers.map(name => ({ name, loading: true, error: null, records: null, stats: null }))

            const results = await Promise.allSettled(
                farmers.map(async name => {
                    const res = await fetch(`${baseUrl}/api/farmers/${encodeURIComponent(name)}/records`, { credentials: 'include' })
                    if (!res.ok) throw new Error(`שגיאת שרת: ${res.status}`)
                    const json = await res.json()
                    return { name, records: json.data || [] }
                })
            )

            farmerDataList.value = farmers.map((name, i) => {
                const r = results[i]
                if (r.status === 'fulfilled') {
                    return { name, loading: false, error: null, records: r.value.records, stats: computeStats(r.value.records) }
                }
                return { name, loading: false, error: r.reason?.message || 'שגיאה לא ידועה', records: null, stats: null }
            })

            isLoading.value = false
        }

        const goToIntake = name => {
            selectedFarmerRef.value = name
            router.push('/Intake')
        }

        const goToWeight = name => {
            selectedFarmerRef.value = name
            router.push('/Weight')
        }

        watch(() => config.farmers, farmers => {
            if (farmers?.length && !farmerDataList.value.length) fetchAllFarmers()
        }, { immediate: true })

        return { isLoading, fetchError, farmerDataList, globalStats, todayRecords, todayStr, fetchAllFarmers, goToIntake, goToWeight }
    }
}
</script>
