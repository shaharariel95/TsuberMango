<template>
    <div class="h-full w-full flex flex-col animate-fade-in">
        <PalletTableToolbar :title="title" :farmer="farmer" :pallet-count="palletCount"
            :is-editable="isEditable" :show-actions="!destinationOnly && !columnsFilter.length"
            :selected-count="selectedPallets.length" :busy="isCreatingLabel" :applying-date="isApplyingDate"
            :sent-view="sentView" v-model:shipment-date="bulkShipmentDate"
            @return-sent="returnSentPallets" @print-sticker="printSticker" @mark="confirmBulkAction"
            @apply-date="applyShipmentDateToSelected" @issue-certificate="sendSelectedPallets"
            @toggle-sent-view="sentView = !sentView" />

        <!-- Search -->
        <div class="mb-2 relative rtl">
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input v-model="searchText" type="text" placeholder="חיפוש בטבלה..."
                class="w-full border border-slate-200 rounded-lg text-sm pr-9 pl-3 py-1.5 min-h-[36px] focus:ring-1 focus:ring-mango-400 focus:border-mango-400 outline-hidden bg-white" />
        </div>

        <!-- Table -->
        <div class="overflow-auto flex-1 min-h-0 rounded-xl border border-slate-200 bg-white" style="-webkit-overflow-scrolling: touch; padding-bottom: 35vh;">
            <table class="w-full min-w-[1200px] border-collapse rtl">
                <thead>
                    <tr>
                        <th v-for="col in columns" :key="col.key"
                            class="h-11 align-middle px-3 py-1 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 text-center sticky top-0 z-2"
                            :style="col.minWidth ? `min-width: ${col.minWidth}` : ''">
                            <div class="flex items-center flex-col gap-1.5">
                                {{ (col.key === 'selected' && !isEditable) ? 'הורדת סטטוס נשלח' : col.label }}
                                <select v-if="col.filter" v-model="filterBy[col.key]"
                                    class="border border-slate-200 rounded-md bg-white text-xs sm:text-sm text-center px-2 py-1.5 min-h-[36px] max-w-[140px] focus:ring-1 focus:ring-mango-400 focus:border-mango-400 outline-hidden">
                                    <option value="">הכל</option>
                                    <option v-for="option in filterOptionsFor(col.key)" :key="option" :value="option"
                                        class="text-ellipsis overflow-hidden max-w-[150px]">
                                        {{ option }}
                                    </option>
                                </select>
                                <span v-if="col.sortable" @click="sortBy(col.key)"
                                    class="cursor-pointer text-slate-400 hover:text-mango-500 transition-colors text-xs select-none px-2 py-0.5">
                                    {{ col.key === sortField ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅' }}
                                </span>
                                <input v-if="col.key === 'selected'" type="checkbox" @change="toggleSelectAll"
                                    :checked="selectedPallets.length === selectablePallets.length && selectablePallets.length > 0"
                                    class="w-5 h-5 rounded-sm border-slate-300 text-mango-500 focus:ring-mango-400 cursor-pointer" />
                            </div>
                        </th>
                        <th v-if="isEditable" class="h-11 align-middle px-3 py-1 text-sm font-semibold text-slate-600 bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-2"
                            style="min-width: 80px">עריכה</th>
                    </tr>
                </thead>
                <tbody>
                    <PalletTableRow v-for="pallet in sortedPallets" :key="pallet.id"
                        :pallet="pallet" :columns="columns" :farmer="farmer" :is-editable="isEditable"
                        :editing="editingId === pallet.id" :source="editingId === pallet.id ? sourceFor(pallet.id) : null"
                        :saving="isLoading" :can-delete="editingId === pallet.id && canDelete(sourceFor(pallet.id))"
                        :selected="selectedPallets.includes(pallet.id)"
                        :collapsed="collapsedPallets.has(String(pallet.palletNumber))"
                        :flash="highlightedIds.has(pallet.id)" :highlight-missing-weight="highlightMissingWeight"
                        :mix-color="mixColors[String(pallet.palletNumber)] || null"
                        @edit="startEditing" @save="savePallet" @cancel="closeEditing" @delete="deleteEditing"
                        @toggle-select="toggleSelect" @toggle-collapse="toggleCollapse" />
                </tbody>
            </table>
        </div>

        <ErrorToast :error="error" @dismiss="error = null" />
    </div>
</template>

<script>
import createStickerPDF from '../data/printData.js';
import PalletTableToolbar from './PalletTableToolbar.vue';
import PalletTableRow from './PalletTableRow.vue';
import ErrorToast from './shared/ErrorToast.vue';
import { requestAlert, requestConfirm } from '../composables/useDialogs';
import { deleteRecord, updateRecord, markForShipment, setShipmentDate, resetSent } from '../api/records';
import { previewCertificates, issueCertificates } from '../api/certificates';
import { printWithRetap, preloadPdf } from '../data/certificatePdf';
import {
    filterPallets, sortAndGroup, countUniquePallets, mixColorMap, filterOptions, hasCertificate, canDelete,
} from '../utils/palletRows';

const ALL_COLUMNS = [
    { key: 'sent', label: 'נשלח', editable: true, minWidth: '70px' },
    { key: 'shipmentDate', label: 'תאריך משלוח', sortable: true, editable: true, minWidth: '120px' },
    { key: 'cardId', label: 'מספר תעודה', filter: true, editable: false, minWidth: '100px' },
    { key: 'harvestDate', label: 'תאריך קטיף', editable: true, minWidth: '110px' },
    { key: 'palletNumber', label: 'מספר משטח', sortable: true, editable: true, minWidth: '95px' },
    { key: 'kind', label: 'זן', filter: true, sortable: true, editable: true, minWidth: '95px' },
    { key: 'size', label: 'גודל', filter: true, sortable: true, editable: true, minWidth: '85px' },
    { key: 'boxes', label: 'ארגזים', editable: true, minWidth: '80px' },
    { key: 'weight', label: 'משקל', editable: true, minWidth: '85px' },
    { key: 'destination', label: 'יעד', filter: true, editable: true, minWidth: '170px' },
    { key: 'gidon', label: 'הערה', filter: true, editable: true, minWidth: '90px' },
    { key: 'selected', label: 'בחירת משטח', minWidth: '100px' },
];

// Shared pallet table (Weight, Destination, SentPallets, sentPalletsForMark). Owns the pallets
// array via v-model:pallets, selection, editing and every API call; row logic lives in
// utils/palletRows.js, the toolbar and rows in PalletTableToolbar / PalletTableRow.
export default {
    components: { PalletTableToolbar, PalletTableRow, ErrorToast },
    props: {
        pallets: { type: Array, required: true },
        farmer: { type: String, required: true },
        isEditable: { type: Boolean, default: true },
        destinationOnly: { type: Boolean, default: false },
        columnsFilter: { type: Array, default: () => [] },
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        highlightMissingWeight: { type: Boolean, default: false },
        filterMissingWeight: { type: Boolean, default: false },
        highlightedIds: { type: Object, default: () => new Set() },
    },
    emits: ['update:pallets'],
    inject: ['config'],

    data() {
        return {
            filterBy: { kind: '', size: '', destination: '' },
            selectedPallets: [],
            sortField: 'palletNumber',
            sortDirection: 'asc',
            editingId: null,
            error: null,
            isLoading: false,
            isCreatingLabel: false,
            isApplyingDate: false,
            bulkShipmentDate: '',
            sentView: false,
            searchText: '',
            collapsedPallets: new Set(),
        };
    },

    watch: {
        farmer() { this.searchText = ''; },
        filterBy: { deep: true, handler() { this.collapsedPallets = new Set(); } },
        searchText() { this.collapsedPallets = new Set(); },
    },

    computed: {
        columns() {
            let columns = ALL_COLUMNS;
            if (this.destinationOnly) {
                columns = columns
                    .filter(col => !['gidon', 'selected'].includes(col.key))
                    .map(col => ({ ...col, editable: col.key === 'destination' }));
            }
            if (this.columnsFilter.length) columns = columns.filter(col => !this.columnsFilter.includes(col.key));
            // The note column only exists for farmers with allowGidon.
            if (!this.config.farmerConfigs[this.farmer]?.allowGidon) columns = columns.filter(col => col.key !== 'gidon');
            return columns;
        },
        filteredPallets() {
            return filterPallets(this.pallets, {
                filterBy: this.filterBy,
                search: this.searchText,
                filterMissingWeight: this.filterMissingWeight,
                sentView: this.sentView,
            });
        },
        selectablePallets() {
            return this.filteredPallets.filter(p => !p._isContext);
        },
        sortedPallets() {
            return sortAndGroup(this.filteredPallets, {
                sortField: this.sortField, sortDirection: this.sortDirection, collapsed: this.collapsedPallets,
            });
        },
        palletCount() { return countUniquePallets(this.filteredPallets); },
        mixColors() { return mixColorMap(this.pallets); },
    },

    methods: {
        canDelete,
        sourceFor(id) { return this.pallets.find(p => p.id === id); },
        filterOptionsFor(key) { return filterOptions(this.pallets, key); },
        selectedRows() { return this.filteredPallets.filter(p => this.selectedPallets.includes(p.id)); },
        flashError(message) {
            this.error = message;
            setTimeout(() => { this.error = null; }, 5000);
        },

        toggleSelect(id) {
            const i = this.selectedPallets.indexOf(id);
            if (i === -1) this.selectedPallets.push(id);
            else this.selectedPallets.splice(i, 1);
        },
        toggleSelectAll() {
            this.selectedPallets = this.selectedPallets.length === this.selectablePallets.length
                ? []
                : this.selectablePallets.map(p => p.id);
        },
        toggleCollapse(palletNumber) {
            const k = String(palletNumber);
            if (this.collapsedPallets.has(k)) this.collapsedPallets.delete(k);
            else this.collapsedPallets.add(k);
        },
        sortBy(field) {
            this.sortDirection = this.sortField === field && this.sortDirection === 'asc' ? 'desc' : 'asc';
            this.sortField = field;
        },

        async startEditing(pallet) {
            const raw = this.sourceFor(pallet.id) || pallet;
            if (raw.sent === true || hasCertificate(raw)) {
                const ok = await requestConfirm({
                    title: 'המשטח כבר יצא',
                    message: 'המשטח כבר יצא / הונפקה לו תעודה — לשנות בכל זאת?',
                    variant: 'yellow',
                });
                if (!ok) return;
            }
            this.editingId = pallet.id;
            this.$nextTick(() => {
                const row = this.$el.querySelector(`tr[data-id="${pallet.id}"]`);
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        },
        closeEditing() {
            this.editingId = null;
        },

        async savePallet(draft) {
            const id = this.editingId;
            const originalPallet = { ...this.sourceFor(id) };
            const record = { ...draft, palletNumber: Number(draft.palletNumber), gidon: !!draft.gidon, sent: !!draft.sent };
            // Empty stays empty — Number('') is 0, which showed a "0" certificate number after save.
            for (const key of ['cardId', 'boxes', 'weight']) {
                const v = record[key];
                if (v !== undefined && v !== '' && v !== null) record[key] = Number(v);
            }

            this.isLoading = true;
            try {
                const { data: stored } = await updateRecord(this.farmer, id, record);
                // The server decides cardId/sent (a certified row keeps its own) — take the stored values back.
                const index = this.pallets.findIndex(p => p.id === id);
                if (index !== -1) {
                    const newPallets = [...this.pallets];
                    newPallets[index] = { ...originalPallet, ...record,
                        ...(stored ? { cardId: stored.cardId, sent: stored.sent } : {}) };
                    this.$emit('update:pallets', newPallets);
                }
                this.editingId = null;
            } catch (err) {
                this.editingId = null;
                if (err.status === 404) {
                    // Deleted on another device and this tab missed the realtime event.
                    this.$emit('update:pallets', this.pallets.filter(p => p.id !== id));
                    this.isLoading = false;
                    await requestAlert({ title: 'המשטח נמחק', message: 'המשטח נמחק במכשיר אחר ולכן לא נשמר.', variant: 'warning' });
                    return;
                }
                this.flashError('Failed to update pallet');
            } finally {
                this.isLoading = false;
            }
        },

        async deleteEditing() {
            const p = this.sourceFor(this.editingId);
            if (!p) return;
            const ok = await requestConfirm({ title: 'מחיקת משטח', confirmText: 'מחק משטח',
                message: `למחוק את משטח ${p.palletNumber}? מנהל יכול לשחזר אותו מההגדרות (משטחים שנמחקו).` });
            if (!ok) return;
            this.isLoading = true;
            try {
                await deleteRecord(this.farmer, p.id);
                this.$emit('update:pallets', this.pallets.filter(x => x.id !== p.id));
                this.editingId = null;
            } catch (e) {
                await requestAlert({ title: 'המחיקה נכשלה', message: e.message, variant: 'error' });
            } finally {
                this.isLoading = false;
            }
        },

        async confirmBulkAction(toSend) {
            const rows = this.selectedRows();
            const destinations = [...new Set(rows.map(p => p.destination).filter(Boolean))];
            const message = toSend
                ? `האם להעביר ${rows.length} משטחים למשלוח?`
                : `האם להוריד ${rows.length} משטחים מהמשלוח?`;
            const details = destinations.length ? `יעדים: ${destinations.join(', ')}` : '';
            const ok = await requestConfirm({ message, details, variant: toSend ? 'emerald' : 'amber' });
            if (!ok) return;
            this.isCreatingLabel = true;
            try {
                await markForShipment(this.farmer, rows, toSend);
                this.selectedPallets = [];
            } catch {
                this.flashError('Failed to send pallets');
            } finally {
                this.isCreatingLabel = false;
            }
        },

        async sendSelectedPallets() {
            const ids = [...this.selectedPallets];
            this.isCreatingLabel = true;
            preloadPdf(); // warm pdfmake + font now so printing right after issue stays within the tap window
            try {
                const pv = await previewCertificates(this.farmer, ids);
                const sizes = pv.chunks.map(c => c.rows);
                const summary = sizes.length === 1
                    ? `תיווצר תעודה אחת (${sizes[0]} שורות)`
                    : `ייווצרו ${sizes.length} תעודות: ${sizes.join(' + ')}`;
                const ok = await requestConfirm({
                    title: 'הפקת תעודת משלוח',
                    message: summary,
                    details: `יעד: ${pv.destination} · תאריך: ${pv.shipmentDate}`,
                    confirmText: 'אשר',
                });
                if (!ok) return;
                const { certificates } = await issueCertificates(this.farmer, ids);
                const byRecord = new Map();
                certificates.forEach(c => c.snapshot.rows.forEach(r => byRecord.set(r.recordId, c.number)));
                const updated = this.pallets.map(p => byRecord.has(p.id)
                    ? { ...p, cardId: byRecord.get(p.id), sent: true, mark: false } : p);
                this.$emit('update:pallets', updated);
                this.selectedPallets = [];
                const numbers = certificates.map(c => c.number).join('-');
                try {
                    await printWithRetap(certificates.map(c => c.snapshot), `תעודת-משלוח-${numbers}.pdf`, requestConfirm);
                } catch {
                    await requestAlert({ title: 'ההדפסה לא הושלמה',
                        message: `התעודה נשמרה (${numbers}). ניתן להדפיס אותה שוב ממסך "תעודות".`, variant: 'warning' });
                }
            } catch (err) {
                const soft = err.status === 400 || err.status === 409;
                await requestAlert({ title: soft ? 'לא ניתן להפיק תעודה' : 'שגיאה',
                    message: err.message, variant: soft ? 'warning' : 'error' });
            } finally {
                this.isCreatingLabel = false;
            }
        },

        async applyShipmentDateToSelected() {
            const ids = this.selectedPallets.slice();
            if (!ids.length) return;
            if (!this.bulkShipmentDate) {
                await requestAlert({ title: 'חסר תאריך', message: 'יש לבחור תאריך משלוח לפני הלחיצה על "החל על הכל"', variant: 'warning' });
                return;
            }
            const date = this.bulkShipmentDate;
            const ok = await requestConfirm({
                title: 'עדכון תאריך משלוח',
                message: `האם לקבוע תאריך משלוח ${date} ל-${ids.length} משטחים?`,
                variant: 'amber',
            });
            if (!ok) return;

            this.isApplyingDate = true;
            try {
                await setShipmentDate(this.farmer, ids, date);
                this.$emit('update:pallets', this.pallets.map(p => ids.includes(p.id) ? { ...p, shipmentDate: date } : p));
                this.selectedPallets = [];
            } catch {
                await requestAlert({ title: 'שגיאה', message: 'עדכון תאריך המשלוח נכשל, נסה שוב', variant: 'error' });
            } finally {
                this.isApplyingDate = false;
            }
        },

        async returnSentPallets() {
            const ids = this.selectedRows().map(p => p.id);
            try {
                // The server reports the stored state (certified rows also lose cardId and return to prep).
                const { updated = [] } = await resetSent(this.farmer, ids);
                const byId = new Map(updated.map(u => [u.id, u]));
                this.$emit('update:pallets', this.pallets.map(p =>
                    ids.includes(p.id) ? { ...p, sent: false, ...(byId.get(p.id) || {}) } : p));
                this.selectedPallets = [];
            } catch {
                this.flashError('Failed to send pallets');
            }
        },

        async printSticker() {
            const pallet = this.sourceFor(this.selectedPallets[0]) || {};
            await createStickerPDF({
                platformNumber: pallet.palletNumber || '',
                farmer: this.farmer || '',
                variety: pallet.kind || '',
                size: pallet.size || '',
                quantity: pallet.boxes || '',
                weight: pallet.weight || '',
            });
        },
    },
};
</script>
