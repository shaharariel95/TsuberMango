# PWA — Requirements & Scope
> See [betterBacklog.md](betterBacklog.md) → H2 for business context and priority

---

## What We're Solving

Packing houses have spotty WiFi. When the connection drops mid-shift, workers lose in-progress form data and see confusing error messages. The app also can't be pinned to a phone home screen, so workers always need to open a browser and remember the URL.

---

## Scope

### 1. Installable App (Service Worker + Manifest)

- Add `vite-plugin-pwa` to the Vite config
- Web App Manifest: app name in Hebrew, mango icon, `display: standalone`, `dir: rtl`, `lang: he`
- Service worker caches the app shell (HTML, JS, CSS, fonts) so the UI loads even with no connection
- "הוסף למסך הבית" install prompt shown once after first successful login

**Result:** Workers open TsuberMango from their home screen like a native app, no browser chrome.

---

### 2. Offline Entry Queue (IndexedDB)

This is the core feature. When the device is offline:

- קליטה form submissions are saved locally to IndexedDB (via `idb` library)
- The form still clears and confirms success — the user sees "נשמר, יסונכרן בחיבור הבא"
- A badge in the header shows pending count: "3 ממתינים לסנכרון"
- When back online, the queue drains automatically — one POST per queued record, in order
- If a sync fails (server error, not network), the record stays in queue and the user gets a notification

**Out of scope for v1:** Offline reads (viewing existing records while offline). This requires caching the full dataset, which adds complexity and stale-data risk.

---

### 3. Conflict Detection on Sync

When a queued record syncs, the server should check:
- Is the pallet number already taken? (same mix-pallet rule applies — warn, don't block)
- Did a network error cause a partial write? (idempotency key on each queued record)

Each queued entry gets a client-generated UUID stored in the record. The backend rejects duplicate UUIDs within the same farmer + season to prevent double-posting on retry.

---

### 4. Sync Status UI

- Header indicator: grey (synced) / amber (pending) / red (sync failed)
- Tapping the indicator opens a "תור סנכרון" drawer listing queued records with their status
- Failed records show a "נסה שוב" button and the failure reason

---

### 5. Push Notifications (Stretch — v2)

- Web Push API via VAPID keys on the backend
- Notify worker when their queued records have successfully synced: "3 משטחים סונכרנו בהצלחה"
- Requires user permission prompt — ask only after the user has used offline mode at least once

---

## Tech Choices

| Concern | Choice | Why |
|---|---|---|
| Service worker | `vite-plugin-pwa` (Workbox) | Handles precaching automatically, integrates with Vite build |
| Local storage | `idb` (thin IndexedDB wrapper) | Simple API, no heavy dependency |
| Sync trigger | `navigator.onLine` + `online` event | Already being added for M6 offline indicator |
| Push (v2) | Web Push API + VAPID | No third-party service needed |

---

## Dependencies & Order

1. **M6 (offline indicator)** must ship first — it adds the `online`/`offline` event infrastructure the queue sync listens to
2. **H8 (mobile audit)** should come before or alongside — a PWA on a broken mobile layout is worse than no PWA
3. PWA itself is a separate sprint after both of the above

---

## What This Is NOT

- Not a full offline app — reading existing pallet data offline is out of scope for v1
- Not a React Native / Capacitor wrapper — this stays as a web app
- Not a replacement for fixing connectivity at the packing house (talk to the operator about WiFi)

---

## Estimated Effort

| Phase | Effort |
|---|---|
| Service worker + manifest (installable shell) | 1-2 days |
| IndexedDB offline entry queue | 2-3 days |
| Sync logic + conflict detection | 2 days |
| Sync status UI | 1 day |
| Testing on real devices (iOS Safari, Android Chrome) | 1-2 days |
| **Total** | **~7-10 days** |

iOS Safari has its own PWA quirks (no push notifications, limited storage). Test there explicitly.
