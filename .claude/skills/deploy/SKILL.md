---
name: deploy
description: Use when deploying TsuberMango to production - the frontend to Firebase Hosting, the backend to Cloud Run, or Firestore security rules. Covers the two-project split, the exact commands, ordering for auth-affecting changes, and rollback. Read this BEFORE running any gcloud or firebase deploy command.
---

# Deploying TsuberMango

## Two different Google Cloud projects are in play

This trips people up. Check which one you are targeting before every command.

| Piece | Where |
|---|---|
| Frontend (Firebase Hosting) | Firebase project **`tsuberi-mangos-7e449`**, site `tsuberi-mangos-7e449` |
| Firestore + Firebase Auth + rules | Firebase project **`tsuberi-mangos-7e449`** |
| Backend (Cloud Run) | GCP project **`tsuberi-mangos`**, service **`backend-service`**, region `europe-west1` → `api.tsuberi.com` |

The backend bridges the two via its credentials (see **Credentials**) plus `FIREBASE_PROJECT_ID`.

## Credentials

Production uses the **Cloud Run service identity** (`380552578196-compute@developer.gserviceaccount.com`,
Application Default Credentials) with `projectId: FIREBASE_PROJECT_ID`. The key file
`backend/services/SheetsCred.env.json` is for local dev and scripts only; it is listed in
`backend/.gcloudignore` / `.dockerignore` (`*.env.json`) and must never ship in the image. Code
(`utils/gcpCredentials.js`) uses the key file when present, ADC otherwise. After a deploy the
Cloud Run log line "Firebase Admin initialized ... using Application Default Credentials" confirms the mode.
Scripts prefer `FIREBASE_PROJECT_ID` over the key's `project_id` (the same project today). Check what would upload (read-only) from `backend/`: `gcloud meta list-files-for-upload` must not list `*.env.json`.

### One-time keyless cutover checklist (in this order)

0. **Confirm `FIREBASE_PROJECT_ID` is set on the service** (read-only; the app now requires it without a key file; expect `tsuberi-mangos-7e449`):
   ```
   gcloud run services describe backend-service --region europe-west1 --project tsuberi-mangos --format="value(spec.template.spec.containers[0].env)"
   ```
1. **Grant roles** to the Cloud Run identity on the Firebase project:
   ```
   gcloud projects add-iam-policy-binding tsuberi-mangos-7e449 --member=serviceAccount:380552578196-compute@developer.gserviceaccount.com --role=roles/datastore.user
   gcloud projects add-iam-policy-binding tsuberi-mangos-7e449 --member=serviceAccount:380552578196-compute@developer.gserviceaccount.com --role=roles/firebaseauth.admin
   ```
   (Its storage access to `tsuberi-mangos-backups` is already in place.)
   Also enable the Auth admin API **in the backend project** — with ADC, Firebase Auth admin calls are billed to the
   caller's project, and without it `getUserByEmail`/`setCustomUserClaims`/`revokeRefreshTokens` fail with
   "Identity Toolkit API has not been used in project 380552578196" (done 2026-10-10):
   ```
   gcloud services enable identitytoolkit.googleapis.com --project tsuberi-mangos
   ```
2. **Deploy the backend** (Commands below).
3. **Verify** (sign-in alone cannot detect a broken `firebaseauth.admin` grant: it only uses `verifyIdToken`, and `syncUserClaims`/logout swallow IAM failures): sign in AND sign out; in Settings add then remove a test user (exercises `setCustomUserClaims`); intake one test pallet; run a backup from Settings -> גיבויים. Then check the Cloud Run logs contain the "Application Default Credentials" init line and NONE of: `[syncUserClaims] no auth user`, `[/api/auth/logout] revoke failed`, `Backup failed`.
4. **Only then rotate the key**: the old key sits in every previous image. List keys, create a new one for local use, delete the old key id:
   ```
   gcloud iam service-accounts keys list --iam-account firebase-adminsdk-fbsvc@tsuberi-mangos-7e449.iam.gserviceaccount.com --project tsuberi-mangos-7e449
   gcloud iam service-accounts keys create backend/services/SheetsCred.env.json --iam-account firebase-adminsdk-fbsvc@tsuberi-mangos-7e449.iam.gserviceaccount.com --project tsuberi-mangos-7e449
   gcloud iam service-accounts keys delete <OLD_KEY_ID> --iam-account firebase-adminsdk-fbsvc@tsuberi-mangos-7e449.iam.gserviceaccount.com --project tsuberi-mangos-7e449
   ```
5. Optionally delete old image versions in Artifact Registry.

**Rollback** (before step 4): `gcloud run services update-traffic backend-service --to-revisions <prev>=100 --region europe-west1 --project tsuberi-mangos`. The previous revision still contains the old key until rotation, which is why rotation is last.

`firebase-tools` is installed **only in `backend/node_modules`** (pinned to 14.18.0 for JDK-11
compatibility), so it is always invoked as `..\backend\node_modules\.bin\firebase.cmd` with
`frontend` as the working directory.

## Ordering

**For auth-affecting changes the order is: backend → frontend → Firestore rules LAST.**

Rules are project-global and instantly affect every live client, so they go last as an
independently reversible step. For non-auth changes, deploy only what changed.

## Commands

```powershell
# 1. Backend
cd backend
gcloud run deploy backend-service --source . --region europe-west1 --project tsuberi-mangos

# 2. Frontend
cd frontend
npm run build; if ($?) { ..\backend\node_modules\.bin\firebase.cmd deploy --only hosting }

# 3. Firestore rules (last)
cd frontend
..\backend\node_modules\.bin\firebase.cmd deploy --only firestore:rules
```

## Gotchas — all of these have actually bitten

- **The service is `backend-service`, NOT `tsuberi-backend`.** Deploying to a wrong name silently
  *creates a new empty service* with no env vars, which then crash-loops on `FRONT_CORS`. (This name
  was wrong in `backend/CLOUD_SCHEDULER.md` until 2026-07-27 — older notes may still repeat it.)
- A second, stale `backend-service` exists in **`me-west1`**, unused since 2025-04-26. Ignore it.
- **Pinned traffic blocks promotion.** If Cloud Run traffic has been pinned to a revision (which
  `update-traffic --to-revisions=...` does), `gcloud run deploy` builds a new revision but does
  **not** promote it — the old code keeps serving. Fix with:
  ```powershell
  gcloud run services update-traffic backend-service --to-latest --region europe-west1 --project tsuberi-mangos
  ```
- `gcloud run deploy` **preserves** existing env vars when you don't pass `--set-env-vars`; passing
  it *replaces* them all.
- **Custom claims are not visible in the Firebase Console.** Verify them with
  `getAuth().getUserByEmail(email)` (from `firebase-admin/auth`) and read `.customClaims`.

## Verifying after deploy

- Backend: confirm the new revision is actually serving traffic (`gcloud run services describe backend-service --region europe-west1 --project tsuberi-mangos`), not just built.
- Rules: compare the released ruleset against `frontend/firestore.rules` — they should be byte-identical.

## Rolling back rules

```powershell
git checkout <old-sha> -- frontend/firestore.rules
# then redeploy rules
```

**Do not shell-redirect the file to restore it** — PowerShell 5.1 writes a UTF-8 BOM that the rules
parser rejects. Use `git checkout` (or an editor that writes BOM-less UTF-8).
