<template>
    <div class="flex flex-col items-center justify-center py-20 gap-3">
        <span class="loading-spinner !w-10 !h-10 !border-[3px]"></span>
        <span class="text-slate-400 text-sm font-medium">{{ message }}</span>
    </div>
</template>

<script>
export default {
    props: {
        message: {
            type: String,
            default: 'טוען נתונים...'
        }
    }
}
</script>
