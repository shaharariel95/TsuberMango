<template>
  <section class="card space-y-3">
    <h2 class="text-xl font-bold text-slate-700 pb-2 border-b border-slate-100">משטחים שנמחקו</h2>
    <select v-model="farmer" aria-label="חקלאי למשטחים שנמחקו" class="input-field text-sm max-w-xs">
      <option v-for="name in farmers" :key="name" :value="name">{{ name }}</option>
    </select>
    <p v-if="loading" class="text-sm text-slate-500">טוען...</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-else-if="!records.length" class="text-sm text-slate-500">אין משטחים שנמחקו</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-slate-600 text-right">
            <th class="px-2 py-1.5 font-semibold">מס' משטח</th>
            <th class="px-2 py-1.5 font-semibold">תאריך קטיף</th>
            <th class="px-2 py-1.5 font-semibold">זן</th>
            <th class="px-2 py-1.5 font-semibold">גודל</th>
            <th class="px-2 py-1.5 font-semibold">ארגזים</th>
            <th class="px-2 py-1.5 font-semibold">נמחק ע"י</th>
            <th class="px-2 py-1.5 font-semibold">מועד מחיקה</th>
            <th class="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in records" :key="r.id" class="border-t border-slate-100">
            <td class="px-2 py-1.5">{{ r.palletNumber }}</td>
            <td class="px-2 py-1.5">{{ r.harvestDate }}</td>
            <td class="px-2 py-1.5">{{ r.kind }}</td>
            <td class="px-2 py-1.5">{{ r.size }}</td>
            <td class="px-2 py-1.5">{{ r.boxes }}</td>
            <td class="px-2 py-1.5">{{ r.deletedBy }}</td>
            <td class="px-2 py-1.5">{{ formatAt(r.deletedAt) }}</td>
            <td class="px-2 py-1.5">
              <button :aria-label="`שחזר משטח ${r.palletNumber}`" :disabled="restoring" @click="restore(r)"
                class="text-xs px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium transition-colors min-h-[40px] disabled:opacity-50">
                שחזר
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="message" class="text-sm text-emerald-600">{{ message }}</p>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import { listDeletedRecords, restoreRecord } from '../api/records';

const props = defineProps({ farmers: { type: Array, default: () => [] } });

const farmer = ref(props.farmers[0] || '');
const records = ref([]);
const loading = ref(false);
const restoring = ref(false);
const error = ref('');
const message = ref('');

const formatAt = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : '');

async function load() {
  records.value = [];
  error.value = '';
  message.value = '';
  if (!farmer.value) return;
  const requested = farmer.value;
  loading.value = true;
  try {
    const { records: list } = await listDeletedRecords(requested);
    if (requested === farmer.value) records.value = list || [];
  } catch (e) {
    if (requested === farmer.value) error.value = e.message;
  } finally {
    if (requested === farmer.value) loading.value = false;
  }
}

async function restore(r) {
  restoring.value = true;
  error.value = '';
  message.value = '';
  try {
    await restoreRecord(farmer.value, r.id);
    records.value = records.value.filter(x => x.id !== r.id);
    message.value = `המשטח ${r.palletNumber} שוחזר`;
  } catch (e) {
    error.value = e.message;
  } finally {
    restoring.value = false;
  }
}

// Farmers may arrive after Settings loads its config; default to the first one.
watch(() => props.farmers, (list) => {
  if (!list.includes(farmer.value)) farmer.value = list[0] || '';
});
watch(farmer, load, { immediate: true });
</script>
