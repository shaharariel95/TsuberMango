<template>
  <div class="min-h-screen w-full bg-gradient-to-b from-emerald-50 to-emerald-800 flex">
    <!-- Left Sidebar -->
    <nav
      :class="['bg-gray-300 border-r border-amber-50 p-4 flex flex-col space-y-4 fixed left-0 top-0 bottom-0 transition-all duration-300 z-50', collapsed ? 'w-16' : 'w-56']">
      <div class="flex justify-between items-center">
        <h1 v-if="!collapsed" class="text-2xl font-bold text-black">Tsuberi Mango's</h1>
        <button @click="collapsed = !collapsed" class="text-black text-xl font-bold">
          {{ collapsed ? '>' : '<' }}
        </button>
      </div>

      <div class="relative">
        <select v-model="selectedFarmer"
          :class="['w-full p-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-700 cursor-pointer hover:border-amber-500 transition-colors duration-200 text-center', collapsed ? 'text-sm' : 'text-2xl']">
          <option value="" disabled>Select a farmer</option>
          <option v-for="farmer in farmers" :key="farmer" :value="farmer">
            {{ collapsed ? farmer[0] : farmer }}
          </option>
        </select>
      </div>

      <ul class="flex flex-col space-y-2">
        <li>
          <router-link
            :class="['block p-2 rounded border-2  border-gray-700 text-black text-end font-bold', { 'bg-blue-400': isActiveLink('/'), 'bg-white': !isActiveLink('/') }]"
            to="/">
            {{ collapsed ? '1' : 'קליטה' }}
          </router-link>
        </li>
        <li>
          <router-link
            :class="['block p-2 rounded border-2  border-gray-700 text-black text-end font-bold', { 'bg-blue-400': isActiveLink('/Weight'), 'bg-white': !isActiveLink('/Weight') }]"
            to="/Weight">
            {{ collapsed ? '2' : 'שקילה ויעד' }}
          </router-link>
        </li>
        <!-- <li>
          <router-link
            :class="['block p-2 rounded border-2  border-gray-700 text-black text-end font-bold', { 'bg-blue-400': isActiveLink('/page2'), 'bg-white': !isActiveLink('/page2') }]"
            to="/page2">
            {{ collapsed ? '3' : 'מדבקות משטח' }}
          </router-link>
        </li> -->
        <li>
          <router-link
            :class="['block p-2 rounded border-2  border-gray-700 text-black text-end font-bold', { 'bg-blue-400': isActiveLink('/SentPallets'), 'bg-white': !isActiveLink('/SentPallets') }]"
            to="/SentPallets">
            {{ collapsed ? '4' : 'משטחים שנשלחו' }}
          </router-link>
        </li>
      </ul>
    </nav>

    <!-- Main Content -->
    <div :class="['flex-1 p-4 sm:p-1 transition-all duration-300 h-screen', collapsed ? 'ml-20' : 'ml-64']">
      <div class="h-full w-full bg-natural-200 rounded-lg shadow-lg overflow-hidden flex flex-col">
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
    const farmers = ref(["צוברי", "שחק", "קופלר", "גמליאל", "אבנר"])
    const selectedFarmer = ref(farmers.value[0])
    const collapsed = ref(false)
    provide('selectedFarmer', selectedFarmer)


    const isActiveLink = (path) => {
      console.log(`route.path === path`, route.path === path)
      return route.path === path
    }

    return { showError, error, router, isActiveLink, selectedFarmer, farmers, collapsed }
  }
}
</script>