<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" @click.self="$emit('close')">
    <div role="dialog" aria-label="פרטי תעודה" class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 rtl space-y-3">
      <h3 class="text-lg font-bold text-slate-800">פרטי תעודה — {{ farmer }}</h3>
      <p v-if="loading" class="text-slate-400 text-sm">טוען...</p>
      <template v-else>
        <label v-for="(_, i) in form.headerLines" :key="i" class="block text-sm text-slate-600">
          שורת כותרת {{ i + 1 }}
          <input v-model="form.headerLines[i]" :aria-label="`שורת כותרת ${i + 1}`" class="input-field mt-1" />
        </label>
        <label class="block text-sm text-slate-600">שם המוביל
          <input v-model="form.driverName" aria-label="שם המוביל" class="input-field mt-1" />
        </label>
        <label class="block text-sm text-slate-600">מספר התעודה הבא
          <input v-model.number="form.nextNumber" type="number" min="1" aria-label="מספר התעודה הבא" class="input-field mt-1" />
        </label>
        <p v-if="message" :class="messageError ? 'text-red-600' : 'text-emerald-600'" class="text-sm">{{ message }}</p>
        <div class="flex gap-2 justify-end pt-2">
          <button class="btn-ghost border border-slate-200 px-3 py-2 text-sm" @click="preview">תצוגה מקדימה</button>
          <button class="btn-primary px-3 py-2 text-sm" :disabled="saving" @click="save">שמור</button>
          <button class="btn-ghost px-3 py-2 text-sm" @click="$emit('close')">סגור</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { reactive, ref, onMounted } from 'vue';
import { getCertificateProfile, saveCertificateProfile } from '../api/certificates';
import { printCertificates, previewSnapshot } from '../data/certificatePdf';

export default {
  name: 'CertificateProfileEditor',
  props: { farmer: { type: String, required: true } },
  emits: ['close'],
  setup(props) {
    const form = reactive({ headerLines: ['', '', '', '', ''], driverName: '', nextNumber: 1 });
    const loading = ref(true);
    const saving = ref(false);
    const message = ref('');
    const messageError = ref(false);

    onMounted(async () => {
      try {
        const { profile } = await getCertificateProfile(props.farmer);
        if (profile) Object.assign(form, { headerLines: [...profile.headerLines], driverName: profile.driverName || '', nextNumber: profile.nextNumber });
      } catch (e) {
        message.value = e.message; messageError.value = true;
      } finally {
        loading.value = false;
      }
    });

    async function save() {
      saving.value = true; message.value = '';
      try {
        await saveCertificateProfile(props.farmer, { headerLines: form.headerLines, driverName: form.driverName, nextNumber: Number(form.nextNumber) });
        message.value = 'נשמר'; messageError.value = false;
      } catch (e) {
        message.value = e.message; messageError.value = true;
      } finally {
        saving.value = false;
      }
    }

    async function preview() {
      try {
        await printCertificates([previewSnapshot({ ...form, nextNumber: Number(form.nextNumber) })], `תצוגה-מקדימה-${props.farmer}.pdf`);
      } catch (e) {
        message.value = e.message; messageError.value = true;
      }
    }

    return { form, loading, saving, message, messageError, save, preview };
  },
};
</script>
