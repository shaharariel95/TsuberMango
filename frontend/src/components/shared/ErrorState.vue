<template>
    <div class="flex flex-col items-center justify-center py-20 gap-4">
        <div class="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full text-center shadow-sm">
            <svg class="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p class="text-red-700 font-semibold text-sm mb-1">{{ title }}</p>
            <p class="text-red-600 text-sm mb-4">{{ message }}</p>
            <button @click="$emit('retry')"
                class="px-4 py-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all">
                נסה שוב
            </button>
        </div>
    </div>
</template>

<script>
export default {
    emits: ['retry'],
    props: {
        title: {
            type: String,
            default: 'שגיאה'
        },
        message: {
            type: String,
            default: ''
        }
    }
}
</script>
