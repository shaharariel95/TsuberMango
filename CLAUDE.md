# TsuberMango — CLAUDE.md

## Project Overview

TsuberMango is a full-stack web application for managing mango pallet records, weights,
destinations, and shipping labels for farmers. The UI is in Hebrew, rendered right-to-left
(`lang="he" dir="rtl"`).

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 + Vite 5, Vue Router 4, Tailwind CSS 3, Axios |
| Backend | Node.js + Express 5 |
| Primary DB | Firebase Firestore — pallet records, audit, config, users, real-time events (all under `centers/{centerId}/…`) |
| Legacy DB | Google Sheets API — now only shipping-label spreadsheets + farmer-sheet provisioning |
| Auth | Firebase Auth (Google provider) — ID tokens; Firestore `users` collection for authorization |
| PDF | pdfmake · **Logging** winston |
| Hosting | Firebase Hosting (frontend), Google Cloud Run (backend) |

```
/
├── frontend/          # Vue 3 app
└── backend/           # Express server
```

---

## Where to Look

Read these when the task touches them — don't guess from memory.

| Need | Go to |
|---|---|
| File-by-file map, record fields, Firestore tree, env vars, caching | [docs/architecture.md](docs/architecture.md) |
| Routes, API endpoints, full auth flow, claim model | [docs/api-reference.md](docs/api-reference.md) |
| Real-time events, `useFarmerEvents`, per-view filters | [docs/realtime.md](docs/realtime.md) |
| Shared UI primitives | [frontend/SHARED_COMPONENTS.md](frontend/SHARED_COMPONENTS.md) |
| Scheduled backups | [backend/CLOUD_SCHEDULER.md](backend/CLOUD_SCHEDULER.md) |
| **Deploying anything** | invoke the `deploy` skill |
| **Running locally / emulator E2E** | invoke the `local-dev` skill |

---

## Core Invariants

These correct assumptions that would otherwise be wrong. Everything else is discoverable in the code.

- **Records live in Firestore, not Sheets** — at `centers/{centerId}/farmers/{farmer}/records/{autoId}`, always through the `RecordRepository`. Sheets is a cold archive plus live shipping-label provisioning.
- **Every Firestore path is tenant-namespaced** under `centers/{centerId}/`. There is no top-level app data except `backups`.
- **There is no records cache.** Reads go live to Firestore. The old per-farmer cache, request-coalescing, and append-lock are gone. The caches that remain in `googleSheetsService.js` serve only legacy Sheets paths.
- **Auth is Bearer ID tokens — no session, no cookie, no Passport.** An Axios interceptor attaches the token to every request; raw `fetch()` calls must use `getToken()` from `src/utils/auth.js`.
- **Role is never in the custom claim.** The only claim is `{centers: [...]}`, for tenant gating. Role is read live from Firestore on every check, so revoking admin takes effect immediately.
- **Every backend write emits a fire-and-forget Firestore event** to `centers/{centerId}/farmer_events/{farmer}` after the repository write succeeds. Skipping this silently breaks live updates on other clients.
- **All Firestore writes are Admin-SDK-only.** Client SDK reads are limited to `config/**` and `farmer_events/{farmer}`, gated by the `centers` claim in `frontend/firestore.rules`. Everything else is default-deny.

## PalletTable Layout Contract

`PalletTable.vue` uses `h-full flex flex-col` with an internal `overflow-auto` table wrapper so the
toolbar, search bar, and `<thead>` all stay sticky while rows scroll. **Any page component that
renders `<PalletTable>` must add `h-full` to its own root `<div>`**, otherwise the height chain
breaks and scrolling stops working. Current pages that do this: `Destination.vue`, `Weight.vue`,
`SentPallets.vue`, `sentPalletsForMark.vue`.

---

## Known Issues / Deferrals

- **Google Sheets is not fully removed.** `googleSheetsService.js` is retained for shipping-label provisioning and the admin `create-sheet`/`delete-sheet`/`refresh-cache` + startup cache-warm paths — deleting it would break server boot. Its removal + Firestore-based farmer provisioning is **task 6**; shipping labels off Sheets is **task 20**.
- **`centerId` is still the constant `'tsuberi'`** (env-resolved via `config/center.js`, not per-subdomain). Task 23 shipped the Firebase-Auth/claim side — client reads are authed + center-matched, and `ensureCenterAccess` gates every backend request — but real per-subdomain center *resolution* (hostname → `centerId`) is still not implemented. **Task 23 status: SHIPPED to production 2026-07-26**; see `done.md` for the cutover log.
- **Deliberately deferred, not oversights:** putting `role` in the custom claim (it stays live-read from Firestore), and running staging on a separate Firebase project (still the same project as production — note this is the *only* way to rehearse a rules flip, since rules and Auth users are both project-scoped).
- **Gaps left open after the task-23 cutover** (none blocking): branch `arch-redesign` is ~40 commits ahead of `main`, so production runs code that is not on the main branch; the dead auth env vars are still set on the Cloud Run service; legacy top-level `users/{email}` docs from the 15/16 migration still exist but grant nothing; `server.js:53` does `process.env.FRONT_CORS.split(",")` with no guard, so a missing env var becomes an unstartable container instead of a clear error; and `DELETE /api/admin/users/:email` recomputes the claim but does not revoke refresh tokens, so center-membership revocation lags up to an hour (admin *role* revocation is immediate).
- **Minor dead code:** a couple of `error.message.includes("Invalid farmer sheet")` catch branches remain in read-only controller handlers — harmless, since the repository no longer throws that string.

---

## Rules to Follow

1. **Records go through the `RecordRepository`** (Firestore), not Sheets. Controllers depend on `require('../repositories')`, never on `googleSheetsService` directly. When adding a record field, update `SheetModel` and the record-fields table in [docs/architecture.md](docs/architecture.md). Keep the repository interface storage-agnostic so the parked Postgres option stays a mechanical swap.
2. **Auth checks** — backend endpoints need `verifyFirebaseToken` + `ensureCenterAccess`; admin ones also need `ensureAdmin`. Frontend routes use `meta: { requiresAuth, requiresAdmin }`.
3. **Tailwind only** — use Tailwind utility classes; avoid scoped vanilla CSS unless truly necessary.
4. **Logging** — add `logger.info` / `logger.error` calls in any new controller or service method.
5. **Users live in Firestore** — the `users` collection is the authorization source. Add/remove users via the admin UI or the `/api/admin/users` endpoints. `users.json` is only a first-boot seed; editing it does not change an already-seeded database.
6. **Hebrew / RTL** — the app UI is Hebrew. Keep labels and messages in Hebrew where consistent with existing code. **Everything dev-facing — docs, comments, logs, commit messages, planning — is English.**
7. **Keep this file short.** It loads in full on every conversation. New reference material goes in `docs/`; new procedures go in `.claude/skills/`. Only add something here if getting it wrong is likely *and* costly.
