import { reactive } from 'vue'

const notifications = reactive([])
let nextId = 0

export function useNotification() {
  function notify(message, type = 'info') {
    const id = ++nextId
    notifications.push({ id, message, type })
    if (type === 'success') {
      setTimeout(() => dismiss(id), 3000)
    }
    // errors and info stay until dismissed
  }

  function dismiss(id) {
    const idx = notifications.findIndex(n => n.id === id)
    if (idx !== -1) notifications.splice(idx, 1)
  }

  return { notifications, notify, dismiss }
}
