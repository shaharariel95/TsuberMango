import { createApp } from "vue";
import "./index.css";
import App from "./App.vue";
import router from "./router";
import axios from "axios";

// Set global axios defaults
axios.defaults.withCredentials = true;

createApp(App).use(router).mount("#app");
