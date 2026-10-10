<template>
    <Transition enter-active-class="transition-all duration-200" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="show"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            @click.self="$emit('close')">
            <div class="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full rtl text-right animate-fade-in">
                <div class="flex items-start gap-3 mb-5">
                    <div :class="['w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', iconBg]">
                        <svg class="w-5 h-5" :class="iconColor" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path v-if="variant === 'info'" stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-slate-800 text-base mb-1">{{ title }}</h3>
                        <div class="text-slate-600 text-sm leading-relaxed">
                            {{ message }}
                            <p v-if="details" class="text-slate-400 text-xs mt-1">{{ details }}</p>
                        </div>
                    </div>
                </div>
                <div class="flex justify-start">
                    <button type="button" @click="$emit('close')"
                        :class="['px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors', buttonBg]">
                        {{ buttonText }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script>
export default {
    emits: ['close'],
    props: {
        show: { type: Boolean, default: false },
        title: { type: String, default: 'שים לב' },
        message: { type: String, default: '' },
        details: { type: String, default: '' },
        variant: { type: String, default: 'info' }, // error | warning | info
        buttonText: { type: String, default: 'הבנתי' }
    },
    computed: {
        iconBg() {
            return {
                error: 'bg-red-100',
                warning: 'bg-amber-100',
                info: 'bg-yellow-100'
            }[this.variant] || 'bg-yellow-100';
        },
        iconColor() {
            return {
                error: 'text-red-600',
                warning: 'text-amber-600',
                info: 'text-yellow-600'
            }[this.variant] || 'text-yellow-600';
        },
        buttonBg() {
            return {
                error: 'bg-red-500 hover:bg-red-600',
                warning: 'bg-amber-500 hover:bg-amber-600',
                info: 'bg-yellow-500 hover:bg-yellow-600'
            }[this.variant] || 'bg-yellow-500 hover:bg-yellow-600';
        }
    }
}
</script>
