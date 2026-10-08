<template>
  <div class="h-full flex flex-col rtl animate-fade-in">
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-bold text-slate-800">תעודות</h2>
        <p class="text-slate-400 text-sm mt-0.5">תעודות משלוח שהונפקו — {{ farmer }}</p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="text-sm text-slate-500">מתאריך <input type="date" v-model="from" class="input-field !w-auto text-sm" /></label>
        <label class="text-sm text-slate-500">עד <input type="date" v-model="to" class="input-field !w-auto text-sm" /></label>
        <select v-model="destination" class="input-field !w-auto text-sm">
          <option value="">כל היעדים</option>
          <option v-for="d in destinations" :key="d" :value="d">{{ d }}</option>
        </select>
        <input v-model="search" @input="exactNumber = ''" placeholder="חיפוש מספר..." class="input-field !w-32 text-sm" />
        <button class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3" :disabled="!selected.length || busy" @click="printSelected">הדפס נבחרות</button>
        <button class="btn-primary text-sm min-h-[36px] px-3" :disabled="!filtered.length || busy" @click="exportExcel">ייצוא לאקסל</button>
      </div>
    </div>

    <LoadingState v-if="loading && !certificates.length" />
    <ErrorState v-else-if="error" title="שגיאה בטעינת תעודות" :message="error" @retry="load" />
    <EmptyState v-else-if="!filtered.length" message="אין תעודות להצגה" />
    <div v-else class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200" :class="loading ? 'opacity-60' : ''" :aria-busy="loading">
      <table class="w-full text-sm text-center">
        <thead class="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th class="p-2 w-8"></th><th class="p-2">מספר</th><th class="p-2">תאריך</th><th class="p-2">יעד</th>
            <th class="p-2">משטחים</th><th class="p-2">ארגזים</th><th class="p-2">משקל</th><th class="p-2">גרסה</th>
            <th class="p-2">סטטוס</th><th class="p-2"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="c in filtered" :key="c.id">
            <tr :data-certificate="c.number" :class="['border-t border-slate-100', highlight === String(c.number) ? 'bg-mango-50' : '']">
              <td class="p-2"><input type="checkbox" :value="c.id" v-model="selected" :disabled="c.status === 'cancelled'" class="w-5 h-5" /></td>
              <td class="p-2 font-bold">{{ c.number }}</td>
              <td class="p-2">{{ c.shipmentDate }}</td>
              <td class="p-2">{{ c.destination }}</td>
              <td class="p-2">{{ c.palletCount }}</td>
              <td class="p-2">{{ c.totalBoxes }}</td>
              <td class="p-2">{{ c.totalWeight }}</td>
              <td class="p-2" data-col="version" :title="`עודכן ע״י ${c.updatedBy} · ${fmtTime(c.updatedAt)}`">{{ c.currentVersion }}</td>
              <td class="p-2" data-col="status">
                <span :class="c.status === 'cancelled' ? 'text-red-600' : 'text-emerald-600'">{{ c.status === 'cancelled' ? 'מבוטלת' : 'הונפקה' }}</span>
              </td>
              <td class="p-2 whitespace-nowrap space-x-1 space-x-reverse">
                <button class="btn-ghost text-xs border border-slate-200 px-2 py-1" :disabled="c.status === 'cancelled'" @click="reprint(c)">הדפס</button>
                <button class="btn-ghost text-xs border border-slate-200 px-2 py-1" @click="toggle(c)">{{ open[c.id] ? 'סגור' : 'פרטים' }}</button>
              </td>
            </tr>
            <tr v-if="open[c.id]" class="bg-slate-50/60">
              <td colspan="10" class="p-3 text-right">
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 class="font-semibold text-slate-700 mb-1">משטחים</h4>
                    <table class="w-full text-xs text-center bg-white rounded">
                      <tr class="text-slate-500"><th>משטח</th><th>זן</th><th>גודל</th><th>ארגזים</th><th>משקל</th><th></th></tr>
                      <tr v-for="r in open[c.id].latest.rows" :key="r.recordId" class="border-t border-slate-100">
                        <td>{{ r.palletNumber }}</td><td>{{ r.kind }}</td><td>{{ r.size }}</td><td>{{ r.boxes }}</td><td>{{ r.weight }}</td>
                        <td><button v-if="c.status !== 'cancelled'" class="text-red-600 underline text-xs" @click="removePallet(c, r)">הסר מתעודה</button></td>
                      </tr>
                    </table>
                  </div>
                  <div>
                    <h4 class="font-semibold text-slate-700 mb-1">היסטוריית גרסאות</h4>
                    <ul class="space-y-1 text-xs">
                      <li v-for="v in open[c.id].versions" :key="v.n" class="flex items-center justify-between bg-white rounded px-2 py-1">
                        <span>גרסה {{ v.n }} · {{ reasonLabel(v.reason) }} · {{ v.createdBy }} · {{ fmtTime(v.createdAt) }}</span>
                        <button class="underline" @click="printVersion(c, v.n)">הדפס גרסה</button>
                      </li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { ref, computed, inject, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import LoadingState from './shared/LoadingState.vue';
import ErrorState from './shared/ErrorState.vue';
import EmptyState from './shared/EmptyState.vue';
import { listCertificates, getCertificate, getCertificateVersion, reprintCertificate, removePalletFromCertificate } from '../api/certificates';
import { printCertificates } from '../data/certificatePdf';
import { requestConfirm, requestAlert } from '../composables/useDialogs';

export default {
  name: 'Certificates',
  components: { LoadingState, ErrorState, EmptyState },
  setup() {
    const route = useRoute();
    const selectedFarmer = inject('selectedFarmer', ref(''));
    const farmer = computed(() => route.query.farmer || selectedFarmer.value);
    const highlight = computed(() => route.query.number || '');
    const certificates = ref([]);
    const loading = ref(false);
    const error = ref('');
    const from = ref(''); const to = ref(''); const destination = ref('');
    const exactNumber = ref(String(route.query.number || ''));
    const search = ref(highlight.value);
    const busy = ref(false);
    const selected = ref([]);
    const open = ref({});

    const destinations = computed(() => [...new Set(certificates.value.map(c => c.destination))].sort());
    const filtered = computed(() => certificates.value.filter(c =>
      (!from.value || c.shipmentDate >= from.value) && (!to.value || c.shipmentDate <= to.value) &&
      (!destination.value || c.destination === destination.value) &&
      (exactNumber.value ? String(c.number) === exactNumber.value
        : (!search.value || String(c.number).includes(search.value.trim())))));

    async function load() {
      if (!farmer.value) return;
      loading.value = true; error.value = '';
      try {
        const list = (await listCertificates(farmer.value)).certificates;
        certificates.value = list;
        const live = new Set(list.filter(c => c.status !== 'cancelled').map(c => c.id));
        selected.value = selected.value.filter(id => live.has(id));
        // Re-fetch details of rows that were expanded and still exist
        const keep = Object.keys(open.value).map(id => list.find(c => String(c.id) === id)).filter(Boolean);
        const next = {};
        await Promise.all(keep.map(async c => { try { next[c.id] = await details(c); } catch { /* row stays collapsed */ } }));
        open.value = next;
      }
      catch (e) { error.value = e.message; }
      finally { loading.value = false; }
    }

    async function details(c) {
      const { versions } = await getCertificate(c.id);
      const { snapshot } = await getCertificateVersion(c.id, c.currentVersion);
      return { versions, latest: snapshot };
    }
    async function toggle(c) {
      if (open.value[c.id]) { const { [c.id]: _, ...rest } = open.value; open.value = rest; return; }
      try { open.value = { ...open.value, [c.id]: await details(c) }; }
      catch (e) { await fail(e); }
    }
    const fail = (e) => requestAlert({ title: 'שגיאה', message: e.message, variant: 'error' });
    const fmtTime = (t) => (t || '').slice(0, 16).replace('T', ' ');
    async function print(snapshots, name) {
      try { await printCertificates(snapshots, name); }
      catch { await requestAlert({ title: 'ההדפסה לא הושלמה', message: 'נסה שוב', variant: 'warning' }); }
    }
    async function reprint(c) {
      try {
        const res = await reprintCertificate(c.id);
        if (res.created) { await load(); }
        await print([res.snapshot], `תעודת-משלוח-${c.number}.pdf`);
      } catch (e) { await requestAlert({ title: 'שגיאה', message: e.message, variant: 'error' }); }
    }
    async function printVersion(c, n) {
      try {
        const { snapshot } = await getCertificateVersion(c.id, n);
        await print([snapshot], `תעודת-משלוח-${c.number}-גרסה-${n}.pdf`);
      } catch (e) { await fail(e); }
    }
    async function printSelected() {
      if (busy.value) return;
      busy.value = true;
      try {
        const chosen = filtered.value.filter(c => c.status !== 'cancelled' && selected.value.includes(c.id));
        if (!chosen.length) return;
        const snaps = await Promise.all(chosen.map(c => getCertificateVersion(c.id, c.currentVersion).then(r => r.snapshot)));
        await print(snaps, `תעודות-${chosen.map(c => c.number).join('-')}.pdf`);
      } catch (e) { await fail(e); }
      finally { busy.value = false; }
    }
    async function removePallet(c, r) {
      const ok = await requestConfirm({ title: 'הסרה מתעודה',
        message: `להסיר את משטח ${r.palletNumber} מתעודה ${c.number}? המשטח יחזור להכנה למשלוח.` });
      if (!ok) return;
      try {
        const res = await removePalletFromCertificate(c.id, r.recordId);
        await load();
        if (!res.cancelled) {
          const again = await requestConfirm({ title: 'הדפסה מחדש', message: `להדפיס את תעודה ${c.number} המעודכנת?` });
          if (again) await print([res.snapshot], `תעודת-משלוח-${c.number}.pdf`);
        }
      } catch (e) { await requestAlert({ title: 'שגיאה', message: e.message, variant: 'error' }); }
    }
    async function exportExcel() {
      if (busy.value) return;
      busy.value = true;
      try {
        const XLSX = await import('xlsx');
        const certRows = filtered.value.map(c => ({ 'מספר': c.number, 'תאריך': c.shipmentDate, 'יעד': c.destination,
          'משטחים': c.palletCount, 'ארגזים': c.totalBoxes, 'משקל': c.totalWeight, 'גרסה': c.currentVersion,
          'סטטוס': c.status === 'cancelled' ? 'מבוטלת' : 'הונפקה' }));
        const snaps = await Promise.all(filtered.value.map(c => getCertificateVersion(c.id, c.currentVersion)
          .then(r => ({ c, s: r.snapshot }))));
        const palletRows = snaps.flatMap(({ c, s }) => s.rows.map(r => ({ 'תעודה': c.number, 'תאריך': c.shipmentDate,
          'יעד': c.destination, 'משטח': r.palletNumber, 'זן': r.kind, 'גודל': r.size, 'ארגזים': r.boxes, 'משקל': r.weight })));
        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(certRows); ws1['!views'] = [{ RTL: true }];
        const ws2 = XLSX.utils.json_to_sheet(palletRows); ws2['!views'] = [{ RTL: true }];
        XLSX.utils.book_append_sheet(wb, ws1, 'תעודות');
        XLSX.utils.book_append_sheet(wb, ws2, 'משטחים');
        XLSX.writeFile(wb, `תעודות-${farmer.value}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) { await fail(e); }
      finally { busy.value = false; }
    }
    const reasonLabel = (r) => ({ issue: 'הנפקה', reprint: 'עדכון', 'remove-pallet': 'הסרת משטח' }[r] || r);

    watch(farmer, load);
    onMounted(load);
    return { farmer, highlight, loading, error, from, to, destination, search, selected, open, busy, fmtTime, exactNumber, destinations, filtered,
      load, toggle, reprint, printVersion, printSelected, removePallet, exportExcel, reasonLabel };
  },
};
</script>
