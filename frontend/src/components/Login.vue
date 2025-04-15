<template>
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-emerald-800">
        <div class="p-8 bg-white rounded shadow-md text-center">
            <h1 class="text-2xl font-bold mb-4">Login with Google</h1>
            <button @click="login" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Login</button>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const login = () => {
    window.location.href = '/api/auth/google';
};
</script>