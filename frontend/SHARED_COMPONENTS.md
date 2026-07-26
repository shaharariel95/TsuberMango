# Shared Components — Spec

All shared components live in `frontend/src/components/shared/`.

---

## 1. `LoadingState.vue`

Full-page centered spinner with a message.

### Props

| Prop | Type | Default |
|------|------|---------|
| `message` | String | `"טוען נתונים..."` |

### Usage

```vue
<LoadingState />
<LoadingState message="טוען נתונים..." />
```

### Replaces in

| File | Condition | Retry fn |
|------|-----------|----------|
| `Dashboard.vue` | `v-if="isLoading"` | — |
| `Weight.vue` | `v-if="isLoading"` | — |
| `Destination.vue` | `v-if="isLoading"` | — |
| `SentPallets.vue` | `v-if="isLoading"` | — |
| `sentPalletsForMark.vue` | `v-if="isLoading"` | — |
| `DestinationsSummary.vue` | `v-if="isLoading"` (inside content) | — |

---

## 2. `ErrorState.vue`

Full-page red card showing an error message with a retry button.

### Props

| Prop | Type | Default |
|------|------|---------|
| `title` | String | `"שגיאה"` |
| `message` | String | `""` |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `retry` | — | Emitted when the retry button is clicked |

### Usage

```vue
<ErrorState
  title="שגיאה בטעינת נתונים"
  :message="fetchError"
  @retry="fetchAllFarmers"
/>
```

### Replaces in

| File | Condition | Title used | Retry fn |
|------|-----------|-----------|---------|
| `Dashboard.vue` | `v-else-if="fetchError"` | `"שגיאה בטעינת נתונים"` | `fetchAllFarmers` |
| `Weight.vue` | `v-else-if="showError"` | `"שגיאה:"` | `getPallets(farmerName)` |
| `SentPallets.vue` | `v-else-if="showError"` | `"שגיאה:"` | `getPallets(farmerName)` |
| `sentPalletsForMark.vue` | `v-else-if="showError"` | `"שגיאה:"` | `getPallets(farmerName)` |

---

## 3. `EmptyState.vue`

Full-page empty placeholder with an inbox icon and message.

### Props

| Prop | Type | Default |
|------|------|---------|
| `message` | String | `"אין נתונים להצגה"` |

### Usage

```vue
<EmptyState />
<EmptyState message="אין נתונים להצגה" />
```

### Replaces in

| File | Condition |
|------|-----------|
| `Weight.vue` | `v-else-if="message.length === 0"` |
| `SentPallets.vue` | `v-else-if="pallets.length === 0"` |
| `sentPalletsForMark.vue` | `v-else-if="pallets.length === 0"` |
| `DestinationsSummary.vue` | `v-else-if="!isLoading"` (empty table block) |

---

## 4. `ConfirmModal.vue`

Animated overlay modal for confirmation dialogs with a colored icon, title, slot for message body, and two action buttons.

### Props

| Prop | Type | Default | Values |
|------|------|---------|--------|
| `show` | Boolean | `false` | — |
| `title` | String | `"אישור פעולה"` | — |
| `iconVariant` | String | `"yellow"` | `"yellow"`, `"emerald"`, `"amber"`, `"red"` |
| `confirmText` | String | `"אשר"` | — |
| `cancelText` | String | `"ביטול"` | — |
| `confirmVariant` | String | `"yellow"` | `"yellow"`, `"emerald"`, `"amber"`, `"red"` |

### Icon colors per `iconVariant`

| Variant | Background | Icon color |
|---------|-----------|-----------|
| `yellow` | `bg-yellow-100` | `text-yellow-600` |
| `emerald` | `bg-emerald-100` | `text-emerald-600` |
| `amber` | `bg-amber-100` | `text-amber-600` |
| `red` | `bg-red-100` | `text-red-600` |

### Confirm button colors per `confirmVariant`

| Variant | Classes |
|---------|---------|
| `yellow` | `bg-yellow-500 hover:bg-yellow-600` |
| `emerald` | `bg-emerald-500 hover:bg-emerald-600` |
| `amber` | `bg-amber-500 hover:bg-amber-600` |
| `red` | `bg-red-500 hover:bg-red-600` |

### Slots

| Slot | Description |
|------|-------------|
| default | Message body — supports any HTML/Vue template content |

### Events

| Event | Description |
|-------|-------------|
| `confirm` | Emitted when confirm button is clicked |
| `cancel` | Emitted when cancel button or backdrop is clicked |

### Usage in `PalletInput.vue`

```vue
<ConfirmModal
  :show="duplicateWarning"
  title="משטח כפול"
  icon-variant="yellow"
  confirm-text="כן המשך"
  cancel-text="לא תקן"
  confirm-variant="yellow"
  @confirm="proceedDespiteDuplicate"
  @cancel="cancelDuplicate"
>
  משטח מספר <strong>{{ formData.palletNumber }}</strong> כבר קיים עבור מגדל זה.
  האם להמשיך בכל זאת?
</ConfirmModal>
```

