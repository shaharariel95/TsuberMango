<template>
  <div class="min-h-screen w-full bg-gradient-to-b from-gray-300 to-gray-500 flex">
    <!-- Left Sidebar -->
    <nav
      class="bg-amber-50 border-r border-amber-50 p-4 flex flex-col space-y-4 fixed left-0 top-0 bottom-0 w-56 transition-all duration-300 z-50">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-black">Tsuberi Mango's</h1>
      </div>

      <div class="relative">
        <select v-model="selectedFarmer" class="w-full p-2 bg-white border border-gray-300 rounded-md shadow-sm 
           focus:outline-none focus:ring-2 focus:ring-amber-500 
           text-gray-700 cursor-pointer hover:border-amber-500 
           transition-colors duration-200">
          <option value="" disabled>Select a farmer</option>
          <option v-for="farmer in farmers" :key="farmer" :value="farmer">
            {{ farmer }}
          </option>
        </select>
      </div>

      <ul class="flex flex-col space-y-2">
        <li>
          <router-link
            :class="['block p-2 rounded hover:border-2 hover:border-gray-700 text-black', { 'bg-amber-200': isActiveLink('/') }]"
            to="/">
            קליטה
          </router-link>
        </li>
        <li>
          <router-link
            :class="['block p-2 rounded hover:border-2 hover:border-gray-700 text-black', { 'bg-amber-200': isActiveLink('/page1') }]"
            to="/page1">
            שקילה ויעד
          </router-link>
        </li>
        <li>
          <router-link
            :class="['block p-2 rounded hover:border-2 hover:border-gray-700 text-black', { 'bg-amber-200': isActiveLink('/page2') }]"
            to="/page2">
            תעודות משלוח
          </router-link>
        </li>
      </ul>
    </nav>

    <!-- Main Content -->
    <div class="flex-1 p-4 sm:p-8 ml-64 transition-all duration-300 h-screen">
      <div class=" h-full w-full bg-amber-50 rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div class="flex-grow overflow-auto p-4 text-black">
          <router-view v-if="selectedFarmer" :selected-farmer="selectedFarmer" />
          <div v-else>Please select a farmer</div>
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
import { ref, provide } from 'vue'
import { useRoute } from 'vue-router'
import router from './router'



export default {
  setup() {
    const showError = ref(false)
    const error = ref(null)
    const route = useRoute()
    const farmers = ref(["צוברי", "שחק", "גדעון", "עופר", "גמליאל", "אבנר"])
    const selectedFarmer = ref(farmers.value[0])
    provide('selectedFarmer', selectedFarmer)


    const isActiveLink = (path) => {
      return route.path === path
    }

    return { showError, error, router, isActiveLink, selectedFarmer, farmers }
  }
}
</script>