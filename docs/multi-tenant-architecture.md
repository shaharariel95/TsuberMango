# Multi-Tenant Architecture Plan

> **STATUS (Jul 2026): ADOPTED WITH AMENDMENTS — `redesign-plan.html` is canonical.**
> The Firestore-over-Postgres decision went this doc's way (see the DB decision box in
> redesign-plan.html, P3 section). This doc's data model and phases are absorbed into
> tasks 6, 15, 16, 19, 20 there. Where this doc and the plan disagree, **the plan wins**.
> Known amendments:
>
> 1. **Login flow is superseded** — the passport-session `centerId` flow below dies with
>    task 23 (Firebase Auth migration). Center resolution moves to Firebase Auth custom
>    claims, which also makes per-center Firestore security rules enforceable.
> 2. **Reserved seams added** — the records model gains `buyers` as an entity, reserved
>    money fields (`price`, `grade`, `amount`), `record_types`, `documents`, `periods`,
>    and `counters` (transactional certificate numbering). See the plan's Firestore tree.
> 3. **Labels leave Sheets too** — this doc keeps `SHIPPING_LABELS_ID_*`; the plan's
>    task 20 retires label spreadsheets entirely (dynamic docs + GCS + label log).
> 4. **`users.json` migration already happened** (Firestore `users` collection, Sprint 1);
>    Phase 1 items referencing it are partially done.

## Context

TsuberMango currently serves one sorting center (Tsuberi) with a fixed set of farmers.
This document covers the plan to scale to multiple sorting centers — each with its own
farmers, users, and login — while staying on a single codebase and within the GCP free tier.

---

## Goal

- Each sorting center gets its own subdomain: `tsuberi.com`, `center2.tsuberi.com`, `center3.tsuberi.com`
- Different users, different farmers, different configs per center
- One backend (Cloud Run), one Firestore, one deployed codebase
- Target scale: 3 centers × ~5 farmers = 15 farmers total → remains free tier

---

## Firestore Data Model

Replace Google Sheets as primary DB. All data namespaced under `centers/{centerId}`.

```
centers/
  {centerId}/                          ← e.g. "tsuberi", "center2"

    config (document)
      kinds:          string[]
      sizes:          string[]
      destinations:   string[]
      farmerConfigs:  { [farmerName]: { ... } }

    users/ (subcollection)
      {email} (document)
        role: "admin" | "user"

    farmer_events/ (subcollection)      ← real-time delta (overwritten on each write)
      {farmerName} (document)
        type:      string
        pallet?:   object
        pallets?:  object[]
        updatedBy: string
        timestamp: string

    farmers/ (subcollection)
      {farmerName} (document)
        name:                      string
        shippingLabelsSpreadsheetId: string   ← still needed for label PDFs

        records/ (subcollection)
          {recordId} (document)
            id:           string
            shipmentDate: string
            cardId:       string
            harvestDate:  string
            palletNumber: number
            kind:         string
            size:         string
            boxes:        number
            weight:       number | null
            destination:  string
            sent:         boolean
            gidon:        boolean
            mark:         boolean
            editedBy:     string
            editedAt:     string (ISO)

        audit/ (subcollection)
          {auditId} (document)
            recordId:     string
            palletNumber: number
            action:       "קליטה" | "עדכון"
            editedBy:     string
            editedAt:     string (ISO)
```

### Why this structure

- One `get centers/{centerId}/farmers/{farmerName}/records` query replaces a full Sheets read
- `farmer_events` stays a single overwritten document per farmer (same pattern as today)
- Audit logs become a Firestore subcollection instead of a companion Sheet
- `config` and `users` are already Firestore — just move them under the center namespace

### Free Tier Impact

| Metric | Free limit | Estimated usage (3 centers × 5 farmers) |
|---|---|---|
| Storage | 1 GB | ~1,500 docs × ~1 KB = well under 1 MB |
| Reads / day | 50,000 | A few hundred per active session |
| Writes / day | 20,000 | Create/update pallets during working hours |
| Deletes / day | 20,000 | Rarely used |

Comfortably free at this scale.

---

## Login Flow Change

### Current flow

```
user → /api/auth/google → Google OAuth → callback
     → check users.json for email
     → session = { email, role }
```

### New flow

```
user on center2.tsuberi.com → /api/auth/google
                             → backend reads Host header → centerId = "center2"
                             → stores centerId in session before OAuth redirect
                             → Google OAuth
                             → callback
                             → check centers/{centerId}/users/{email} in Firestore
                             → session = { email, role, centerId }
```

