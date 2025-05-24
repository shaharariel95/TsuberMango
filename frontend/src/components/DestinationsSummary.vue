<template>
  <div class="">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">סיכום יעדים</h2>
      <div class="flex items-center">
        <label class="font-bold mr-2">בחר תאריך:</label>
        <select v-model="selectedDate" class="border rounded p-1">
          <option value="">הכל</option>
          <option v-for="date in shipmentDates" :key="date" :value="date">{{ date }}</option>
        </select>
      </div>
    </div>
    <table class="w-1/4 mx-auto bg-white border  border-gray-300 rounded text-center">
      <thead>
        <tr>
          <th class="px-4 py-2 border-b">יעד</th>
          <th class="px-4 py-2 border-b">מספר משטחים</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(count, destination) in destinationCounts" :key="destination">
          <td class="px-4 py-2 border-b">{{ destination }}</td>
          <td class="px-4 py-2 border-b">{{ count }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="isLoading" class="mt-4">טוען...</div>
    <div v-if="error" class="mt-4 text-red-600">שגיאה: {{ error }}</div>
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
