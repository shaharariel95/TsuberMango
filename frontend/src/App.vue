<template>
  <div class="h-screen w-full overflow-hidden flex bg-slate-100">
    <!-- ── Mobile Topbar ─────────────────────────────── -->
    <header v-if="!isLoginPage && isMobile"
      class="fixed top-0 right-0 left-0 z-30 h-14 bg-white border-b border-slate-200 shadow-sm flex items-center gap-3 px-3 rtl">
      <button @click="mobileOpen = true"
        class="p-2 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition-all flex-shrink-0"
        aria-label="פתח תפריט">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span class="flex-1 font-bold text-slate-800 text-base text-center truncate">{{ currentPageLabel }}</span>
      <span v-if="selectedFarmer"
        class="text-sm font-semibold bg-mango-50 text-mango-800 border border-mango-200 rounded-lg px-2.5 py-1 flex-shrink-0">
        {{ selectedFarmer }}
      </span>
      <span v-else class="w-10 flex-shrink-0"></span>
    </header>

    <!-- ── Mobile Backdrop ────────────────────────────── -->
    <Transition enter-active-class="transition-opacity duration-250" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100"
      leave-to-class="opacity-0">
      <div v-if="!isLoginPage && isMobile && mobileOpen" @click="mobileOpen = false"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" aria-hidden="true"></div>
    </Transition>

    <!-- ── Sidebar ─────────────────────────────────────── -->
    <nav v-if="!isLoginPage" :class="[
      'fixed right-0 top-0 bottom-0 z-50 flex flex-col',
      'bg-sidebar border-l border-slate-700/50',
      'transition-transform duration-300 ease-in-out',
      sidebarWidthClass,
      isMobile && !mobileOpen ? 'translate-x-full' : 'translate-x-0',
      isMobile ? 'shadow-2xl' : ''
    ]" :style="!isMobile ? 'transition-property: transform, width;' : ''">

      <!-- Brand + Toggle -->
      <div class="flex items-center justify-between p-4 border-b border-slate-700/50 gap-2">
        <div v-if="!desktopCollapsed || isMobile" class="flex items-center gap-2 min-w-0 flex-1">
          <span class="text-2xl flex-shrink-0">🥭</span>
          <h1 class="text-base font-bold text-white truncate">Tsuberi Mango's</h1>
        </div>
        <!-- Mobile close button -->
        <button v-if="isMobile" @click="mobileOpen = false"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0"
          aria-label="סגור תפריט">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <!-- Desktop collapse toggle -->
        <button v-else @click="desktopCollapsed = !desktopCollapsed"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0"
          :class="{ 'mx-auto': desktopCollapsed }" aria-label="כווץ סרגל">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 transition-transform duration-300"
            :class="{ 'rotate-180': desktopCollapsed }" fill="none" viewBox="0 0 24 24" stroke="currentColor"
            stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Farmer Selector -->
      <div class="p-3">
        <select v-model="selectedFarmer" :class="[
          'w-full bg-sidebar-dark border border-slate-600 rounded-lg',
          'text-white font-semibold cursor-pointer text-center',
          'focus:outline-none focus:ring-2 focus:ring-mango-400/50 focus:border-mango-400',
          'hover:border-mango-400/50 transition-colors',
          isCompact ? 'p-1.5 text-sm' : 'p-2.5 text-base'
        ]">
          <option value="" disabled class="text-slate-400">בחר מגדל</option>
          <option v-for="farmer in farmers" :key="farmer" :value="farmer">
            {{ isCompact ? farmer[0] : farmer }}
          </option>
        </select>
      </div>

      <!-- Navigation Links -->
      <ul class="flex flex-col gap-1.5 px-3 flex-grow overflow-y-auto mt-1">
        <li v-for="route in accessibleRoutes" :key="route.path">
          <router-link :to="route.path" @click="onNavigate" :class="[
            'flex items-center gap-3 rounded-lg font-medium transition-all duration-200',
            isCompact ? 'p-2 justify-center' : 'py-3 px-3',
            isActiveLink(route.path)
              ? 'bg-mango-500/15 text-mango-400 shadow-glow-amber/20 border border-mango-500/30'
              : 'text-slate-300 hover:bg-slate-700/50 hover:text-white border border-transparent'
          ]" :title="isCompact ? route.label : ''">
            <span class="text-sm">
              {{ isCompact ? route.label[0] : route.label }}
            </span>
          </router-link>
        </li>
      </ul>

      <!-- Bottom Section -->
      <div class="mt-auto p-3 space-y-1.5 border-t border-slate-700/50">
        <router-link v-for="route in bottomRoutes" :key="route.path" :to="route.path" @click="onNavigate" :class="[
          'flex items-center gap-3 rounded-lg font-medium transition-all duration-200',
          isCompact ? 'p-2 justify-center' : 'py-3 px-3',
          isActiveLink(route.path)
            ? 'bg-mango-500/15 text-mango-400 border border-mango-500/30'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent'
        ]" :title="isCompact ? route.label : ''">
          <span class="text-sm">{{ isCompact ? route.label[0] : route.label }}</span>
        </router-link>

        <button @click="logout" :class="[
          'w-full rounded-lg font-semibold transition-all duration-200',
          'bg-red-500/15 text-red-400 hover:bg-red-500/25 hover:text-red-300',
          isCompact ? 'p-2 text-sm' : 'py-2.5 px-3 text-sm'
        ]">
          {{ isCompact ? '✕' : 'יציאה' }}
        </button>
      </div>
    </nav>

    <!-- ── Main Content ──────────────────────────────── -->
    <div :class="[
      'flex-1 min-h-0 min-w-0 transition-all duration-300',
      mainContentMargin
    ]">
      <div v-if="!isLoginPage" class="h-full p-3 sm:p-4 md:p-6" :style="isMobile ? 'padding-top: 4.25rem;' : ''">
        <div
          class="h-full w-full bg-white rounded-2xl shadow-card overflow-hidden flex flex-col min-h-0 border border-slate-100">
          <div class="flex-grow min-h-0 min-w-0 overflow-auto p-3 sm:p-4 text-slate-800">
            <router-view :selected-farmer="selectedFarmer" />
          </div>
        </div>
      </div>
      <router-view v-else />
    </div>
  </div>

  <!-- ── Global Notifications ────────────────────── -->
  <NotificationList />

  <!-- ── Error Toast ───────────────────────────────── -->
  <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
    <div v-if="showError" class="toast-error" role="alert">
      <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span>{{ error }}</span>
      <button @click="error = null"
        class="mr-2 hover:text-red-200 transition-colors font-bold text-lg leading-none">&times;</button>
    </div>
  </Transition>
