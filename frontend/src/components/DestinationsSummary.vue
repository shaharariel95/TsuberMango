<template>
  <div class="animate-fade-in rtl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-800">סיכום יעדים</h2>
        <p class="text-slate-400 text-sm mt-0.5">סיכום משטחים לפי יעד</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-sm font-medium text-slate-500">בחר תאריך:</label>
        <select v-model="selectedDate" class="input-field !w-auto min-w-[160px] text-sm">
          <option value="">הכל</option>
          <option v-for="date in shipmentDates" :key="date" :value="date">{{ date }}</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
      <span class="loading-spinner !w-10 !h-10 !border-[3px]"></span>
      <span class="text-slate-400 text-sm font-medium">טוען נתונים...</span>
    </div>

    <!-- Table -->
    <div v-else-if="Object.keys(destinationCounts).length" class="max-w-lg mx-auto">
      <div class="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <table class="w-full">
          <thead>
            <tr>
              <th class="px-5 py-3 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 text-right">יעד</th>
              <th class="px-5 py-3 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 text-center w-32">מספר משטחים</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(count, destination, index) in destinationCounts" :key="destination"
                :class="[
                  'transition-colors duration-100 hover:bg-mango-50/40',
                  index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                ]">
              <td class="px-5 py-3 text-sm text-slate-700 border-b border-slate-100 font-medium">{{ destination }}</td>
              <td class="px-5 py-3 text-sm text-slate-700 border-b border-slate-100 text-center">
                <span class="bg-mango-50 text-mango-700 font-bold px-3 py-1 rounded-full text-xs border border-mango-200">
                  {{ count }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
      <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <span class="text-sm font-medium">אין נתונים להצגה</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 max-w-lg mx-auto">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      שגיאה: {{ error }}
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from "vue";
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL)
  .toString()
  .replace(/\/$/, "");

export default {
  name: "DestinationsSummary",
  props: {
    selectedFarmer: {
      type: String,
      required: false,
    },
  },
  setup(props) {
    const destinationCounts = ref({});
    const isLoading = ref(false);
    const error = ref(null);
    const shipmentDates = ref([]);
    const selectedDate = ref("");
    const allPallets = ref([]); // This will now store only pallets with a shipmentDate

    function normalizeDestination(dest) {
      if (!dest) return "לא ידוע";
      const dashIdx = dest.indexOf("-");
      if (dashIdx > 0) {
        const main = dest.slice(0, dashIdx).trim();
        if (main !== "חצי חינם") {
          return dest.slice(dashIdx + 1).trim();
        }
      }
      return dest.trim();
    }

    const updateCounts = () => {
      const counts = {};
      let palletsToProcess = allPallets.value; // Already filtered to include only those with shipmentDate

      if (selectedDate.value) {
        // Further filter by selected date if one is chosen
        palletsToProcess = allPallets.value.filter(
          (p) => p.shipmentDate === selectedDate.value,
        );
      }

      palletsToProcess.forEach((pallet) => {
        const dest = normalizeDestination(pallet.destination);
        if (dest) {
          counts[dest] = (counts[dest] || 0) + 1;
        }
      });
      destinationCounts.value = counts;
    };

    const fetchDestinations = async (farmer) => {
      isLoading.value = true;
      error.value = null;
      try {
        let url = `${baseUrl}/api/records/destinations`;
        if (farmer) {
          const hebrewName = encodeURIComponent(farmer);
          url = `${baseUrl}/api/farmers/${hebrewName}/records/destinations`;
        }
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch destinations");
        const rawData = await res.json();
        // Filter out pallets without a shipmentDate HERE
        allPallets.value = (rawData.data || []).filter(p => p.shipmentDate);

        // shipmentDates will now only be derived from pallets that have a shipmentDate
        shipmentDates.value = [
          ...new Set(allPallets.value.map((p) => p.shipmentDate)), // .filter(Boolean) is no longer strictly needed here but doesn't hurt
        ]
          .sort()
          .reverse();
        updateCounts();
      } catch (err) {
        error.value = err.message;
      } finally {
        isLoading.value = false;
      }
    };

    onMounted(() => {
      fetchDestinations(props.selectedFarmer);
    });

    watch(
      () => props.selectedFarmer,
      (newFarmer) => {
        selectedDate.value = "";
        fetchDestinations(newFarmer);
      },
    );

    watch(selectedDate, updateCounts);

    return {
      destinationCounts,
      isLoading,
      error,
      shipmentDates,
      selectedDate,
    };
  },
};
</script>
