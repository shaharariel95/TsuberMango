<template>
  <div class="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-8" dir="rtl">
    <h1 class="text-3xl font-bold text-gray-800 border-b pb-4">ניהול הגדרות מערכת</h1>

    <!-- 1. Farmers Management -->
    <section class="space-y-4">
      <h2 class="text-2xl font-semibold text-emerald-700 flex items-center gap-2">
        <span>👨‍🌾</span> ניהול חקלאים
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="farmer in localConfig.farmers" :key="farmer.name" 
             class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div class="flex items-center gap-4">
            <span class="font-bold text-lg min-w-[120px]">{{ farmer.name }}</span>
            <label class="flex items-center cursor-pointer">
              <input type="checkbox" v-model="farmer.allowGidon" @change="saveConfig" class="form-checkbox h-5 w-5 text-emerald-600">
              <span class="mr-2 text-sm text-gray-600">גדעון?</span>
            </label>
          </div>
          <button @click="confirmDeleteFarmer(farmer.name)" 
                  class="text-red-500 hover:text-red-700 p-2 transition-colors">
            🗑️
          </button>
        </div>
      </div>

      <!-- Add Farmer -->
      <div class="flex gap-2 mt-4">
        <input v-model="newFarmerName" placeholder="שם חקלאי חדש" 
               class="flex-1 p-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none">
        <button @click="addFarmer" :disabled="isWorking"
                class="bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 disabled:bg-gray-400 transition-all">
          {{ isWorking ? 'יוצר גיליון...' : 'הוסף חקלאי' }}
        </button>
      </div>
    </section>

    <hr>

    <!-- 2. Lists Management (Kinds, Sizes, Destinations) -->
    <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <ListEditor title="זנים" emoji="🥭" addButtonLabel="זן" v-model="localConfig.kinds" />
            <ListEditor title="גדלים" emoji="📏" addButtonLabel="גודל" v-model="localConfig.sizes" />
            <ListEditor title="יעדים" emoji="🚚" addButtonLabel="יעד" v-model="localConfig.destinations" />
        </div>
        
        <div class="flex justify-end pt-4">
            <button @click="saveConfig" :disabled="isWorking"
                    class="bg-emerald-600 text-white px-10 py-3 rounded-lg hover:bg-emerald-700 font-bold shadow-md transition-all">
                💾 שמור את כל השינויים ברשימות
            </button>
        </div>
    </div>

    <div class="pt-10 flex justify-center gap-4">
        <button @click="importFromStatic" 
                class="bg-blue-100 text-blue-700 px-4 py-2 rounded border border-blue-300 hover:bg-blue-200 text-sm">
           📥 ייבוא נתונים מ-data.js (חד פעמי)
        </button>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="farmerToDelete" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div class="bg-white p-8 rounded-xl max-w-md w-full shadow-2xl border-4 border-red-500">
        <h3 class="text-3xl font-bold text-red-600 mb-4">⚠️ אזהרה חמורה!</h3>
        <p class="text-lg mb-6">אתה עומד למחוק את החקלאי: <span class="font-black underline">{{ farmerToDelete }}</span></p>
        
        <div class="space-y-4 mb-6">
          <label class="flex items-start gap-3 p-3 bg-red-50 rounded border border-red-100 cursor-pointer">
            <input type="checkbox" v-model="confirmChecks.app" class="mt-1 h-5 w-5">
            <span class="text-gray-800">אני מאשר להסיר את החקלאי מרשימת הבחירה באפליקציה.</span>
          </label>
          
          <label class="flex items-start gap-3 p-3 bg-red-50 rounded border border-red-100 cursor-pointer">
            <input type="checkbox" v-model="confirmChecks.sheet" class="mt-1 h-5 w-5">
            <span class="text-gray-800 font-bold">מחק גם את הגיליון (Sheet) עם כל הנתונים ההיסטוריים ב-Google Sheets. (לא ניתן לשחזור!)</span>
          </label>
        </div>

        <div class="flex gap-4">
          <button @click="deleteFarmer" :disabled="!confirmChecks.app || isWorking"
                  class="flex-1 bg-red-600 text-white font-bold py-3 rounded-md hover:bg-red-700 disabled:bg-gray-300 transition-all">
            {{ isWorking ? 'מוחק...' : 'אשר מחיקה סופית' }}
          </button>
          <button @click="farmerToDelete = null" class="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-md hover:bg-gray-300">
            ביטול
          </button>
        </div>
      </div>
    </div>

    <!-- Status Toast -->
    <div v-if="status" :class="['fixed bottom-4 right-4 p-4 rounded-lg shadow-lg transition-all', status.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white']">
      {{ status.msg }}
    </div>
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