</template>

<script>
import { ref, reactive, provide, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from './main';
import { doc, onSnapshot } from 'firebase/firestore';
import { farmerConfigs } from './data/data'; // Fallback for initial load
import NotificationList from './components/NotificationList.vue'

export default {
  components: {
    NotificationList
  },
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
    // Desktop-only collapse (hidden behind toggle in sidebar)
    const desktopCollapsed = ref(false);
    // Mobile drawer open/close state
    const mobileOpen = ref(false);
    // Viewport width tracking
    const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);
    const user = ref(null);

    const isMobile = computed(() => windowWidth.value <= 1366);
    // The sidebar is "compact" only on desktop when collapsed; on mobile it's always full width
    const isCompact = computed(() => !isMobile.value && desktopCollapsed.value);

    const sidebarWidthClass = computed(() => {
      if (isMobile.value) return 'w-72 max-w-[85vw]';
      return desktopCollapsed.value ? 'w-[68px]' : 'w-60';
    });

    const mainContentMargin = computed(() => {
      if (isLoginPage.value) return 'mr-0';
      if (isMobile.value) return 'mr-0';
      return desktopCollapsed.value ? 'mr-[68px]' : 'mr-60';
    });

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

    const currentPageLabel = computed(() => {
      return routes.value.find(r => r.path === route.path)?.label || '';
    });

    watch(() => route.path, (newPath) => {
      // Update login page status when route changes
      if (newPath === '/login') {
        // Clear user data when logging out
        user.value = null;
      }
    });

    // Lock body scroll when drawer is open on mobile
    watch([mobileOpen, isMobile], ([open, mobile]) => {
      if (typeof document === 'undefined') return;
      if (open && mobile) {
        document.body.classList.add('drawer-open');
      } else {
        document.body.classList.remove('drawer-open');
      }
    });

    const onNavigate = () => {
      // Auto-close drawer when a nav link is tapped on tablet/mobile
      if (isMobile.value) mobileOpen.value = false;
    };

    const logout = async () => {
      try {
        await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, { credentials: 'include' });
      } catch (err) {
        // Session is cleared server-side regardless — proceed with client-side logout
        console.warn('Logout request error (session still cleared):', err);
      }
      user.value = null;
      if (isMobile.value) mobileOpen.value = false;
      router.push('/login');
    };

    const routes = ref([
      { path: '/Dashboard', label: 'לוח בקרה', role: 'admin' },
      { path: '/Intake', label: 'קליטה', role: 'admin' },
      { path: '/Weight', label: 'טבלת נתונים', role: 'admin' },
      { path: '/SentPallets', label: 'משטחים שנשלחו', role: 'admin' },
      { path: '/Destination', label: 'הכנה למשלוח', role: 'user' },
      { path: '/SentPalletsForMark', label: 'יצאו למשלוח', role: 'user' },
      { path: '/DestinationsSummary', label: 'סיכום יעדים', role: 'user' },
      { path: '/Settings', label: 'ניהול הגדרות', role: 'admin', isBottom: true },
    ]);

    const onResize = () => {
      windowWidth.value = window.innerWidth;
      // Always keep mobile open=false when transitioning back to desktop
      if (windowWidth.value > 1366 && mobileOpen.value) {
        mobileOpen.value = false;
      }
    };

    onMounted(() => {
      // Auto-collapse on medium-width desktops (1024–1280px)
      if (window.innerWidth > 1366 && window.innerWidth < 1600) {
        desktopCollapsed.value = true;
      }
      window.addEventListener('resize', onResize);

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

    onBeforeUnmount(() => {
      window.removeEventListener('resize', onResize);
      if (typeof document !== 'undefined') {
        document.body.classList.remove('drawer-open');
      }
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
      desktopCollapsed,
      mobileOpen,
      isMobile,
      isCompact,
      sidebarWidthClass,
      mainContentMargin,
      isLoginPage,
      user,
      logout,
      onNavigate,
      accessibleRoutes,
      bottomRoutes,
      config,
      currentPageLabel
    };
  },
};
</script>
