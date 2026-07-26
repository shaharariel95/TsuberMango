---
name: local-dev
description: Use when running TsuberMango locally - starting the dev servers, or doing an end-to-end test against the Firebase auth/firestore emulators with the seeded centers/test tenant. Covers what the emulator stack does and does not cover.
---

# Running TsuberMango Locally

## Plain dev servers (against production Firebase)

```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend (port 5173)
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3000`, so no CORS issues in dev.

Note this talks to the **real** Firebase project and the real `centers/tsuberi` data. For anything
that writes, prefer the emulator stack below.

## Full E2E against the emulators

```bash
cd backend && npm run local:test
```

One command spins up the whole local stack:

1. Firebase **auth + firestore emulators** (`localhost:9099` / `8080`)
2. Seeds `centers/test` via `scripts/seedTestCenter.js` (config, one admin user, one fake farmer + record)
3. Backend with `CENTER_ID=test`, pointed at the emulators
4. Frontend with `VITE_USE_EMULATORS=true`

Sign in through the auth-emulator popup with the seeded admin email. Ctrl-C tears the whole stack
down.

### Requirements and limits

- Requires the local (gitignored) `frontend/firebase.json` emulators block. If `local:test` fails at
  emulator start, that block is the first thing to check.
- **Emulator data is not persisted between runs** — every run starts from the seed.
- **Shipping-label creation still calls the real Google Sheets API** (task 20), so that one flow
  will not complete under the emulators. Everything else does.

### Seeding a test center manually

```bash
node scripts/seedTestCenter.js <admin-email>
```

Idempotent — safe to re-run.
