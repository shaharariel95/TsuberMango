---
name: local-dev
description: Use when running or testing TsuberMango locally - the backend test suite (npm test), the Playwright browser E2E (npm run e2e), starting the dev servers, or manually exercising the app against the Firebase auth/firestore emulators with the seeded centers/test tenant. Covers what each layer does and does not cover.
---

# Running and Testing TsuberMango Locally

## Verify a change — run both before calling anything done

```bash
cd backend && npm test        # ~10s: 107 Vitest tests on the auth + Firestore emulators
cd frontend && npm test       # 18 Vitest unit tests (certificate PDF builder, sheet names)
cd frontend && npm run e2e    # 18 Playwright runs (9 specs x 2 projects), real UI on desktop + tablet viewports
```

| Layer | File(s) | Covers |
|---|---|---|
| Repository | `backend/tests/FirestoreRepository.test.js` | Firestore reads/writes/bulk/audit |
| Auth middleware | `backend/tests/auth.middleware.test.js` | token verify, center gate, admin gate, claim sync |
| Firestore rules | `backend/tests/firestore.rules.test.js` | client read gating |
| **HTTP API** | `backend/tests/api.test.js` | every `/api` route via supertest with **real auth-emulator ID tokens**: auth gates, intake → weigh → mark → certificate stamp → reset, audit + realtime events, admin users/config, Sheets isolation |
| Certificates | `backend/tests/certificateCore.test.js`, `certificates.repo.test.js`, `certificates.api.test.js` | pure chunking/validation/`planIssue`; atomic issue/reprint/remove-pallet against the Firestore emulator; the `/api/certificates` + admin profile endpoints with real tokens |
| Frontend unit | `frontend/tests/*.test.js` (`cd frontend && npm test`) | `certificatePdf.js` (bidi, layout, row guard), `sheetName.js` |
| **Browser E2E** | `frontend/e2e/*.spec.js` | full season flow through the UI; realtime update between two clients; `certificates.spec.js` covers issue → תעודות screen → reprint → remove pallet → Settings profile |

Adding an endpoint or changing a write path → add a case to `api.test.js`. Changing a user flow →
extend `frontend/e2e/`. Table cells carry `data-col="<column key>"` for stable selectors.

**E2E notes:**
- Uses the locally installed Chrome (`channel: 'chrome'`), no browser download.
- Starts the emulator stack itself, or reuses one already serving `:5173`.
- Signs in through the auth-emulator popup as `e2e-admin@test.local` (seeded).
- Realtime tests need **two different users**. Clients ignore events whose `updatedBy` is
  their own email (echo suppression), so the second client is `e2e-admin-2@test.local`.
- Two projects: `desktop` (1600×900) and `tablet` (1280×800, touch; the packhouse Samsung Galaxy Tab). At ≤1366px the app uses the drawer layout, so navigate with `navTo()` from `e2e/helpers.js`, never by clicking sidebar links directly.
- `webServer` waits on the backend (`:3000/api/auth/me` → 401), not Vite, so the first sign-in never races a booting backend.

**Windows leftover processes:** `firebase emulators:exec` leaves the Firestore java process
running. `scripts/freePorts.js` runs before/after `npm test` and before `local:test` and kills
java/node listeners on the emulator ports (plus 3000/5173 with `--dev`). If anything still reports
"port taken": `node backend/scripts/freePorts.js --dev`.

## Google Sheets is blocked under the emulators

`utils/sheetsGuard.js` makes every Google Sheets call throw while `FIRESTORE_EMULATOR_HOST` or
`FIREBASE_AUTH_EMULATOR_HOST` is set. The Sheets service holds the **production** farmer-sheet
ids, so without this a local action could touch a live customer file. Consequences:
- This now applies **only to the admin create-sheet / delete-sheet buttons**, which fail under the
  emulators with "Google Sheets access is disabled…". The E2E asserts exactly that.
- Shipping certificates are Firestore-only and work fully under the emulators.
- Override only deliberately: `ALLOW_REAL_SHEETS=true`.

## Manual click-through against the emulators

```bash
cd backend && npm run local:test
```

1. Firebase **auth + firestore emulators** (`localhost:9099` / `8080`, UI on `4000`)
2. Seeds `centers/test` via `scripts/seedTestCenter.js` (config, admin users, one fake farmer + record)
3. Backend with `CENTER_ID=test`, pointed at the emulators
4. Frontend with `VITE_USE_EMULATORS=true`

Sign in through the auth-emulator popup with a seeded admin email. Ctrl-C tears the stack down.

- Requires the local (gitignored) `frontend/firebase.json` emulators block. If `local:test` fails at
  emulator start, that block is the first thing to check.
- **Emulator data is not persisted between runs**. Every run starts from the seed.

Seed manually (idempotent): `node scripts/seedTestCenter.js <admin-email> [more-admin-emails...]`

## Plain dev servers (against production Firebase)

```bash
cd backend && npm run dev     # port 3000
cd frontend && npm run dev    # port 5173, proxies /api/* to :3000
```

This talks to the **real** Firebase project and the real `centers/tsuberi` data. For anything that
writes, use the emulator stack.
