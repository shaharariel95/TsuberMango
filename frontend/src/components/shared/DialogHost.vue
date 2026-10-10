<template>
    <!-- Blocking alert -->
    <AlertModal
        :show="dialog.open && dialog.kind === 'alert'"
        :title="dialog.title"
        :message="dialog.message"
        :details="dialog.details"
        :variant="dialog.variant"
        :button-text="dialog.confirmText"
        @close="resolveAlert"
    />

    <!-- Blocking confirm -->
    <ConfirmModal
        :show="dialog.open && dialog.kind === 'confirm'"
        :title="dialog.title"
        :icon-variant="dialog.variant"
        :confirm-variant="dialog.variant"
        :confirm-text="dialog.confirmText"
        :cancel-text="dialog.cancelText"
        @confirm="() => resolveConfirm(true)"
        @cancel="() => resolveConfirm(false)"
    >
        {{ dialog.message }}
        <p v-if="dialog.details" class="text-slate-400 text-xs mt-1">{{ dialog.details }}</p>
    </ConfirmModal>
</template>

<script>
import { onMounted, onBeforeUnmount } from 'vue';
import AlertModal from './AlertModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import { dialog, resolveAlert, resolveConfirm } from '../../composables/useDialogs';

export default {
    components: { AlertModal, ConfirmModal },
    setup() {
        // Escape dismisses whichever dialog is open (alert → ack, confirm → cancel).
        const onKeydown = (e) => {
            if (e.key !== 'Escape' || !dialog.open) return;
            if (dialog.kind === 'confirm') resolveConfirm(false);
            else resolveAlert();
        };
        onMounted(() => window.addEventListener('keydown', onKeydown));
        onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

        return { dialog, resolveAlert, resolveConfirm };
    }
}
</script>
