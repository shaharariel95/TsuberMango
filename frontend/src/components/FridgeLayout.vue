<template>
  <div class="h-full flex flex-col gap-4 animate-fade-in text-right rtl" dir="rtl">
    
    <!-- ── Header & Analytics Section ────────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-shrink-0">
      
      <!-- Title & Sync Status -->
      <div class="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 text-white flex flex-col justify-between shadow-lg">
        <div>
          <div class="flex items-center gap-2 mb-1 justify-start">
            <span class="text-3xl">🧊</span>
            <h2 class="text-xl font-bold tracking-tight">סידור המקרר וניהול מלאי</h2>
          </div>
          <p class="text-slate-400 text-xs font-medium">מערכת בקרה וניהול למיקום משטחים בתוך מקרר הצינון</p>
        </div>
        
        <div class="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between text-xs text-slate-300">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full" :class="syncStatusClass"></span>
            <span>{{ syncStatusText }}</span>
          </div>
          <div v-if="lastSavedTime" class="text-slate-400 font-mono text-[10px]">
            עודכן: {{ lastSavedTime }}
          </div>
        </div>
      </div>

      <!-- Capacity Progress ring/bar -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-5 shadow-sm">
        <div class="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
          <svg class="w-full h-full transform -rotate-90">
            <circle cx="40" cy="40" r="34" stroke="#f1f5f9" stroke-width="6" fill="transparent" />
            <circle cx="40" cy="40" r="34" :stroke="occupancyColor" stroke-width="6" fill="transparent"
              :stroke-dasharray="213.6" :stroke-dashoffset="dashOffset" stroke-linecap="round" class="transition-all duration-500 ease-out" />
          </svg>
          <div class="absolute flex flex-col items-center">
            <span class="text-lg font-bold text-slate-800 leading-none">{{ occupiedCount }}</span>
            <span class="text-[10px] text-slate-400 font-medium">מתוך 40</span>
          </div>
        </div>
        
        <div class="flex-1 flex flex-col justify-center min-w-0">
          <div class="text-slate-400 text-xs font-bold mb-1 uppercase tracking-wider">אחוז תפוסה</div>
          <div class="text-2xl font-extrabold text-slate-800 leading-none mb-1.5">{{ Math.round(occupancyRate) }}%</div>
          <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div :class="['h-full transition-all duration-500', occupancyBg]" :style="{ width: occupancyRate + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Inventory by Farmer breakdown -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm min-h-[110px]">
        <div class="text-slate-400 text-xs font-bold mb-1.5 uppercase tracking-wider">משטחים לפי מגדל במקרר</div>
        <div v-if="Object.keys(farmerCounts).length === 0" class="text-slate-400 text-sm italic my-auto text-center py-2">
          אין משטחים במקרר כרגע
        </div>
        <div v-else class="grid grid-cols-2 gap-2 text-xs overflow-y-auto max-h-[70px] pr-1">
          <div v-for="(count, farmer) in farmerCounts" :key="farmer" 
            class="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg py-1 px-2">
            <span class="font-bold text-slate-700 truncate max-w-[70px]">{{ farmer }}</span>
            <span class="bg-slate-200 text-slate-800 font-bold px-1.5 py-0.5 rounded text-[10px]">{{ count }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- ── Search & Controls Section ──────────────────────────────── -->
    <div class="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm flex-shrink-0">
      <div class="flex flex-col md:flex-row md:items-center gap-3">
        
        <!-- Search Input -->
        <div class="relative flex-1 min-w-0">
          <input type="text" v-model="searchQuery" placeholder="חפש משטח לפי מספר או מגדל..." 
            class="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-mango-400/50 focus:border-mango-500 rounded-xl pr-10 pl-3 py-2.5 text-sm font-semibold transition-all" />
          <span class="absolute right-3.5 top-3 text-slate-400">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>

        <!-- Camera Scanner trigger button -->
        <button @click="startScanner"
          class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm flex-shrink-0">
          <span>סרוק ברקוד</span>
          <span class="text-base">📷</span>
        </button>

        <!-- Dynamic Selection state banner -->
        <div v-if="selectedPallet" class="flex-shrink-0 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl py-2 px-3 animate-pulse">
          <span class="w-2.5 h-2.5 bg-blue-500 rounded-full"></span>
          <span class="text-xs font-bold text-blue-800">
            נבחר משטח <strong>#{{ selectedPallet.palletNumber }}</strong> ({{ selectedPallet.farmer }}) - לחץ על תא פנוי לשיבוץ
          </span>
          <button @click="clearSelection" class="text-blue-500 hover:text-blue-700 text-xs font-bold mr-1 bg-white hover:bg-blue-100 border border-blue-300 rounded px-1.5 py-0.5 transition-colors">
            ביטול
          </button>
        </div>
      </div>

      <!-- Quick Results Auto-complete List -->
      <div v-if="searchQuery && filteredPallets.length > 0" class="flex flex-wrap gap-2 pt-2 border-t border-slate-100 max-h-[110px] overflow-y-auto pr-1">
        <button v-for="pallet in filteredPallets" :key="pallet.id" @click="selectPallet(pallet)"
          :class="[
            'text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center gap-2 shadow-sm active:scale-95',
            selectedPallet && selectedPallet.id === pallet.id
              ? 'bg-blue-500 text-white border-blue-500 ring-2 ring-blue-300'
              : 'bg-white text-slate-700 border-slate-200 hover:border-mango-300 hover:bg-mango-50/20'
          ]">
          <span class="bg-slate-100 text-slate-800 text-[10px] px-1 py-0.5 rounded font-mono">{{ pallet.palletNumber }}</span>
          <span>{{ pallet.farmer }} - {{ pallet.kind }} ({{ pallet.boxes }} ארגזים)</span>
          <span v-if="!pallet.weight" class="text-amber-500 text-[9px]" title="חסר משקל">⚠️ ללא משקל</span>
        </button>
      </div>
      <div v-else-if="searchQuery" class="text-slate-400 text-xs italic text-center py-1">
        לא נמצאו משטחים זמינים לשיבוץ התואמים את החיפוש
      </div>
    </div>

    <!-- ── Interactive 5x8 Alphanumeric Fridge Grid ──────────────────── -->
    <div class="flex-1 min-h-0 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col shadow-inner select-none relative overflow-y-auto">
      
      <!-- Loading Overlay -->
      <div v-if="isLoading" class="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-10 flex items-center justify-center flex-col gap-3">
        <div class="animate-spin text-3xl">🧊</div>
        <span class="text-sm font-semibold text-slate-600">טוען סידור מקרר...</span>
      </div>

      <!-- Column Labels Header (A-E) -->
      <div class="grid grid-cols-6 gap-2 mb-1.5 flex-shrink-0 text-center text-xs font-extrabold text-slate-400 tracking-wider">
        <div class="flex items-center justify-center">שורה</div>
        <div v-for="col in columns" :key="col" class="py-1 uppercase bg-white/50 border border-slate-200/40 rounded-lg shadow-sm">
          תא {{ col }}
        </div>
      </div>

      <!-- Grid Body Rows (1-8) -->
      <div class="flex-grow flex flex-col gap-2 min-h-0">
        <div v-for="row in rows" :key="row" class="grid grid-cols-6 gap-2 flex-grow min-h-[55px]">
          
          <!-- Row Label Indicator -->
          <div class="flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-700 font-extrabold text-sm shadow-sm">
            {{ row }}
          </div>

          <!-- Interactive Grid Cells -->
          <div v-for="col in columns" :key="col"
            @dragover.prevent="onDragOver($event, getCellId(col, row))"
            @dragleave="onDragLeave($event, getCellId(col, row))"
            @drop="onDrop($event, getCellId(col, row))"
            @click="onCellClick(getCellId(col, row))"
            :id="'cell-' + getCellId(col, row)"
            :class="[
              'rounded-xl border-2 transition-all duration-300 relative flex flex-col justify-between p-1.5 cursor-pointer shadow-sm',
              isCellOccupied(col, row)
                ? getFarmerCardColor(getCellPallet(col, row).farmer)
                : 'bg-white/80 border-dashed border-slate-300 hover:border-mango-400 hover:bg-mango-50/5',
              selectedMoveCellId === getCellId(col, row) ? 'ring-4 ring-blue-500 ring-offset-1 animate-pulse border-blue-500 z-10' : '',
              draggedOverCellId === getCellId(col, row) ? 'bg-mango-100/50 border-mango-400 border-solid scale-98 shadow-md' : ''
            ]">
            
            <!-- Cell Coordinates (e.g., A1) -->
            <span class="absolute top-1 left-1.5 text-[9px] font-extrabold text-slate-400 font-mono tracking-tight">
              {{ getCellId(col, row) }}
            </span>

            <!-- Cell Content (Occupied State) -->
            <div v-if="isCellOccupied(col, row)" class="h-full flex flex-col justify-between pt-2.5 select-none"
              draggable="true" 
              @dragstart="onDragStart($event, getCellId(col, row))">
              
              <!-- Pallet Details -->
              <div class="text-[11px] font-extrabold text-slate-900 leading-tight truncate">
                {{ getCellPallet(col, row).farmer }}
              </div>
              <div class="text-[9px] font-medium text-slate-600 leading-none truncate mt-0.5">
                {{ getCellPallet(col, row).kind }} - גודל {{ getCellPallet(col, row).size }}
              </div>
              
              <!-- Pallet Number badge -->
              <div class="mt-1 flex items-center justify-between">
                <span class="bg-white/80 border border-black/10 text-slate-900 text-[10px] font-mono font-extrabold px-1 rounded truncate leading-none py-0.5">
                  #{{ getCellPallet(col, row).palletNumber }}
                </span>
                <span class="text-[9px] font-bold text-slate-500 leading-none">
                  {{ getCellPallet(col, row).boxes }} ארג'
                </span>
              </div>

              <!-- Unweighed Warning Indicator -->
              <span v-if="!getCellPallet(col, row).weight" class="absolute top-1.5 right-1.5 text-[9px] leading-none" title="משטח ללא משקל!">⚠️</span>
            </div>

            <!-- Empty State placeholder -->
            <div v-else class="h-full flex items-center justify-center text-slate-300 text-xs italic font-medium pt-2 select-none">
              פנוי
            </div>

          </div>

        </div>
      </div>

    </div>

    <!-- ── Discharge / Drop-to-Remove Zone ──────────────────────────── -->
    <div 
      @dragover.prevent="onDragOverRemove"
      @dragleave="onDragLeaveRemove"
      @drop="onDropRemove"
      @click="onRemoveClick"
      :class="[
        'border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-1 shadow-sm flex-shrink-0 select-none',
        selectedMoveCellId 
          ? 'bg-rose-50 border-rose-400 text-rose-800 hover:bg-rose-100 hover:scale-[1.01]' 
          : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100',
        isDragOverRemoveZone ? 'bg-rose-100 border-rose-500 text-rose-800 scale-98 shadow-md border-solid' : ''
      ]">
      <span class="text-xl">🗑️</span>
      <span class="text-sm font-bold">הוצאה מהמקרר / פריקה</span>
      <p class="text-xs font-semibold" :class="selectedMoveCellId ? 'text-rose-700' : 'text-slate-400'">
        {{ selectedMoveCellId ? 'לחץ כאן כדי לפרוק ולהוציא מהמקרר את המשטח הנבחר' : 'גרור משטח לכאן או בחר משטח ולחץ כאן כדי להוציאו מהמקרר' }}
      </p>
    </div>

    <!-- ── Camera Barcode Scanner Modal ────────────────────────────── -->
    <div v-if="showScanner" class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
      <div class="bg-slate-900 text-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative border border-slate-700">
        
        <div class="p-4 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
          <button @click="stopScanner" class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span class="font-bold text-sm">סריקת ברקוד משטח</span>
        </div>

        <div class="flex-grow p-4 flex flex-col justify-center gap-3 relative min-h-[350px]">
          <!-- Interactive Scan overlay target -->
          <div class="relative w-full max-w-[280px] mx-auto aspect-square overflow-hidden rounded-2xl bg-black border border-slate-800">
            <div id="qr-reader" class="w-full h-full overflow-hidden"></div>
            <!-- pulsing green box -->
            <div class="absolute inset-8 border-[3px] border-emerald-500 pointer-events-none rounded-xl animate-pulse flex items-center justify-center">
              <div class="w-full h-0.5 bg-emerald-500 absolute animate-[bounce_2s_infinite]"></div>
            </div>
          </div>
          <span class="text-center text-xs text-slate-400 leading-relaxed font-semibold">מקם את הברקוד של תעודת המשטח מול המצלמה לסריקה אוטומטית</span>
        </div>

      </div>
    </div>

  </div>
