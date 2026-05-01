import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000", // Local backend server
        changeOrigin: true, // Ensure the origin of the host header matches the target
        secure: false, // Allow self-signed certificates if using HTTPS
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("credentials", "include"); // Ensure credentials are included
          });
        },
      },
    },
  },
  build:{
    rollupOptions:{
      output:{
        manualChunks(id){
          if(id.includes('node_modules')){
            return id.toString().split('node_modules/')[1].split('/')[0].toString()
          }
        }
      }
    }
  }
});
