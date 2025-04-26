<template>
  <div class="min-h-screen w-full bg-gradient-to-b from-emerald-50 to-emerald-800 flex">
    <nav v-if="!isLoginPage"
      :class="['bg-gray-300 border-r border-amber-50 p-4 flex flex-col space-y-4 fixed left-0 top-0 bottom-0 transition-all duration-300 z-50', collapsed ? 'w-16' : 'w-56']">
      <div class="flex justify-between items-center">
        <h1 v-if="!collapsed" class="text-2xl font-bold text-black">Tsuberi Mango's</h1>
        <button @click="collapsed = !collapsed" class="text-black text-xl font-bold">
          {{ collapsed ? '>' : '<' }} </button>
      </div>

      <div class="relative">
        <select v-model="selectedFarmer"
          :class="['w-full p-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-700 cursor-pointer hover:border-amber-500 transition-colors duration-200 text-center', collapsed ? 'text-sm' : 'text-2xl']">
          <option value="" disabled>Select a farmer</option>
          <option v-for="farmer in farmers" :key="farmer" :value="farmer">
            {{ collapsed ? farmer[0] : farmer }}
          </option>
        </select>
      </div>

      <ul class="flex flex-col space-y-2 flex-grow">
        <li v-for="route in accessibleRoutes" :key="route.path">
          <router-link
            :class="['block p-2 rounded border-2  border-gray-700 text-black text-end font-bold', { 'bg-blue-400': isActiveLink(route.path), 'bg-white': !isActiveLink(route.path) }]"
            :to="route.path">
            {{ collapsed ? route.label[0] : route.label }}
          </router-link>
        </li>
      </ul>

      <div class="mt-auto">
        <button @click="logout" class="p-2 bg-red-500 text-white rounded w-full">יציאה</button>
      </div>
    </nav>

    <div
      :class="['flex-1 p-4 sm:p-1 transition-all duration-300 h-screen', !isLoginPage ? (collapsed ? 'ml-20' : 'ml-64') : 'ml-0']">
      <div class="h-full w-full bg-natural-200 rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div class="flex-grow overflow-auto p-4 text-black">
          <router-view v-if="!isLoginPage" :selected-farmer="selectedFarmer" />
          <router-view v-else />
        </div>
      </div>
    </div>
  </div>

  <div v-if="showError"
    class="fixed inset-0 m-4 sm:m-40 w-auto h-fit bg-amber-300 border border-amber-500 text-amber-800 px-4 py-3 rounded mb-4 flex justify-center items-center"
    role="alert">
    <div>
      <strong class="font-bold">Error:</strong>
      <span class="block sm:inline">{{ error }}</span>
    </div>
    <button class="absolute top-2 right-2 w-14 text-center" @click="error = null">x</button>
  </div>
</template>

<script>
import { ref, provide, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export default {
  setup() {
    const showError = ref(false);
    const error = ref(null);
    const route = useRoute();
    const router = useRouter();
    const farmers = ref(['גבי צוברי', 'עטר שחק', 'איתי קופלר', 'פסח גמליאל', 'אבנר לוי', 'עידן לוי']);
    const selectedFarmer = ref(farmers.value[0]);
    const collapsed = ref(false);
    const user = ref({ role: 'admin' }); // Set a default user or fetch from API
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
      { path: '/Weight', label: 'שקילה ויעד', role: 'admin' },
      { path: '/SentPallets', label: 'משטחים שנשלחו', role: 'admin' },
      { path: '/Destination', label: 'הצבת יעדים', role: 'user' },
      { path: '/SentPalletsForMark', label: 'יצאו למשלוח', role: 'user' },
    ]);

    const accessibleRoutes = computed(() => {
      if (!user.value) return [];
      return routes.value.filter(route =>
        user.value.role === 'admin' || route.role === user.value.role || route.role === 'all'
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
      accessibleRoutes
    };
  },
};
</script>