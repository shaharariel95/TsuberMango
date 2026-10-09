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
2. Settings -> **גיבויים** - run a backup (JSON of all records + certificates, stored in the GCS bucket). Confirm it appears in the list.

## 3. Before the next season
1. Take a fresh backup (Settings -> **גיבויים**). The reset refuses to run without a `backups` entry from the last 24 h.
2. Dry run (deletes nothing, prints counts):
   ```bash
   cd backend
   node scripts/clearSeason.js
   ```
3. Compare the backup's row count (shown in the **גיבויים** list) with the dry run's total record count. **If the backup has fewer rows, do NOT execute** - the backup service skips a farmer whose fetch fails instead of failing the whole backup. Take another backup and re-check.
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
