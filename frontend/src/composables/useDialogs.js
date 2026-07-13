import { reactive } from 'vue'

// App-level singleton for blocking dialogs (CR#5). One dialog at a time.
// A single <DialogHost> (mounted in App.vue) renders the current slot and
// resolves the pending promise. Import the named functions directly in
// Options-API components, or call useDialogs() in setup().

const dialog = reactive({
  open: false,
  kind: 'alert', // 'alert' | 'confirm'
  title: '',
  message: '',
  details: '',
  // alert: 'error' | 'warning' | 'info'  ·  confirm: 'yellow' | 'emerald' | 'amber' | 'red'
  variant: 'info',
  confirmText: 'אשר',
  cancelText: 'ביטול',
})

let resolver = null

// Resolve the currently-open dialog (if any) as a dismissal, then clear it.
function settle(value) {
  const r = resolver
  resolver = null
  dialog.open = false
  if (r) r(value)
}

function open(next) {
  // A new request while one is open dismisses the previous one first.
  if (resolver) settle(dialog.kind === 'confirm' ? false : undefined)
  return new Promise((resolve) => {
    resolver = resolve
    Object.assign(dialog, next, { open: true })
  })
}

// Blocking acknowledge dialog. Resolves (void) when acknowledged.
function requestAlert({ title = 'שים לב', message = '', details = '', variant = 'info' } = {}) {
  return open({
    kind: 'alert', title, message, details, variant,
    confirmText: 'הבנתי', cancelText: '',
  })
}

// Blocking confirm dialog. Resolves true (confirm) / false (cancel / dismiss).
function requestConfirm({
  title = 'אישור פעולה', message = '', details = '',
  variant = 'yellow', confirmText = 'אשר', cancelText = 'ביטול',
} = {}) {
  return open({ kind: 'confirm', title, message, details, variant, confirmText, cancelText })
}

// Called by <DialogHost> only.
function resolveAlert() { settle(undefined) }
function resolveConfirm(ok) { settle(ok) }

export function useDialogs() {
  return { requestAlert, requestConfirm }
}

export { dialog, requestAlert, requestConfirm, resolveAlert, resolveConfirm }
