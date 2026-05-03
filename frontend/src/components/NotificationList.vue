<template>
  <div class="fixed bottom-6 left-6 z-[200] flex flex-col gap-2 items-start max-w-md w-full pointer-events-none">
    <TransitionGroup
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-for="n in notifications"
        :key="n.id"
        :class="[
          'pointer-events-auto px-5 py-3.5 rounded-xl shadow-xl font-medium text-sm flex items-center gap-3 w-full backdrop-blur-sm text-white',
          n.type === 'success' ? 'bg-emerald-500/95' :
          n.type === 'error'   ? 'bg-red-500/95' :
                                 'bg-slate-700/95'
        ]"
        role="alert"
      >
        <!-- icon -->
        <svg v-if="n.type === 'error'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <svg v-else-if="n.type === 'success'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <svg v-else class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>

        <span class="flex-1">{{ n.message }}</span>

        <button
          @click="dismiss(n.id)"
          class="mr-2 hover:opacity-70 transition-opacity font-bold text-lg leading-none flex-shrink-0"
          aria-label="סגור"
        >&times;</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script>
import { useNotification } from '../composables/useNotification'

export default {
  setup() {
    const { notifications, dismiss } = useNotification()
    return { notifications, dismiss }
  }
}
</script>
