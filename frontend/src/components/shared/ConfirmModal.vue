<template>
    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="show"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            @click.self="$emit('cancel')">
            <div class="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full rtl text-right animate-fade-in">
                <div class="flex items-start gap-3 mb-5">
                    <div :class="['w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', iconBg]">
                        <svg class="w-5 h-5" :class="iconColor" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-slate-800 text-base mb-1">{{ title }}</h3>
                        <div class="text-slate-600 text-sm leading-relaxed">
                            <slot />
                        </div>
                    </div>
                </div>
                <div class="flex gap-2 justify-start">
                    <button type="button" @click="$emit('confirm')"
                        :class="['px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors', confirmBg]">
                        {{ confirmText }}
                    </button>
                    <button type="button" @click="$emit('cancel')"
                        class="px-5 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                        {{ cancelText }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script>
export default {
    emits: ['confirm', 'cancel'],
    props: {
        show: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            default: 'אישור פעולה'
        },
        iconVariant: {
            type: String,
            default: 'yellow'
        },
        confirmText: {
            type: String,
            default: 'אשר'
        },
        cancelText: {
            type: String,
            default: 'ביטול'
        },
        confirmVariant: {
            type: String,
            default: 'yellow'
        }
    },
    computed: {
        iconBg() {
            return {
                yellow: 'bg-yellow-100',
                emerald: 'bg-emerald-100',
                amber: 'bg-amber-100',
                red: 'bg-red-100'
            }[this.iconVariant] || 'bg-yellow-100';
        },
        iconColor() {
            return {
                yellow: 'text-yellow-600',
                emerald: 'text-emerald-600',
                amber: 'text-amber-600',
                red: 'text-red-600'
            }[this.iconVariant] || 'text-yellow-600';
        },
        confirmBg() {
            return {
                yellow: 'bg-yellow-500 hover:bg-yellow-600',
                emerald: 'bg-emerald-500 hover:bg-emerald-600',
                amber: 'bg-amber-500 hover:bg-amber-600',
                red: 'bg-red-500 hover:bg-red-600'
            }[this.confirmVariant] || 'bg-yellow-500 hover:bg-yellow-600';
        }
    }
}
</script>
