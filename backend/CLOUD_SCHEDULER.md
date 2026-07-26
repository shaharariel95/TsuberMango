# Cloud Scheduler — Automatic Daily Backup

Daily backup fires at **02:00 AM Israel time** via Google Cloud Scheduler → `POST /api/internal/backup`.
That endpoint verifies the OIDC token issued by Cloud Scheduler and calls `backupService.runBackup()` directly (no session needed).

---

## Prerequisites

1. Backend deployed to Cloud Run at `https://api.tsuberi.com`.
2. Cloud Run service account has `roles/storage.objectAdmin` on the GCS bucket.
3. `GCS_BACKUP_BUCKET` env var set on Cloud Run (`tsuberi-mangos-backups`).
4. `CLOUD_RUN_SERVICE_URL=https://api.tsuberi.com` env var set on Cloud Run.
5. Authenticated with `gcloud` and `cloudscheduler.jobs.create` permission.

---

## Environment Variables

```
GCS_BACKUP_BUCKET=tsuberi-mangos-backups
CLOUD_RUN_SERVICE_URL=https://api.tsuberi.com

# Optional — dev-only shortcut to test the cron endpoint without OIDC
CRON_SECRET=some-random-secret
```

---

## One-time GCS Bucket Setup

```bash
gcloud storage buckets create gs://tsuberi-mangos-backups \
  --location=EUROPE-WEST1 \
  --uniform-bucket-level-access

# Grant write access to the Cloud Run service account
# NOTE: the service is `backend-service`, not `tsuberi-backend`.
SA=$(gcloud run services describe backend-service --region=europe-west1 --project=tsuberi-mangos --format="value(spec.template.spec.serviceAccountName)")
gcloud storage buckets add-iam-policy-binding gs://tsuberi-mangos-backups \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin"
```

---

## Create the Cloud Scheduler Job

```bash
SA=$(gcloud run services describe backend-service --region=europe-west1 --project=tsuberi-mangos --format="value(spec.template.spec.serviceAccountName)")

gcloud scheduler jobs create http tsuberi-daily-backup \
  --location=europe-west1 \
  --schedule="0 2 * * *" \
  --time-zone="Asia/Jerusalem" \
  --uri="https://api.tsuberi.com/api/internal/backup" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{}' \
  --oidc-service-account-email="$SA" \
  --oidc-token-audience="https://api.tsuberi.com" \
  --attempt-deadline=5m \
  --description="Daily backup of all farmer pallet data to GCS"
```

---

## Test Locally (dev secret)

```bash
curl -X POST http://localhost:3000/api/internal/backup \
  -H "Authorization: Bearer your-CRON_SECRET-value"
```

## Run Manually in Production

```bash
gcloud scheduler jobs run tsuberi-daily-backup --location=europe-west1
```

## View Job Logs

```bash
gcloud logging read 'resource.type="cloud_scheduler_job" AND resource.labels.job_id="tsuberi-daily-backup"' \
  --limit=20 --format="table(timestamp, jsonPayload.message)"
```

## Pause / Resume

```bash
gcloud scheduler jobs pause tsuberi-daily-backup --location=europe-west1
gcloud scheduler jobs resume tsuberi-daily-backup --location=europe-west1
```
