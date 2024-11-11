<script>
import { ref, onMounted } from 'vue';

export default {
  setup() {
    const message = ref("Loading...");

    onMounted(async () => {
      const res = await fetch('http://localhost:3000/farmers/גבי/records');
      const data = await res.json();
      message.value = data.data;
    });
 
    return { message };
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="text-center p-6 bg-white rounded shadow-lg">
      <h1 class="text-4xl font-bold text-blue-600">Tsuberi's Mango</h1>
      <p class="mt-4 text-xl text-gray-700">{{ message }}</p>
    </div>
  </div>
</template>
 
<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
