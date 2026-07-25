import { createRouter, createWebHistory } from "vue-router";
import axios from "axios";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./main";

import PalletInput from "./components/PalletInput.vue";
import Weight from "./components/Weight.vue";
import SentPallets from "./components/SentPallets.vue";
import sentPalletsForMark from "./components/sentPalletsForMark.vue";
import Destination from "./components/Destination.vue";
import Login from "./components/Login.vue";
import DestinationsSummary from "./components/DestinationsSummary.vue";
import Settings from "./components/Settings.vue";
import Dashboard from "./components/Dashboard.vue";

const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

const routes = [
  { path: "/login", name: "Login", component: Login },
  {
    path: "/Dashboard",
    name: "Dashboard",
    component: Dashboard,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: "/Intake",
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

// Resolve Firebase's initial auth state once (avoids a hard-reload race).
function currentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
  });
}

router.beforeEach(async (to) => {
  const user = auth.currentUser || (await currentUser());

  if (!user) return to.path === "/login" ? true : "/login";
  if (to.path === "/login") return "/Destination"; // signed in; leave login

  // Admin gate + role-home redirect for bare/unknown paths.
  if (to.meta.requiresAdmin || to.matched.length === 0 || to.path === "/") {
    try {
      const res = await axios.get(`${baseUrl}/api/auth/me`);
      const role = res.data.role;
      if (to.matched.length === 0 || to.path === "/") {
        return role === "admin" ? "/Dashboard" : "/Destination";
      }
      if (to.meta.requiresAdmin && role !== "admin") return "/Destination";
    } catch (err) {
      if (err.response && err.response.status === 401) return "/login";
      console.warn("Auth role check failed:", err.message);
      if (to.matched.length === 0) return "/login";
    }
  }
  return true;
});

export default router;
