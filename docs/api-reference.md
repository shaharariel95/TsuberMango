# API & Auth Reference

Routes, endpoints, and the full authentication flow. The one-paragraph summary that matters for
everyday work is in [CLAUDE.md](../CLAUDE.md).

---

## Frontend Routes

| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/Dashboard` | Dashboard | Admin only |
| `/Intake` | PalletInput | Admin only |
| `/Weight` | Weight | Admin only |
| `/SentPallets` | SentPallets | Admin only |
| `/Settings` | Settings | Admin only |
| `/sentPalletsForMark` | sentPalletsForMark | Auth required |
| `/Destination` | Destination | Auth required |
| `/DestinationsSummary` | DestinationsSummary | Auth required |

There is no `/` route. The `beforeEach` guard in `router.js` first resolves Firebase's current auth
state (`auth.currentUser`, or one `onAuthStateChanged` tick if it hasn't hydrated yet) — no Firebase
user means an immediate redirect to `/login`, no network round-trip needed. It hits `/api/auth/me`
only for the admin gate and bare/unmatched-path role-home redirect: admins to `/Dashboard`, everyone
else to `/Destination`. A non-admin hitting an admin-only route is sent to `/Destination`; a `401`
from that call sends the user to `/login`. If the call fails for another reason (server down),
already-matched routes are let through and only unmatched paths fall back to `/login`.

---

## Backend API Endpoints

All `/api/*` routes require `verifyFirebaseToken` + `ensureCenterAccess`. Admin-only routes
additionally require `ensureAdmin`.

| Method | Path | Controller | Notes |
|---|---|---|---|
| POST | `/api/records` | `createRecord` | Create new pallet record |
| GET | `/api/farmers/:farmer/records` | `getAllRecords` | All records for farmer |
| GET | `/api/farmers/:farmer/records/destinations` | `getAllRecordsforDestinations` | Records with `mark=true` |
| GET | `/api/farmers/:farmer/records/pallet/:palletNumber` | `getRecordsByPallet` | Records for a pallet number (404 if none) |
| GET | `/api/farmers/:farmer/records/lastPallet` | `getLastPallet` | Highest pallet number |
| PUT | `/api/farmers/:farmer/records/resetPallets` | `resetSentStatus` | Bulk reset sent=false |
| PUT | `/api/farmers/:farmer/records/updatemany` | `updateMultipleRecords` | Batch update records |
| PUT | `/api/farmers/:farmer/records/:id` | `updateRecord` | Single record update |
| POST | `/api/shipping/newlabel/` | `createNewShippingLabel` | Create shipping label sheet |
| POST | `/api/farmers/:farmer/destinations/toSend` | `sendToDestination` | Set mark=true |
| POST | `/api/farmers/:farmer/destinations/Sent` | `removeFromDestination` | Set mark=false |
| GET | `/api/auth/me` | — | Current user info — `{email, role, centerId, refreshToken}`; role read live from Firestore |
| POST | `/api/auth/logout` | — | Logout — revokes the user's Firebase refresh tokens server-side |
| POST | `/api/admin/create-sheet` | — | Admin: create farmer sheet |
| POST | `/api/admin/delete-sheet` | — | Admin: delete farmer sheet |
| POST | `/api/admin/config` | — | Admin: save config to Firestore |
| GET | `/api/admin/users` | — | Admin: list all users |
| POST | `/api/admin/users` | — | Admin: add user |
| DELETE | `/api/admin/users/:email` | — | Admin: remove user |
| POST | `/api/admin/refresh-cache` | — | Admin: clear the legacy Sheets caches (records are uncached — read live from Firestore) |
| GET | `/api/admin/backups` | — | Admin: list recent backups from Firestore |
| POST | `/api/admin/backup` | — | Admin: trigger manual backup |
| POST | `/api/internal/backup` | — | Cloud Scheduler backup trigger. **Not** token-auth'd — verifies a Google OIDC token (or `CRON_SECRET` in dev). Defined before the `verifyFirebaseToken`/`ensureCenterAccess` block. |

---

## Authentication Flow

Auth is Firebase Auth ID tokens over a Bearer header — there is no server-side session, cookie, or
Passport strategy.

1. User hits `/login` → clicks "Sign in with Google" → `Login.vue` calls `signInWithPopup(auth, new GoogleAuthProvider())` (Firebase client SDK — still Google as the identity provider, just no server-side OAuth dance).
2. On success, the frontend calls `GET /api/auth/me` to authorize. A global Axios request interceptor (`main.js`) attaches `Authorization: Bearer <idToken>` (from `auth.currentUser.getIdToken()`) to every outgoing request automatically; raw `fetch()` calls use `utils/auth.js`'s `getToken()` instead.
3. Backend: `verifyFirebaseToken` middleware verifies the token via `admin.auth().verifyIdToken()` and sets `req.user = {email, uid, centers}` (`centers` comes from the token's custom claims). `ensureCenterAccess` then 403s unless `CENTER_ID` is in `req.user.centers`. The `/api/auth/me` handler looks up `centers/{CENTER_ID}/users/{email}` in Firestore — if the doc doesn't exist, 403 ("User not authorized"); otherwise it returns `{email, role, centerId, refreshToken}`, with **role read live from Firestore** (not from the token) so a role change takes effect on the next call, no re-login needed.
4. `/api/auth/me` also calls `syncUserClaims(email)` on every hit, which recomputes the user's `centers` claim from a live `users` collection-group scan and re-stamps it if it changed. `refreshToken: true` in the response tells the client a freshly-minted claim needs a token refresh before Firestore client reads (which check the claim in `firestore.rules`) will pass — `Login.vue` calls `auth.currentUser.getIdToken(true)` in that case.
5. `ensureAdmin` (used on admin-only routes) does its own live Firestore role lookup rather than trusting a claim — same live-role guarantee as `/api/auth/me`.
6. Frontend router guard (`router.js`) keys off Firebase's own auth state (`onAuthStateChanged`) for the signed-in/signed-out gate, and calls `/api/auth/me` only for the admin gate / role-home redirect (see Frontend Routes above).

### Claim model — deliberately minimal

The only custom claim is `{centers: [...]}`, used solely so `ensureCenterAccess` (backend) and
`firestore.rules` (client reads) can gate on tenant membership without a Firestore round-trip.
**Role is never in the claim** — it's always read live from Firestore (`ensureAdmin`,
`/api/auth/me`), so revoking admin access takes effect immediately rather than waiting for a token
refresh. `syncUserClaims(email)` is what stamps the claim: on `/api/auth/me` (self-heal), on
`POST/DELETE /api/admin/users` (immediately after a user is added/removed), and via the one-time
`scripts/backfillAuthClaims.js` for cutover.

**Custom claims are not visible in the Firebase Console.** Verify them with
`admin.auth().getUserByEmail(email)` and read `.customClaims`.

### Logout

`App.vue`'s `logout()` calls `POST /api/auth/logout`, which revokes the user's Firebase refresh
tokens server-side (`admin.auth().revokeRefreshTokens(uid)`) so the session can't be silently
resumed even if a stale ID token is replayed; the client then calls `signOut(auth)` and clears local
state regardless of whether the revoke call succeeded.

### Startup seeding

On boot, `seedUsersIfEmpty()` copies `users.json` into the Firestore `users` collection **only if
that collection is empty**. After first boot, add/remove users through the admin UI /
`POST /api/admin/users` — editing `users.json` has no effect on an already-seeded database.
Adding/removing a user there also calls `syncUserClaims(email)` to keep the claim in sync.

### Removed by the Firebase Auth migration (task 23)

Passport (`passport-google-oauth20`), `express-session` + `firestore-store`,
`GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/unauthorized`, and the
`DEV_BYPASS_AUTH`/`GET /api/auth/dev-login` dev bypass. None of these exist in the codebase anymore.
