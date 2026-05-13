<template>
    <button v-bind="$attrs" :disabled="loading || !!$attrs.disabled">
        <template v-if="loading">
            <span :class="['loading-spinner !w-4 !h-4', inverted ? '!border-white/30 !border-t-white' : '']"></span>
            <span v-if="loadingLabel">{{ loadingLabel }}</span>
        </template>
        <slot v-else />
    </button>
</template>

<script>
export default {
    inheritAttrs: false,
    props: {
        loading: {
            type: Boolean,
            default: false
        },
        loadingLabel: {
            type: String,
            default: ''
        },
        inverted: {
            type: Boolean,
            default: true
        }
    }
}
</script>