</template>

<script>
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useNotification } from '../composables/useNotification';
import { Html5Qrcode } from 'html5-qrcode';

const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

export default {
  props: {
    selectedFarmer: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const { notify } = useNotification();
    const isLoading = ref(false);
    const isSaving = ref(false);
    const syncStatus = ref('synced'); // 'synced' | 'saving' | 'offline' | 'error'
    
    // Grid parameters
    const columns = ['A', 'B', 'C', 'D', 'E'];
    const rows = [1, 2, 3, 4, 5, 6, 7, 8];
    const cells = ref({}); // Structure: { 'A1': { palletNumber, farmer, kind, size, boxes, weight, ... } }
    
    // UI Interactions
    const searchQuery = ref('');
    const selectedPallet = ref(null); // Pallet selected from the search bar
    const selectedMoveCellId = ref(null); // Occupied cell selected for move/remove (Click-to-Move)
    const draggedOverCellId = ref(null);
    const isDragOverRemoveZone = ref(false);
    const lastSavedTime = ref('');

    // Available pallets list fetched from the server
    const allPallets = ref([]);

    // QR Scanner
    const showScanner = ref(false);
    let html5QrcodeScanner = null;

    // Computed Properties
    const syncStatusText = computed(() => {
      if (syncStatus.value === 'synced') return 'מסונכרן עם השרת';
      if (syncStatus.value === 'saving') return 'שומר שינויים...';
      if (syncStatus.value === 'offline') return 'נשמר מקומית (אופליין)';
      return 'שגיאה בסנכרון';
    });

    const syncStatusClass = computed(() => {
      if (syncStatus.value === 'synced') return 'bg-emerald-500 animate-pulse';
      if (syncStatus.value === 'saving') return 'bg-blue-500 animate-pulse';
      if (syncStatus.value === 'offline') return 'bg-amber-500';
      return 'bg-rose-500';
    });

    const occupiedCount = computed(() => {
      return Object.values(cells.value).filter(cell => cell !== null && cell !== undefined).length;
    });

    const occupancyRate = computed(() => {
      return (occupiedCount.value / 40) * 100;
    });

    const occupancyColor = computed(() => {
      if (occupancyRate.value < 50) return '#10b981'; // Green
      if (occupancyRate.value < 85) return '#f59e0b'; // Amber
      return '#ef4444'; // Red
    });

    const occupancyBg = computed(() => {
      if (occupancyRate.value < 50) return 'bg-emerald-500';
      if (occupancyRate.value < 85) return 'bg-amber-500';
      return 'bg-rose-500';
    });

    const dashOffset = computed(() => {
      // Circumference of r=34 circle is 2 * pi * 34 = 213.63
      const c = 213.6;
      return c - (occupancyRate.value / 100) * c;
    });

    // Breakdown counts of pallets per farmer currently in the fridge
    const farmerCounts = computed(() => {
      const counts = {};
      Object.values(cells.value).forEach(pallet => {
        if (pallet) {
          counts[pallet.farmer] = (counts[pallet.farmer] || 0) + 1;
        }
      });
      return counts;
    });

    // Pallets that are eligible to be put in the fridge
    // (i.e. not already in the fridge, not marked as shipped)
    const filteredPallets = computed(() => {
      const occupiedPalletNumbers = new Set(
        Object.values(cells.value)
          .filter(p => p !== null && p !== undefined)
          .map(p => String(p.palletNumber))
      );

      const query = searchQuery.value.trim().toLowerCase();
      return allPallets.value.filter(pallet => {
        // Exclude sent or already marked pallets, and pallets already in fridge
        if (pallet.sent || pallet.mark || occupiedPalletNumbers.has(String(pallet.palletNumber))) {
          return false;
        }
        if (!query) return true;
        return (
          String(pallet.palletNumber).toLowerCase().includes(query) ||
          pallet.farmer.toLowerCase().includes(query) ||
          pallet.kind.toLowerCase().includes(query)
        );
      });
    });

    // Helpers
    const getCellId = (col, row) => `${col}${row}`;
    const isCellOccupied = (col, row) => !!cells.value[getCellId(col, row)];
    const getCellPallet = (col, row) => cells.value[getCellId(col, row)];

    const getFarmerCardColor = (farmer) => {
      const colors = {
        "צוברי": "bg-amber-50 border-amber-300 hover:bg-amber-100/70",
        "אבנר": "bg-emerald-50 border-emerald-300 hover:bg-emerald-100/70",
        "עידן": "bg-sky-50 border-sky-300 hover:bg-sky-100/70",
        "פסח": "bg-purple-50 border-purple-300 hover:bg-purple-100/70",
        "קופלר": "bg-rose-50 border-rose-300 hover:bg-rose-100/70",
        "שחק": "bg-indigo-50 border-indigo-300 hover:bg-indigo-100/70",
      };
      return colors[farmer] || "bg-slate-50 border-slate-200 hover:bg-slate-100";
    };

    // Web Audio API feedback
    const playBeep = (freq = 880) => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);

        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioCtx.close();
        }, 120);
      } catch (e) {
        console.warn("Audio Context blocked or not supported:", e.message);
      }
    };

    // Fetch methods
    const fetchActivePallets = async (farmer) => {
      if (!farmer) return;
      try {
        const hebrewName = encodeURIComponent(farmer);
        const res = await fetch(`${baseUrl}/api/farmers/${hebrewName}/records`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          allPallets.value = data.data || [];
        }
      } catch (err) {
        console.warn("Failed to fetch available pallets:", err.message);
      }
    };

    const loadFridgeLayout = async () => {
      isLoading.value = true;
      try {
        const res = await fetch(`${baseUrl}/api/fridge`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          cells.value = data.cells || {};
          syncStatus.value = 'synced';
          if (data.updatedAt) {
            lastSavedTime.value = new Date(data.updatedAt).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
          }
        } else {
          throw new Error('Server returned error status');
        }
      } catch (err) {
        console.warn("Server fetch for fridge failed. Loading from localStorage.", err.message);
        const local = localStorage.getItem('tsuber_mango_fridge');
        if (local) {
          cells.value = JSON.parse(local);
          syncStatus.value = 'offline';
        } else {
          cells.value = {};
          syncStatus.value = 'offline';
        }
      } finally {
        isLoading.value = false;
      }
    };

    const saveFridgeLayout = async () => {
      isSaving.value = true;
      syncStatus.value = 'saving';

      // Save to localStorage immediately as a fallback
      localStorage.setItem('tsuber_mango_fridge', JSON.stringify(cells.value));

      try {
        const res = await fetch(`${baseUrl}/api/fridge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cells: cells.value }),
          credentials: 'include'
        });

        if (res.ok) {
          syncStatus.value = 'synced';
          lastSavedTime.value = new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        } else {
          throw new Error('Save status was not OK');
        }
      } catch (err) {
        console.warn("Failed to save layout to server. Retained locally.", err.message);
        syncStatus.value = 'offline';
      } finally {
        isSaving.value = false;
      }
    };

    // Selection controls
    const selectPallet = (pallet) => {
      if (selectedPallet.value && selectedPallet.value.id === pallet.id) {
        selectedPallet.value = null;
      } else {
        selectedPallet.value = pallet;
        selectedMoveCellId.value = null; // Clear click-to-move cell selection
        playBeep(660);
      }
    };

    const clearSelection = () => {
      selectedPallet.value = null;
      selectedMoveCellId.value = null;
    };

    // Cell Click (Handles both Placing and Click-to-Move)
    const onCellClick = (cellId) => {
      // Case 1: A pallet is selected from the search bar -> Place it in this cell
      if (selectedPallet.value) {
        if (cells.value[cellId]) {
          notify('התא כבר תפוס על ידי משטח אחר', 'error');
          playBeep(220);
          return;
        }
        
        cells.value[cellId] = {
          id: selectedPallet.value.id,
          palletNumber: selectedPallet.value.palletNumber,
          farmer: selectedPallet.value.farmer,
          kind: selectedPallet.value.kind,
          size: selectedPallet.value.size,
          boxes: selectedPallet.value.boxes,
          weight: selectedPallet.value.weight,
          addedAt: new Date().toISOString()
        };

        notify(`משטח #${selectedPallet.value.palletNumber} שובץ בהצלחה בתא ${cellId}`, 'success');
        playBeep(880);
        selectedPallet.value = null;
        searchQuery.value = '';
        saveFridgeLayout();
        return;
      }

      // Case 2: No pallet is selected, and clicking on an occupied cell -> Initiate Click-to-Move
      if (cells.value[cellId]) {
        if (selectedMoveCellId.value === cellId) {
          selectedMoveCellId.value = null; // Deselect
        } else {
          selectedMoveCellId.value = cellId; // Select cell for move
          playBeep(660);
        }
        return;
      }

      // Case 3: A cell is already selected for move -> Execute the move to this empty cell
      if (selectedMoveCellId.value) {
        const sourcePallet = cells.value[selectedMoveCellId.value];
        if (!sourcePallet) return;

        cells.value[cellId] = sourcePallet;
        delete cells.value[selectedMoveCellId.value];

        notify(`המשטח הועבר מתא ${selectedMoveCellId.value} לתא ${cellId}`, 'success');
        playBeep(987); // High B5 note for moving success
        selectedMoveCellId.value = null;
        saveFridgeLayout();
      }
    };

    // Drag and Drop (HTML5 Desktop Drag API)
    const onDragStart = (event, cellId) => {
      selectedMoveCellId.value = null; // Clear click selection to avoid confusion
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', cellId);
    };

    const onDragOver = (event, cellId) => {
      draggedOverCellId.value = cellId;
    };

    const onDragLeave = (event, cellId) => {
      if (draggedOverCellId.value === cellId) {
        draggedOverCellId.value = null;
      }
    };

    const onDrop = (event, targetCellId) => {
      draggedOverCellId.value = null;
      const sourceCellId = event.dataTransfer.getData('text/plain');

      // Dragging from search bar is not modeled as direct drag dataTransfer here, 
      // but we can support Drag-to-Drop from list by dragstarting lists. 
      // Instead, click-to-move is the default fallback, which is better.
      if (!sourceCellId || sourceCellId === targetCellId) return;

      if (cells.value[targetCellId]) {
        notify('התא כבר תפוס על ידי משטח אחר', 'error');
        playBeep(220);
        return;
      }

      const pallet = cells.value[sourceCellId];
      if (!pallet) return;

      cells.value[targetCellId] = pallet;
      delete cells.value[sourceCellId];

      notify(`המשטח הועבר מתא ${sourceCellId} לתא ${targetCellId}`, 'success');
      playBeep(987);
      saveFridgeLayout();
    };

    // Drag to Remove / Discharge Event Handlers
    const onDragOverRemove = (event) => {
      isDragOverRemoveZone.value = true;
    };

    const onDragLeaveRemove = () => {
      isDragOverRemoveZone.value = false;
    };

    const onDropRemove = (event) => {
      isDragOverRemoveZone.value = false;
      const sourceCellId = event.dataTransfer.getData('text/plain');
      if (!sourceCellId) return;

      dischargePallet(sourceCellId);
    };

    const onRemoveClick = () => {
      if (selectedMoveCellId.value) {
        dischargePallet(selectedMoveCellId.value);
        selectedMoveCellId.value = null;
      } else {
        notify('יש לבחור תחילה משטח במקרר כדי לפרוק אותו', 'info');
      }
    };

    const dischargePallet = (cellId) => {
      const pallet = cells.value[cellId];
      if (!pallet) return;

      delete cells.value[cellId];
      notify(`משטח #${pallet.palletNumber} הוצא בהצלחה מהמקרר`, 'success');
      playBeep(440); // Discharge low tone
      saveFridgeLayout();
    };

    // Camera QR Code Scanner Methods
    const startScanner = () => {
      showScanner.value = true;
      selectedPallet.value = null;
      selectedMoveCellId.value = null;
      
      nextTick(() => {
        html5QrcodeScanner = new Html5Qrcode('qr-reader');
        html5QrcodeScanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          (decodedText) => {
            onScanSuccess(decodedText);
          },
          () => {
            // Error callbacks are ignored to avoid logging spam
          }
        ).catch(err => {
          console.error("Camera startup error:", err);
          notify('גישה למצלמה נכשלה. אנא בדוק הרשאות.', 'error');
          showScanner.value = false;
        });
      });
    };

    const stopScanner = async () => {
      if (html5QrcodeScanner) {
        try {
          await html5QrcodeScanner.stop();
        } catch (e) {
          console.warn("Scanner stopped with warning:", e.message);
        }
        html5QrcodeScanner = null;
      }
      showScanner.value = false;
    };

    const onScanSuccess = (scannedText) => {
      playBeep(1200); // scan sound
      
      // Attempt to clean decoded text to find the pallet number
      // Usually, barcode text is raw palletNumber e.g., "1025" or a custom format
      const cleaned = scannedText.trim();
      
      // Match with active pallets
      const found = allPallets.value.find(p => String(p.palletNumber) === cleaned || String(p.cardId) === cleaned);
      
      if (found) {
        // Exclude if already in the fridge
        const occupiedPalletNumbers = new Set(
          Object.values(cells.value)
            .filter(p => p !== null && p !== undefined)
            .map(p => String(p.palletNumber))
        );

        if (occupiedPalletNumbers.has(String(found.palletNumber))) {
          notify(`המשטח #${found.palletNumber} כבר נמצא בתוך המקרר!`, 'error');
          playBeep(220);
        } else {
          selectedPallet.value = found;
          searchQuery.value = found.palletNumber;
          notify(`משטח #${found.palletNumber} נסרק ונבחר לשיבוץ`, 'success');
        }
      } else {
        searchQuery.value = cleaned;
        notify(`נסרק קוד: ${cleaned}. לא נמצא במאגר משטחי מגדל זה.`, 'info');
      }

      stopScanner();
    };

    // Lifecycle hooks
    onMounted(async () => {
      await loadFridgeLayout();
      if (props.selectedFarmer) {
        await fetchActivePallets(props.selectedFarmer);
      }
    });

    onBeforeUnmount(async () => {
      await stopScanner();
    });

    // Watchers
    watch(() => props.selectedFarmer, async (newFarmer) => {
      if (newFarmer) {
        clearSelection();
        await fetchActivePallets(newFarmer);
      }
    });

    return {
      isLoading,
      isSaving,
      syncStatusText,
      syncStatusClass,
      occupiedCount,
      occupancyRate,
      occupancyColor,
      occupancyBg,
      dashOffset,
      farmerCounts,
      columns,
      rows,
      cells,
      searchQuery,
      filteredPallets,
      selectedPallet,
      selectedMoveCellId,
      draggedOverCellId,
      isDragOverRemoveZone,
      lastSavedTime,
      showScanner,
      getCellId,
      isCellOccupied,
      getCellPallet,
      getFarmerCardColor,
      selectPallet,
      clearSelection,
      onCellClick,
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop,
      onDragOverRemove,
      onDragLeaveRemove,
      onDropRemove,
      onRemoveClick,
      startScanner,
      stopScanner
    };
  }
};
</script>

<style scoped>
/* Progress dash animation */
circle {
  transition: stroke-dashoffset 0.65s cubic-bezier(0.4, 0, 0.2, 1);
}

.shadow-card {
  box-shadow: 0 4px 20px -2px rgba(148, 163, 184, 0.08), 0 2px 8px -1px rgba(148, 163, 184, 0.04);
}

.shadow-glow-amber {
  box-shadow: 0 0 15px 1px rgba(245, 158, 11, 0.15);
}

.scale-98 {
  transform: scale(0.985);
}
</style>
