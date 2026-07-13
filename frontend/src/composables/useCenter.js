import { ref } from 'vue'

// Set once in App.vue from /api/auth/me. Imported wherever a Firestore path
// needs the tenant id (config subscription, farmer events).
export const centerId = ref('')
export function setCenterId(id) { centerId.value = id || '' }
