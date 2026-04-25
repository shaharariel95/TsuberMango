<template>
  <div class="min-h-screen w-full flex bg-slate-100">
    <!-- ── Sidebar ─────────────────────────────────────── -->
    <nav v-if="!isLoginPage"
      :class="[
        'fixed right-0 top-0 bottom-0 z-50 flex flex-col',
        'bg-sidebar border-l border-slate-700/50',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-60'
      ]">

      <!-- Brand + Toggle -->
      <div class="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div v-if="!collapsed" class="flex items-center gap-2 min-w-0">
          <span class="text-2xl">🥭</span>
          <h1 class="text-lg font-bold text-white truncate">Tsuberi Mango's</h1>
        </div>
        <button @click="collapsed = !collapsed"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0 mx-auto"
          :class="{ 'mx-auto': collapsed }">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 transition-transform duration-300"
            :class="{ 'rotate-180': collapsed }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Farmer Selector -->
      <div class="p-3">
        <select v-model="selectedFarmer"
          :class="[
            'w-full bg-sidebar-dark border border-slate-600 rounded-lg',
            'text-white font-semibold cursor-pointer text-center',
            'focus:outline-none focus:ring-2 focus:ring-mango-400/50 focus:border-mango-400',
            'hover:border-mango-400/50 transition-colors',
            collapsed ? 'p-1.5 text-sm' : 'p-2.5 text-base'
          ]">
          <option value="" disabled class="text-slate-400">בחר מגדל</option>
          <option v-for="farmer in farmers" :key="farmer" :value="farmer">
            {{ collapsed ? farmer[0] : farmer }}
          </option>
        </select>
      </div>

      <!-- Navigation Links -->
      <ul class="flex flex-col gap-1.5 px-3 flex-grow overflow-y-auto mt-1">
        <li v-for="route in accessibleRoutes" :key="route.path">
          <router-link
            :to="route.path"
            :class="[
              'flex items-center gap-3 rounded-lg font-medium transition-all duration-200',
              collapsed ? 'p-2 justify-center' : 'py-2.5 px-3',
              isActiveLink(route.path)
                ? 'bg-mango-500/15 text-mango-400 shadow-glow-amber/20 border border-mango-500/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white border border-transparent'
            ]"
            :title="collapsed ? route.label : ''">
            <span :class="[collapsed ? 'text-sm' : 'text-sm']">
              {{ collapsed ? route.label[0] : route.label }}
            </span>
          </router-link>
        </li>
      </ul>

      <!-- Bottom Section -->
      <div class="mt-auto p-3 space-y-1.5 border-t border-slate-700/50">
        <router-link v-for="route in bottomRoutes" :key="route.path"
          :to="route.path"
          :class="[
            'flex items-center gap-3 rounded-lg font-medium transition-all duration-200',
            collapsed ? 'p-2 justify-center' : 'py-2.5 px-3',
            isActiveLink(route.path)
              ? 'bg-mango-500/15 text-mango-400 border border-mango-500/30'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent'
          ]"
          :title="collapsed ? route.label : ''">
          <span class="text-sm">{{ collapsed ? route.label[0] : route.label }}</span>
        </router-link>

        <button @click="logout"
          :class="[
            'w-full rounded-lg font-semibold transition-all duration-200',
            'bg-red-500/15 text-red-400 hover:bg-red-500/25 hover:text-red-300',
            collapsed ? 'p-2 text-sm' : 'py-2.5 px-3 text-sm'
          ]">
          {{ collapsed ? '✕' : 'יציאה' }}
        </button>
      </div>
    </nav>

    <!-- ── Main Content ──────────────────────────────── -->
    <div
      :class="[
        'flex-1 transition-all duration-300 min-h-screen',
        !isLoginPage ? (collapsed ? 'mr-[68px]' : 'mr-60') : 'mr-0'
      ]">
      <div v-if="!isLoginPage" class="h-full p-4 md:p-6">
        <div class="h-full w-full bg-white rounded-2xl shadow-card overflow-hidden flex flex-col border border-slate-100">
          <div class="flex-grow overflow-auto p-5 md:p-6 text-slate-800">
            <router-view :selected-farmer="selectedFarmer" />
          </div>
        </div>
      </div>
      <router-view v-else />
    </div>
  </div>

  <!-- ── Error Toast ───────────────────────────────── -->
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-4">
    <div v-if="showError" class="toast-error" role="alert">
      <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span>{{ error }}</span>
      <button @click="error = null" class="mr-2 hover:text-red-200 transition-colors font-bold text-lg leading-none">&times;</button>
    </div>
  </Transition>