### Usage in `PalletTable.vue`

```vue
<ConfirmModal
  :show="confirmModal.show"
  title="אישור פעולה"
  :icon-variant="confirmModal.toSend ? 'emerald' : 'amber'"
  confirm-text="אשר"
  cancel-text="ביטול"
  :confirm-variant="confirmModal.toSend ? 'emerald' : 'amber'"
  @confirm="() => { confirmModal.show = false; updateToDestinations(confirmModal.toSend); }"
  @cancel="confirmModal.show = false"
>
  <template v-if="confirmModal.toSend">
    האם להעביר <strong>{{ confirmModal.count }} משטחים</strong> למשלוח?
  </template>
  <template v-else>
    האם להוריד <strong>{{ confirmModal.count }} משטחים</strong> מהמשלוח?
  </template>
  <p v-if="confirmModal.destinations.length" class="text-slate-400 text-xs mt-1">
    יעדים: {{ confirmModal.destinations.join(', ') }}
  </p>
</ConfirmModal>
```

---

## 5. `SpinnerButton.vue`

A button that replaces its content with a spinner while `loading` is true. All other attributes (`class`, `@click`, `disabled`, `type`) pass straight through to the `<button>` element.

### Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `loading` | Boolean | `false` | Shows spinner and disables the button |
| `loadingLabel` | String | `""` | Text shown next to spinner (omit for icon-only loading state) |
| `inverted` | Boolean | `true` | `true` → white spinner (for use on dark/primary buttons); `false` → mango spinner (for ghost buttons) |

The `disabled` attribute from the parent is forwarded and OR-ed with `loading`.

### Usage

```vue
<!-- Text-only button, changes label while loading -->
<SpinnerButton
  :loading="isWorking"
  loading-label="שומר..."
  class="btn-primary text-sm min-h-[44px]"
  @click="save"
>
  + הוסף
</SpinnerButton>

<!-- Button with icon, icon disappears while loading -->
<SpinnerButton
  :loading="isLoading"
  class="btn-primary flex items-center gap-2"
  @click="exportToExcel"
  :disabled="noData"
>
  <svg class="w-4 h-4" ...>...</svg>
  ייצוא לאקסל
</SpinnerButton>

<!-- Ghost button — uses mango (non-inverted) spinner -->
<SpinnerButton
  :loading="isCreatingLabel"
  :inverted="false"
  class="btn-ghost text-sm border border-slate-200 min-h-[36px] px-3"
  @click="requestConfirm(false)"
  :disabled="selectedPallets.length === 0"
>
  הורד ממשלוח
</SpinnerButton>
```

### Replaces in

| File | Button | Loading condition |
|------|--------|------------------|
| `Settings.vue` | הוסף חקלאי | `isWorking` |
| `Settings.vue` | הוסף משתמש | `isWorkingUsers` |
| `Settings.vue` | שמור את כל השינויים | `isWorking` |
| `Settings.vue` | גבה עכשיו | `isBackingUp` |
| `Settings.vue` | אשר מחיקה סופית | `isWorking` |
| `PalletInput.vue` | הוסף (submit) | `isSubmitting` |
| `DestinationsSummary.vue` | ייצוא לאקסל | `isLoading` |
| `PalletTable.vue` | צור תעודת משלוח | `isCreatingLabel` |
| `PalletTable.vue` | הפק מדבקה | `isCreatingLabel` |
| `PalletTable.vue` | העבר למשלוח | `isCreatingLabel` |
| `PalletTable.vue` | הורד ממשלוח | `isCreatingLabel` |

> **Not extracted:** The save/cancel row in `PalletTable` editing mode (`שמור`/spinner) swaps between two differently-colored buttons (emerald ↔ mango bg), not a single button toggling a spinner — leave as-is.

---

## 6. `ErrorToast.vue`

Fixed-position animated error toast at the bottom of the screen with a dismiss button. Wraps the full `<Transition>` + `.toast-error` block.

### Props

| Prop | Type | Default |
|------|------|---------|
| `error` | String \| null | `null` |

### Events

| Event | Description |
|-------|-------------|
| `dismiss` | Emitted when the × button is clicked |

### Usage

```vue
<ErrorToast :error="error" @dismiss="error = null" />
```

### Replaces in

| File | Condition |
|------|-----------|
| `App.vue` | `v-if="showError"` (same as `!!error`) |
| `PalletTable.vue` | `v-if="error"` |

---

## Not extracted

- **Settings delete-farmer modal** — unique layout (red header, checkboxes). Left in-place.
- **Toast system** — global `NotificationList` + `.toast-error` CSS class already shared. In-page toast in `PalletTable` and `App.vue` are small and context-specific.
- **Chip/toggle group** — `.chip` and `.chip-active` CSS classes already centralise the styling.
- **Stat cards** — used only in `Dashboard.vue`.
- **Page header** — each page header has unique action buttons that make a generic component add more complexity than it saves.
