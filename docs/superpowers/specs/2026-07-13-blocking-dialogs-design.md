# Task 1 (CR#5) — Centered "problem" blocking dialogs

**Date:** 2026-07-13
**Task:** redesign-plan.html task 1 — `חלונות קופצים באמצע המסך שנראה אם יש בעיה`
**Scope files:** `frontend/src/composables/useDialogs.js` (new), `frontend/src/components/shared/AlertModal.vue` (new), `frontend/src/components/shared/DialogHost.vue` (new), `frontend/src/App.vue`, `frontend/src/components/PalletTable.vue`, `frontend/src/components/PalletInput.vue`.

## Problem

Errors and blocking problems today surface only as corner toasts (`NotificationList`) or a
5-second auto-dismissing `ErrorToast`, both easy to miss. The customer wants a center-screen,
backdrop-blur modal for problems that must be acknowledged. A confirm modal already exists but is
welded into `PalletTable.vue` (component-local `confirmModal` state + inline `<ConfirmModal>`), so
no other page can raise a blocking dialog.

## Design

### New shared mechanism (promise-based singleton composable)

Industry-standard pattern (PrimeVue `useConfirm`, Element Plus `ElMessageBox`). Chosen over
provide/inject (adds a tree dependency, awkward in Options-API components) and over per-component
modals (re-scatters the wiring this task consolidates).

**`useDialogs.js`** — module-level singleton, one reactive `dialog` slot, two functions returning
Promises:

```js
const { requestAlert, requestConfirm } = useDialogs()

// resolves (void) when acknowledged — button / backdrop / Escape
await requestAlert({ title?, message, details?, variant })
//   variant: 'error' | 'warning' | 'info'  (default 'info')

// resolves true (confirm) / false (cancel / backdrop / Escape)
const ok = await requestConfirm({ title?, message, details?, variant?, confirmText?, cancelText? })
```

- **Single unified slot** `{ open, kind: 'alert'|'confirm', title, message, details, variant, confirmText, cancelText, resolve }`.
  One dialog at a time; a new request while one is open resolves the previous as dismissed
  (alert → void, confirm → false). Sufficient for this app's single-action flows.
- **Body content:** `message` (main line) + optional `details` (dimmer second line, e.g. the
  destinations list). No slots/HTML — covers every current call site, keeps call sites testable,
  avoids XSS if a message ever comes from data.

**`AlertModal.vue`** — new, styled as a clone of `ConfirmModal.vue` (center screen,
`bg-black/40 backdrop-blur-sm`, rounded RTL card) so the two read as one system. Single acknowledge
button, default text `הבנתי`. Variant → icon/color reuses ConfirmModal's existing map:
`error`→red, `warning`→amber, `info`→yellow. Emits `close`.

**`ConfirmModal.vue`** — reused unchanged. Already exposes `title` / `iconVariant` /
`confirmText` / `cancelText` / `confirmVariant` props + a body slot. `DialogHost` renders
`message`/`details` into that slot.

**`DialogHost.vue`** — new, mounted once in `App.vue` (alongside the existing `NotificationList`
and global `ErrorToast`). Reads the singleton slot and renders `AlertModal` or `ConfirmModal`
accordingly, mapping `variant`→`iconVariant`/`confirmVariant`, and resolves the pending promise on
the modal's event. Backdrop-click and `Escape` both dismiss.

### Conversions (all Hebrew UI copy preserved/added)

1. **Bulk-destination confirm** (`PalletTable.vue`): remove inline `<ConfirmModal>`, the
   `confirmModal` reactive state, and the local `requestConfirm` method. Replace with
   `await requestConfirm({ message: 'האם להעביר N משטחים למשלוח?' / 'האם להוריד…', details: 'יעדים: …', variant: toSend ? 'emerald' : 'amber' })`
   gating `updateToDestinations(toSend)`. `requestConfirm`'s `variant` accepts ConfirmModal's own
   tokens (`yellow|emerald|amber|red`, default `yellow`) and is passed straight through to both
   `iconVariant` and `confirmVariant`, preserving the existing emerald (send) / amber (return) colors.
2. **Label-creation failure** (`sendSelectedPallets` catch, ~line 755): replace the
   `this.error = err.message` + 5s timeout with
   `await requestAlert({ title: 'שגיאה', message: err.message, variant: 'error' })`; still clear
   `selectedPallets` / `isCreatingLabel` afterward.
3. **Validation blockers** (`validatePallet` `שדות חסרים`, ~line 706) and the mixed-destination
   hard-fail: route through `requestAlert({ variant: 'warning' })` before the certificate is
   blocked, instead of throw→ErrorToast.
4. **PalletInput submit error**: the server-error path (translated Hebrew message) →
   `await requestAlert({ title: 'שגיאה', message, variant: 'error' })`.

Existing corner toasts and success feedback stay untouched — this task only adds the blocking
surface.

## Confirm/alert button-variant note

`ConfirmModal` variant tokens are `yellow|emerald|amber|red`. `requestConfirm.variant` uses those
same tokens directly (default `yellow`). `requestAlert.variant` uses `error|warning|info`, which
`DialogHost` translates to `AlertModal`'s colors: `error`→red, `warning`→amber, `info`→yellow.

## Testing

No Vitest harness exists yet (task 22 bootstraps it) and task 1 is not on the must-test list. The
logic is thin promise-resolution wiring. **Verification is live:** run the app and trigger each of
the four surfaces, confirming a centered blocking modal appears and blocks until acknowledged.
Automated coverage for `useDialogs` is deferred to task 22.

## Out of scope

- No changes to `NotificationList` / `useNotification` / success toasts.
- No backend changes.
- PalletInput's broader validation rework belongs to task 2, not here.
