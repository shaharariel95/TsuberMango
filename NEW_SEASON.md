# TsuberMango - New Season Guide

## 1. How the data is laid out
Everything lives in Firestore under `centers/tsuberi/…`:
- `config/global` - kinds, sizes, destinations, and the farmers list (`{name, allowGidon, archived?}`).
- `users` - authorization (email -> role).
- `farmers/{name}` - holds `certificateProfile` (header lines, driver, next certificate number), with sub-collections `records` and `audit`.
- `certificates/{farmer}__{number}` - issued shipping certificates, with a `versions` sub-collection.
- `farmer_events` - real-time sync events (disposable).

Google Sheets is only a cold archive of past seasons. There is no per-season spreadsheet any more.

## 2. End of season
1. Settings -> **ייצוא נתוני עונה** - downloads the Excel file used for the after-season calculations.
2. Settings -> **גיבויים** - run a backup (stored in the GCS bucket). Confirm it appears in the list. The backup is complete: config, users, every farmer's certificate details, every farmer (including ones not in the farmers list), deleted pallets, edit history and all certificates. A failed read fails the whole backup, so a backup that appears in the list is complete. A nightly backup also runs on its own (Cloud Scheduler job `tsuberi-daily-backup`).

## 3. Before the next season
1. Take a fresh backup (Settings -> **גיבויים**). The reset refuses to run without a `backups` entry from the last 24 h.
2. Dry run (deletes nothing, prints counts):
   ```bash
   cd backend
   node scripts/clearSeason.js
   ```
3. Compare the backup's row count (Settings -> **גיבויים**, column "שורות") with the dry run's total record count. They must be equal. If they differ, a pallet was added or changed after the backup: take a fresh backup and re-run the dry run. Do NOT execute until they match (unless the difference is known test data).
4. Execute:
   ```bash
   node scripts/clearSeason.js --execute --center tsuberi
   ```
   `--center` must match the resolved `CENTER_ID`, otherwise the script falls back to a dry run.
5. What it deletes: every farmer's records and audit, all certificates (with their versions), all `farmer_events`.
   What it keeps: `config/**` (kinds, sizes, destinations, farmers list), `users/**`, `farmers/{name}` docs including `certificateProfile` (certificate numbering continues across seasons), and backup metadata + GCS backup files.
6. Then in Settings:
   - **ניהול חקלאים**: hide farmers who left (their data stays; restore them from **חקלאים מוסתרים**), add new farmers.
   - For each farmer check **פרטי תעודה**: header lines, driver, next number.
   - Review the kinds / sizes / destinations lists and the users list.

## Restoring from a backup
Use when data was lost or corrupted. The tool never overwrites: if a farmer already has records/audit, or a certificate id already exists, it reports a blocker and `--execute` writes nothing. Ids are preserved. It accepts old (records only) and new (complete) backup files.

1. Dry run (prints what would be restored and any blockers):
   ```bash
   cd backend
   node scripts/restoreBackup.js --gcs latest          # or --gcs 2026-12-14, or --file <path>
   ```
2. If the target still holds (damaged) data, clear it first with `node scripts/clearSeason.js` (it needs a recent backup; see section 3), or restore a single farmer whose data is empty.
3. Execute:
   ```bash
   node scripts/restoreBackup.js --gcs latest --execute --center tsuberi
   ```
   `--center` must match the resolved `CENTER_ID`, otherwise it stays a dry run.
4. One farmer only: add `--farmer <name>` (records, history, farmer details and that farmer's certificates).
5. `--with-config` also restores settings (config) and users. Use it only when those were lost too; full restore of a complete backup only.
6. After a restore, clients should reload (no live events are sent).

### Restore drill (rehearse before the April dry run, touches no production data)
Download a backup and restore it into a throwaway center inside the Firestore emulator (the data vanishes when the emulator stops):
```powershell
gcloud storage cp gs://tsuberi-mangos-backups/backups/<date>.json .
cd backend
$env:CENTER_ID='drill'
npx firebase emulators:exec --only firestore --project demo-tsuber "node scripts/restoreBackup.js --file ../<date>.json --execute --center drill"
Remove-Item Env:CENTER_ID
```
The output should show `"executed": true` and the counts you expect, and the log line `target: EMULATOR 127.0.0.1:8080`. If it says `REAL Firestore`, stop.

## 4. First-time setup only (2026 season)
1. Clear the pre-season test data. There is no real backup to guard, so skip the check:
   ```bash
   node scripts/clearSeason.js                                          # dry run first
   node scripts/clearSeason.js --execute --center tsuberi --skip-backup-check
   ```
2. AFTER clearing (never delete `farmers/{name}` docs afterwards - they hold `certificateProfile`), seed profiles from the old label sheets:
   ```bash
   node scripts/seedCertificateProfiles.js --dry-run
   node scripts/seedCertificateProfiles.js
   ```
3. Enter the Avner / Idan / Kopler profiles manually in Settings -> **פרטי תעודה**, then check all farmers (names must match the config exactly).
4. Printer check: Settings -> **פרטי תעודה** -> **תצוגה מקדימה**. Never issue a real certificate to test - it consumes a real number.
5. Once seeded, delete `backend/scripts/seedCertificateProfiles.js` and the `googleapis` dependency.

## 5. Deploying
See the `deploy` skill (`.claude/skills/deploy/SKILL.md`) for the exact commands and ordering. Backend: Cloud Run service `backend-service` (project `tsuberi-mangos`, region `europe-west1`). Frontend: Firebase Hosting (project `tsuberi-mangos-7e449`). There are no per-season env vars any more; remove `SPREADSHEET_ID` / `SHIPPING_LABELS_ID_*` from Cloud Run if still set.