</template>

<script>
import { ref, reactive, provide, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from './main';
import { doc, onSnapshot } from 'firebase/firestore'; 
import { farmerConfigs } from './data/data'; // Fallback for initial load

export default {
  setup() {
    const showError = ref(false);
    const error = ref(null);
    const route = useRoute();
    const router = useRouter();
    
    // Dynamic Config State
    const farmers = ref([]); // Now dynamic
    const kinds = ref([]);
    const sizes = ref([]);
    const destinations = ref([]);
    const dynamicFarmerConfigs = ref({});

    const selectedFarmer = ref("");
    const collapsed = ref(false);
    const user = ref(null); 

    // Provide the config to all children as a reactive object
    const config = reactive({
      farmers: [],
      kinds: [],
      sizes: [],
      destinations: [],
      farmerConfigs: {}
    });
    provide('config', config);
    provide('selectedFarmer', selectedFarmer);

    const isActiveLink = (path) => {
      return route.path === path;
    };

    const isLoginPage = computed(() => {
      return route.path === '/login';
    });

    watch(() => route.path, (newPath) => {
      // Update login page status when route changes
      if (newPath === '/login') {
        // Clear user data when logging out
        user.value = null;
      }
    });

    const logout = async () => {
      try {
        await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, { credentials: 'include' });
        user.value = null;
        router.push('/login');
      } catch (err) {
        error.value = "Failed to logout. Please try again.";
        showError.value = true;
        setTimeout(() => {
          showError.value = false;
        }, 3000);
      }
    };

    const routes = ref([
      { path: '/', label: 'קליטה', role: 'admin' },
      { path: '/Weight', label: 'טבלת נתונים', role: 'admin' },
      { path: '/SentPallets', label: 'משטחים שנשלחו', role: 'admin' },
      { path: '/Destination', label: 'הכנה למשלוח', role: 'user' },
      { path: '/SentPalletsForMark', label: 'יצאו למשלוח', role: 'user' },
      { path: '/DestinationsSummary', label: 'סיכום יעדים', role: 'user' },
      { path: '/Settings', label: 'ניהול הגדרות', role: 'admin', isBottom: true },
    ]);

    onMounted(() => {
      // 1. Fetch User Info
      fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.email) user.value = data;
        })
        .catch(err => console.error("Not logged in"));

      // 2. Listen to Firestore Config
      const configDoc = doc(db, "config", "global");
      onSnapshot(configDoc, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          kinds.value = data.kinds || [];
          sizes.value = data.sizes || [];
          destinations.value = data.destinations || [];
          
          // Map farmer list
          const farmersList = data.farmers || [];
          farmers.value = farmersList.map(f => f.name);
          
          // Map farmer configs
          const fConfigs = {};
          farmersList.forEach(f => {
            fConfigs[f.name] = { allowGidon: f.allowGidon };
          });
          dynamicFarmerConfigs.value = fConfigs;

          // Sync the shared reactive config object
          config.kinds = data.kinds || [];
          config.sizes = data.sizes || [];
          config.destinations = data.destinations || [];
          config.farmers = farmers.value;
          config.farmerConfigs = fConfigs;

          if (!selectedFarmer.value && farmers.value.length > 0) {
            selectedFarmer.value = farmers.value[0];
          }
        }
      });
    });

    const accessibleRoutes = computed(() => {
      if (!user.value) return [];
      return routes.value.filter(route =>
        (user.value.role === 'admin' || route.role === user.value.role || route.role === 'all') && !route.isBottom
      );
    });

    const bottomRoutes = computed(() => {
        if (!user.value) return [];
        return routes.value.filter(route => 
            route.isBottom && (user.value.role === 'admin' || route.role === user.value.role)
        );
    });

    // Watch for error changes to show/hide error message
    watch(error, (newError) => {
      showError.value = !!newError;
      if (newError) {
        setTimeout(() => {
          error.value = null;
        }, 5000);
      }
    });

    return {
      showError,
      error,
      isActiveLink,
      selectedFarmer,
      farmers,
      collapsed,
      isLoginPage,
      user,
      logout,
      accessibleRoutes,
      bottomRoutes,
      config
    };
  },
};
</script>