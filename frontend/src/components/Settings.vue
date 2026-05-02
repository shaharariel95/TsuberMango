<template>
  <div class="max-w-4xl mx-auto space-y-8 animate-fade-in" dir="rtl">
    <!-- Header -->
    <div class="border-b border-slate-200 pb-4">
      <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <svg class="w-6 h-6 text-mango-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        ניהול הגדרות מערכת
      </h1>
      <p class="text-slate-400 text-sm mt-1">ניהול חקלאים, זנים, גדלים ויעדים</p>
    </div>

    <!-- 1. Farmers Management -->
    <section class="card space-y-4">
      <h2 class="text-xl font-bold text-slate-700 flex items-center gap-2 pb-2 border-b border-slate-100">
        <span class="text-lg">👨‍🌾</span> ניהול חקלאים
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div v-for="farmer in localConfig.farmers" :key="farmer.name"
             class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors gap-2">
          <div class="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <span class="font-bold text-sm min-w-[80px] sm:min-w-[100px] text-slate-700 truncate">{{ farmer.name }}</span>
            <label class="flex items-center cursor-pointer gap-2 flex-shrink-0">
              <input type="checkbox" v-model="farmer.allowGidon" @change="saveConfig"
                     class="form-checkbox h-5 w-5 rounded text-mango-500 border-slate-300 focus:ring-mango-400">
              <span class="text-xs text-slate-500">גדעון?</span>
            </label>
          </div>
          <button @click="confirmDeleteFarmer(farmer.name)"
                  class="text-red-400 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-lg transition-all text-base flex-shrink-0 min-h-[40px] min-w-[40px]"
                  aria-label="מחק חקלאי">
            🗑️
          </button>
        </div>
      </div>

      <!-- Add Farmer -->
      <div class="flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-slate-100">
        <input v-model="newFarmerName" placeholder="שם חקלאי חדש"
               class="input-field flex-1 text-sm">
        <button @click="addFarmer" :disabled="isWorking"
                class="btn-primary text-sm flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[44px]">
          <span class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white" v-if="isWorking"></span>
          {{ isWorking ? 'יוצר גיליון...' : '+ הוסף חקלאי' }}
        </button>
      </div>
    </section>

    <!-- 2. Lists Management -->
    <section class="card space-y-5">
      <h2 class="text-xl font-bold text-slate-700 pb-2 border-b border-slate-100 flex items-center gap-2">
        <span class="text-lg">📋</span> ניהול רשימות
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <ListEditor title="זנים" emoji="🥭" addButtonLabel="זן" v-model="localConfig.kinds" />
        <ListEditor title="גדלים" emoji="📏" addButtonLabel="גודל" v-model="localConfig.sizes" />
        <ListEditor title="יעדים" emoji="🚚" addButtonLabel="יעד" v-model="localConfig.destinations" />
      </div>
      
      <div class="flex justify-end pt-4 border-t border-slate-100">
        <button @click="saveConfig" :disabled="isWorking"
                class="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]">
          <span class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white" v-if="isWorking"></span>
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          שמור את כל השינויים
        </button>
      </div>
    </section>

    <!-- Import Button -->
    <div class="flex justify-center">
      <button @click="importFromStatic" 
              class="btn-ghost text-xs border border-slate-200 text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
        📥 ייבוא נתונים מ-data.js (חד פעמי)
      </button>
    </div>

    <!-- Delete Confirmation Modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0">
      <div v-if="farmerToDelete" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div class="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl animate-slide-up">
          <!-- Red Header -->
          <div class="bg-red-50 -m-6 mb-5 p-5 rounded-t-2xl border-b border-red-100">
            <h3 class="text-xl font-bold text-red-600 flex items-center gap-2">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              אזהרה חמורה!
            </h3>
            <p class="text-sm text-red-500 mt-1">מחיקת החקלאי: <strong class="underline">{{ farmerToDelete }}</strong></p>
          </div>
          
          <div class="space-y-3 mb-6">
            <label class="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
              <input type="checkbox" v-model="confirmChecks.app" class="mt-0.5 h-4 w-4 rounded text-red-500 border-red-300 focus:ring-red-400">
              <span class="text-sm text-slate-700">אני מאשר להסיר את החקלאי מרשימת הבחירה באפליקציה.</span>
            </label>
            
            <label class="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
              <input type="checkbox" v-model="confirmChecks.sheet" class="mt-0.5 h-4 w-4 rounded text-red-500 border-red-300 focus:ring-red-400">
              <span class="text-sm text-slate-700 font-semibold">מחק גם את הגיליון (Sheet) עם כל הנתונים ההיסטוריים. (לא ניתן לשחזור!)</span>
            </label>
          </div>

          <div class="flex gap-3">
            <button @click="deleteFarmer" :disabled="!confirmChecks.app || isWorking"
                    class="flex-1 btn-danger flex items-center justify-center gap-2">
              <span class="loading-spinner !w-4 !h-4 !border-white/30 !border-t-white" v-if="isWorking"></span>
              {{ isWorking ? 'מוחק...' : 'אשר מחיקה סופית' }}
            </button>
            <button @click="farmerToDelete = null" 
                    class="flex-1 btn-ghost bg-slate-100 hover:bg-slate-200 font-semibold">
              ביטול
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Status Toast -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4">
      <div v-if="status"
           :class="[
             'toast',
             status.type === 'error' ? 'bg-red-500/95 text-white' : 'bg-emerald-500/95 text-white'
           ]">
        <svg v-if="status.type === 'error'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <svg v-else class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {{ status.msg }}
      </div>
    </Transition>
  </div>
