<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
    <!-- Background decorative blobs -->
    <div class="absolute top-1/4 -right-20 w-72 h-72 bg-mango-500/10 rounded-full blur-3xl"></div>
    <div class="absolute bottom-1/4 -left-20 w-96 h-96 bg-mango-400/8 rounded-full blur-3xl"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-mango-500/5 rounded-full blur-3xl"></div>

    <!-- Login Card -->
    <div class="relative z-10 animate-fade-in">
      <div class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-10 text-center max-w-sm w-full mx-4">
        <!-- Logo -->
        <div class="mb-6">
          <span class="text-6xl block mb-3">🥭</span>
          <h1 class="text-2xl font-bold text-white">Tsuberi Mango's</h1>
          <p class="text-slate-400 text-sm mt-1">מערכת ניהול משטחים ומשלוחים</p>
        </div>

        <!-- Divider -->
        <div class="h-px bg-gradient-to-l from-transparent via-slate-500/50 to-transparent my-6"></div>

        <!-- Google Login Button -->
        <button @click="login"
          class="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
          <!-- Google "G" SVG -->
          <svg viewBox="0 0 24 24" class="w-5 h-5 flex-shrink-0">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>התחבר עם Google</span>
        </button>

        <!-- Footer -->
        <p class="text-slate-500 text-xs mt-6">גישה מורשית בלבד</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

const login = () => {
    window.location.href = `${baseUrl}/api/auth/google`;
};
</script>