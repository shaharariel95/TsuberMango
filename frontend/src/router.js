import { createRouter, createWebHistory } from "vue-router";
import axios from "axios";

import PalletInput from "./components/PalletInput.vue";
import Weight from "./components/Weight.vue";
import SentPallets from "./components/SentPallets.vue";
import sentPalletsForMark from "./components/sentPalletsForMark.vue";
import Destination from "./components/Destination.vue";
import Login from "./components/Login.vue";
import DestinationsSummary from "./components/DestinationsSummary.vue";
import Settings from "./components/Settings.vue";

const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

const routes = [
  { path: "/login", name: "Login", component: Login },
  {
    path: "/",
    name: "PalletInfo",
    component: PalletInput,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: "/Weight",
    name: "Weight",
    component: Weight,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: "/SentPallets",
    name: "SentPallets",
    component: SentPallets,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: "/sentPalletsForMark",
    name: "sentPalletsForMark",
    component: sentPalletsForMark,
    meta: { requiresAuth: true},
  },
  {
    path: "/Destination",
    name: "Destination",
    component: Destination,
    meta: { requiresAuth: true },
  },
  {
    path: "/DestinationsSummary",
    name: "DestinationsSummary",
    component: DestinationsSummary,
    meta: { requiresAuth: true },
  },
  {
    path: "/Settings",
    name: "Settings",
    component: Settings,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  // Allow direct navigation to /login without auth check
  if (to.path === "/login") {
    return next();
  }
  try {
    const res = await axios.get(`${baseUrl}/api/auth/me`, { withCredentials: true });
    const user = res.data;

    if (to.meta.requiresAuth && !user) {
      return next("/login");
    }

    if (to.meta.requiresAdmin && user.role !== "admin") {
      return next("/Destination"); // fallback for non-admins
    }

    next(); // allow navigation
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Definitive "not logged in" — redirect to login
      if (to.meta.requiresAuth) return next("/login");
      return next();
    }
    // Network error or server down — don't kick the user out, just let them through.
    // Page components will show their own error states.
    console.warn("Auth check failed (server may be down):", error.message);
    next();
  }
});

export default router;