</template>

<script>
import { ref, reactive, onMounted, defineComponent } from 'vue';
import { db } from '../main';
import { doc, onSnapshot } from 'firebase/firestore';
import axios from 'axios';
import { kinds, sizes, destinations, farmerConfigs } from '../data/data';
import ListEditor from './ListEditor.vue';



export default {
  components: { ListEditor },
  setup() {
    const localConfig = reactive({
      farmers: [],
      kinds: [],
      sizes: [],
      destinations: []
    });
    const newFarmerName = ref('');
    const isWorking = ref(false);
    const farmerToDelete = ref(null);
    const confirmChecks = reactive({ app: false, sheet: false });
    const status = ref(null);

    const baseUrl = import.meta.env.VITE_API_BASE_URL;

    onMounted(() => {
      // Listen to config
      const docRef = doc(db, "config", "global");
      onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          Object.assign(localConfig, snap.data());
        }
      });
    });

    const saveConfig = async () => {
      try {
        isWorking.value = true;
        await axios.post(`${baseUrl}/api/admin/config`, JSON.parse(JSON.stringify(localConfig)));
        showStatus('הגדרות נשמרו בשרת בהצלחה', 'success');
      } catch (err) {
        showStatus('שגיאה בשמירת הגדרות בשרת', 'error');
        console.error(err);
      } finally {
        isWorking.value = false;
      }
    };

    const addFarmer = async () => {
      const name = newFarmerName.value.trim();
      if (!name) return;
      if (localConfig.farmers.some(f => f.name === name)) {
        return showStatus('חקלאי כזה כבר קיים', 'error');
      }

      isWorking.value = true;
      try {
        // 1. Backend: Create Sheet
        await axios.post(`${baseUrl}/api/admin/create-sheet`, { name });
        
        // 2. Firestore: Add to metadata
        localConfig.farmers.push({ name, allowGidon: false });
        await saveConfig();
        
        newFarmerName.value = '';
        showStatus(`החקלאי ${name} נוסף בהצלחה`, 'success');
      } catch (err) {
        showStatus(`שגיאה בהוספת חקלאי: ${err.response?.data?.error || err.message}`, 'error');
      } finally {
        isWorking.value = false;
      }
    };

    const confirmDeleteFarmer = (name) => {
      farmerToDelete.value = name;
      confirmChecks.app = false;
      confirmChecks.sheet = false;
    };

    const deleteFarmer = async () => {
      const name = farmerToDelete.value;
      isWorking.value = true;
      try {
        // 1. Delete sheet if requested
        if (confirmChecks.sheet) {
          await axios.post(`${baseUrl}/api/admin/delete-sheet`, { name });
        }

        // 2. Update Firestore
        localConfig.farmers = localConfig.farmers.filter(f => f.name !== name);
        await saveConfig();
        
        farmerToDelete.value = null;
        showStatus(`החקלאי ${name} הוסר`, 'success');
      } catch (err) {
        showStatus(`שגיאה במחיקת חקלאי: ${err.response?.data?.error || err.message}`, 'error');
      } finally {
        isWorking.value = false;
      }
    };

    const importFromStatic = async () => {
      if (!confirm('האם לייבא את כל הנתונים מ-data.js? זה ידרוס את ההגדרות הנוכחיות ב-Firestore.')) return;
      
      const legacyFarmers = ['גבי צוברי', 'עטר שחק', 'קופלר', 'גמליאל', 'אבנר לוי', 'עידן לוי'];
      
      localConfig.kinds = kinds;
      localConfig.sizes = sizes;
      localConfig.destinations = destinations;
      localConfig.farmers = legacyFarmers.map(name => ({
        name,
        allowGidon: farmerConfigs[name]?.allowGidon || false
      }));
      
      await saveConfig();
      showStatus('נתונים יובאו בהצלחה', 'success');
    };

    const showStatus = (msg, type) => {
      status.value = { msg, type };
      setTimeout(() => status.value = null, 4000);
    };

    return {
      localConfig, newFarmerName, isWorking, saveConfig, addFarmer,
      confirmDeleteFarmer, farmerToDelete, confirmChecks, deleteFarmer,
      importFromStatic, status
    };
  }
};
</script>