### Key change: centerId resolution

The backend resolves `centerId` from the `Host` header on every request:

```js
// middleware/resolveCenterId.js
function resolveCenterId(req, res, next) {
  const host = req.hostname; // e.g. "center2.tsuberi.com"
  const sub = host.split(".")[0];
  // "tsuberi.tsuberi.com" and "tsuberi.com" both map to "tsuberi"
  req.centerId = sub === "tsuberi" || sub === "www" ? "tsuberi" : sub;
  next();
}
```

Applied before auth routes so the OAuth initiation captures it:

```js
// On OAuth start — save centerId in session before redirect
app.get("/api/auth/google", (req, res, next) => {
  req.session.pendingCenterId = req.centerId;
  next();
}, passport.authenticate("google", { scope: ["profile", "email"] }));

// On OAuth callback — commit centerId to session
app.get("/api/auth/google/callback", passport.authenticate(...), (req, res) => {
  req.session.centerId = req.session.pendingCenterId;
  // ... redirect to frontend
});
```

### ensureAuthenticated update

```js
function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  if (!req.session.centerId) return res.status(403).json({ error: "No center in session" });
  next();
}
```

All controllers then use `req.session.centerId` to namespace every Firestore read/write.

---

## Frontend Changes

### centerId from /api/auth/me

`/api/auth/me` adds `centerId` to its response:

```json
{ "email": "user@example.com", "role": "admin", "centerId": "tsuberi" }
```

The frontend stores it alongside `user` and passes it wherever needed (e.g. Firestore
`onSnapshot` paths in `useFarmerEvents`).

### Firestore paths in composables

```js
// Before
doc(db, "farmer_events", farmerName)

// After
doc(db, "centers", centerId, "farmer_events", farmerName)
```

### Config subscription in App.vue

```js
// Before
onSnapshot(doc(db, "config", "global"), ...)

// After
onSnapshot(doc(db, "centers", centerId, "config"), ...)
```

---

## Subdomain Routing (Firebase Hosting)

All three subdomains serve the **same built SPA**. Firebase Hosting supports multiple
custom domains pointing to the same hosting site.

```
firebase.json  →  no change needed (single SPA rewrite stays)

Firebase Console → Hosting → Add custom domain:
  center2.tsuberi.com  → same hosting site
  center3.tsuberi.com  → same hosting site
```

DNS: add CNAME records for each subdomain pointing to Firebase Hosting.

The frontend JS bundle is identical for all centers. The center identity comes from
the session (`/api/auth/me`), not from the URL.

---

## Migration Path

This is a breaking change to the data layer. Suggested phased approach:

### Phase 1 — Add center-awareness to auth (no data migration)

- Add `centerId` to session
- Add `resolveCenterId` middleware
- Move `users.json` → `centers/tsuberi/users/` in Firestore
- Move `config/global` → `centers/tsuberi/config` in Firestore
- Move `farmer_events/{farmer}` → `centers/tsuberi/farmer_events/{farmer}`
- Frontend reads `centerId` from `/api/auth/me` and updates Firestore paths
- **Sheets remain the pallet DB** — no pallet data migrated yet

### Phase 2 — Migrate pallet data to Firestore

- Write new service: `firestorePalletService.js` mirroring the interface of `googleSheetsService.js`
- Migrate existing pallet rows for each farmer into Firestore
- Swap controller imports from Sheets service to Firestore service
- Keep Sheets as read-only backup during cutover window
- Update `useFarmerEvents` Firestore paths to new namespace

### Phase 3 — Onboard new centers

- Create `centers/{centerId}` documents in Firestore for each new center
- Add users via the existing admin user-management endpoints (now center-scoped)
- Add custom domains in Firebase Hosting console
- Add DNS CNAME records

### Phase 4 — Decommission Sheets

- Remove `googleSheetsService.js` and all Sheets env vars
- Remove `SPREADSHEET_ID` (keep `SHIPPING_LABELS_ID_*` if label generation still uses Sheets)

---

## What Does NOT Change

- Cloud Run: single service, still scales to zero
- Firebase Hosting: single hosting site, multiple custom domains
- pdfmake label generation (still reads from Sheets label spreadsheets per farmer)
- Real-time update pattern (`farmer_events` overwrite, `onSnapshot` in composable)
- Auth provider: Google OAuth (same credentials, same callback URL structure)
- Tailwind / Vue 3 / Express stack
