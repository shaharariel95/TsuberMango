// src/router.js
import { createRouter, createWebHistory } from 'vue-router';
import PalletInput from './components/PalletInput.vue';
import Weight from './components/Weight.vue';
import Page2 from './components/Page2.vue';
import SentPallets from './components/SentPallets.vue';

const routes = [
  { path: '/', name: 'palletInfo', component: PalletInput },
  { path: '/Weight', name: 'Weight', component: Weight },
  { path: '/page2', name: 'Page2', component: Page2 },
  { path: '/SentPallets', name: 'SentPallets', component: SentPallets}
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
