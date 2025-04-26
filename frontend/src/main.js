import { createApp } from "vue";
import "./index.css";
import App from "./App.vue";
import router from "./router";
import axios from "axios";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Set global axios defaults
axios.defaults.withCredentials = true;

// Firebase config loaded from Vite env vars
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebase = initializeApp(firebaseConfig);
const analytics = getAnalytics(firebase);

createApp(App).use(router).mount("#app");
