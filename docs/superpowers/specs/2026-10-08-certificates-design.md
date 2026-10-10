# Shipping Certificates off Google Sheets — Design (task 20, absorbs 4)

**Date:** 2026-10-08 · **Status:** Approved in conversation; awaiting spec review
**Tasks:** 20 (labels off Sheets) + 4 (CR#4 auto-split >13 rows), part of 7 (per-farmer header config) and a first slice of 6 (farmer profile doc).

## Goal

A selection of pallets becomes a printed shipping certificate (תעודת משלוח) in one tap, with no Google Sheets involved. Every certificate and every version of it is kept, browsable, re-printable and exportable. The printed page matches today's certificate.

## Decisions (from the owner)

- Google Sheets is fully off for certificates. Sheets was only used for after-season calculation, which is replaced by an Excel export in Settings.
- Layout is identical for all farmers. Only the 5 header lines, the driver name and the running number differ (verified against the live `base` tabs on 2026-10-08).
- **>13 rows:** rare. When it happens, auto-split into ≤13-row certificates, keeping each pallet's rows together. Each certificate has one destination and one shipment date.
- **Corrections after issue:** reprint with the **same number**; every earlier version stays in the DB.
- **Removing a pallet from a certificate** is supported. The same number gets a new version without that pallet; removing the last pallet cancels the certificate.
- Printing: tablet over Wi-Fi via the share sheet; sometimes from a PC.
- Rendering approach **A**: store data snapshots in Firestore, render the PDF client-side with pdfmake (the same stack as stickers). No stored PDF files.

## Data model (Firestore, under `centers/{centerId}`)

### `farmers/{farmerName}`: certificate profile (first slice of task 6)
```
certificateProfile: {
  headerLines: [string × 5],   // [0] big title, [1..4] small lines
  driverName: string,          // printed in "שם המוביל"; may be ''
  nextNumber: number           // next certificate number to issue (integer ≥ 1)
}
```

### `certificates/{farmer}__{number}`: one per certificate
```
farmer, number, destination, shipmentDate (yyyy-mm-dd),
recordIds: [string], palletCount, totalBoxes, totalWeight,
status: 'issued' | 'cancelled',
currentVersion: number,
issuedBy, issuedAt, updatedBy, updatedAt
```
The doc id embeds the number, so a duplicate number cannot be written. The top-level fields serve the certificates table.

### `certificates/{id}/versions/{n}`: immutable snapshots (n = 1, 2, …)
```
headerLines, driverName, number, shipmentDate, destination,
rows: [{ recordId, palletNumber, kind, size, boxes, weight, firstOfPallet: bool }],
palletCount, totalBoxes, totalWeight,
reason: 'issue' | 'reprint' | 'remove-pallet',
createdBy, createdAt
```
Versions are never modified. A version is exactly what was (or would be) printed.

## Backend

New `services/certificateService.js` (business logic, transactions) and `controllers/certificateController.js`; routes under `/api/certificates` (verifyFirebaseToken + ensureCenterAccess) and admin routes in `app.js`. Pure helper `services/certificateChunking.js`. All handlers log via `logger`. Every write emits the farmer's realtime event afterwards (`bulk_update` with the stamped pallets), as with other writes. Audit entries are written per touched record.

### Splitting (`certificateChunking.js`, pure)
Group selected records by `palletNumber`, preserving pallet-number ascending order. Pack whole groups first-fit into chunks of ≤13 rows. A single group of more than 13 rows → error. Within a group, `firstOfPallet` is true on its first row.

### `POST /api/certificates` — issue
Body `{ farmer, recordIds }`. Steps:
1. Validate: known farmer; ≥1 id; all records exist; none has a non-empty `cardId` (else **409** with `{ conflicts: [{ recordId, palletNumber, certificateNumber, certificateId }] }` and the Hebrew message "משטח X כבר בתעודה N — הסר אותו מהתעודה כדי להפיק חדשה"); weight, boxes, destination, shipmentDate present; a single destination and a single shipmentDate across the selection (400 with Hebrew messages).
2. Chunk.
3. **One Firestore transaction:** read the farmer profile (missing profile or missing `nextNumber` → 400 "חסרים פרטי תעודה לחקלאי — הגדר בהגדרות"); re-read the records and re-check `cardId` empty; for each chunk assign `nextNumber++` and create the certificate doc + version 1 (`reason: 'issue'`); update each record: `cardId = number`, `sent = true`, `mark = false`, `editedBy`, `editedAt`; write the profile's new `nextNumber`.
4. After commit: audit + realtime event.
5. Response `201 { certificates: [{ id, number, snapshot }] }`.

### `POST /api/certificates/:id/reprint`
Build a snapshot from the current data of the certificate's records (profile header and driver as they are now). If it differs from the latest version in any printed field, write version n+1 (`reason: 'reprint'`) and bump `currentVersion`/`updatedBy`/`updatedAt` in a transaction. Return the (new or latest) snapshot. Cancelled certificate → 409.

### `POST /api/certificates/:id/remove-pallet`
Body `{ recordId }`. In a transaction: the record must belong to this certificate; clear its `cardId`, set `sent = false`, `mark = true` (back to shipment prep); write version n+1 without it (`reason: 'remove-pallet'`) and update the totals and `recordIds`. If no records remain, set `status: 'cancelled'` (the number is never reused). Audit + realtime event. Returns the new snapshot.

### Existing reset-sent on certified pallets
`PUT /farmers/:farmer/records/resetPallets` for a record with a `cardId` goes through the same remove-pallet logic, so pallet state and certificates can't disagree.

### Reads
- `GET /api/certificates?farmer=&from=&to=` (`farmer` required): list of certificate docs sorted by number desc. Date filtering is in memory (season volume ~hundreds), so no composite index is needed.
- `GET /api/certificates/:id`: the doc plus version summaries (n, reason, createdBy, createdAt).
- `GET /api/certificates/:id/versions/:n`: full snapshot.

### Admin
- `GET /api/admin/farmers/:farmer/certificate-profile` and `PUT` the same path (ensureAdmin). PUT validates 5 lines, driverName string, integer `nextNumber` ≥ 1. It rejects (400) a `nextNumber` ≤ the highest number already issued for that farmer.
- `GET /api/admin/export/records`: all farmers' records with certificate fields, for the season export.

### Removed
`services/shippingLabelsService.js`, `controllers/labelController.js`, `POST /api/shipping/newlabel` and its route, the `getSpreadsheetIdByFarmer` test, and all `SHIPPING_LABELS_ID_*` env usage. The frontend two-step create → `updatemany` flow is removed. `googleSheetsService.js` stays (admin create/delete-sheet) until task 6.

## Frontend

### `src/data/certificatePdf.js`
- `buildCertificateDoc(snapshots)`: pure function, unit-testable; returns a pdfmake docDefinition with one certificate per page.
- `printCertificates(snapshots, filename)`: lazy-loads pdfmake + Rubik exactly like `printData.js`. On the tablet it uses `navigator.share` with the PDF file; otherwise it opens the PDF in a new tab (`pdf.open()`) with `download()` as the fallback.

The layout reproduces the live template:
- A4 portrait.
- Header block: big bold title, then 4 centered small lines, then a double rule.
- A row with "מגדל מס':" (blank box) and "תאריך" + date.
- "תעודת משלוח סמ' {number}", with the number in bold red.
- "עבור: {destination}".
- A table with columns right-to-left: משטח מס' | מוצר/זן | גודל | איכות | אריזה | כמות | משקל | כמות משטחים | מחיר. Always exactly **13** body rows; "כמות משטחים" = 1 on `firstOfPallet` rows; איכות/אריזה/מחיר are blank.
- Footer: סה"כ משטחים = palletCount; "תוצרת מעושרת / נשלח מעשר", "כמות מעשר"; "שם המוביל" = driverName; רכב מס, שעת יציאה, נפרק על-ידי, חתימה, שעה are blank.

Hebrew RTL follows whatever technique `printData.js` already uses for stickers (verify first). Acceptance: a printed side-by-side comparison with `תעודות משלוח צוברי - 51219.pdf`.

### Issuing (PalletTable "צור תעודת משלוח")
- Remove the 13-row limit.
- Before issuing, compute the split client-side with the same chunking rules (shared logic or a mirrored helper, unit-tested) and `requestConfirm()` with "ייווצרו 2 תעודות: 13 + 4", the destination and the date.
- On success: update local rows (`cardId`, `sent`, `mark`), then `printCertificates`.
- On a print failure: a `requestAlert` saying the certificate was saved and can be printed from "תעודות".
- Errors use `requestAlert` with the server's Hebrew message. For a 409, the alert names the certificate(s).
- In pallet tables, a non-empty `cardId` renders as a link to `/Certificates?farmer=…&number=…`.

### `/Certificates` screen ("תעודות")
- Visible to both roles; a sidebar entry; follows the PalletTable `h-full` page contract if it uses a scrolling table.
- Filters: farmer (defaults to the sidebar's selected farmer), date range, destination, number search.
- Table columns: מספר · תאריך · יעד · משטחים · ארגזים · משקל · גרסה (tooltip: updated by/at) · סטטוס.
- Expanding a row shows its pallets; each pallet has "הסר מתעודה" (requestConfirm → remove-pallet → reprint offer).
- Row actions: הדפס (latest version), היסטוריה (version list; open/print any version).
- Multi-select → one merged PDF.
- "ייצוא לאקסל" exports the filtered table: sheet "תעודות" (one row per certificate) + sheet "משטחים" (one row per pallet on those certificates). It uses the lazy xlsx import pattern from DestinationsSummary.

### Settings (admin)
- In the farmer list, each farmer gets a "פרטי תעודה" button opening an editor: 5 header lines, driver name, next number. "תצוגה מקדימה" renders a sample PDF with fake rows. Saving goes through the admin PUT.
- A "ייצוא נתוני עונה" button produces one Excel file with one sheet per farmer and one row per pallet: מגדל, מספר תעודה, תאריך משלוח, יעד, משטח מס', זן, גודל, ארגזים, משקל, תאריך קטיף.

## Rollout

- `backend/scripts/seedCertificateProfiles.js` (one-time, idempotent, read-only on Sheets): for each farmer whose label spreadsheet is readable, copy `base!A1:A5` into `headerLines`, set `driverName` from the template (`אדם`), and set `nextNumber = base!D7 + 1`. As of 2026-10-08 that gives Tsuberi 51466, Pesach 90048, Shahak 507, Meltzer 3.
- Avner, Idan and Kopler: their sheets are not shared with the service account, so the owner enters their profiles in Settings.
- After deploy: remove the `SHIPPING_LABELS_ID_*` env vars from Cloud Run.
- Docs: `docs/architecture.md` (Firestore tree, services), `docs/api-reference.md`, `docs/realtime.md` if events change, `done.md`, and the board in `docs/redesign-plan.md` (20 and 4 done; 7 covered for headers).

## Testing

- **Unit (backend Vitest):** chunking with exactly 13, 14 and 26 rows; a 3-row mixed pallet at the boundary moves whole; a single >13-row pallet → error; `firstOfPallet` flags.
- **Unit (frontend):** `buildCertificateDoc` (13 body rows, column order, red number, header lines, totals). Add Vitest to the frontend for this.
- **API (`api.test.js`):**
  - issue stamps all records atomically and creates version 1;
  - numbers are sequential per farmer and independent across farmers;
  - **two concurrent issues** get distinct numbers;
  - mixed destination or date → 400; an already-certified record → 409 with conflicts;
  - a missing profile → 400;
  - reprint without changes → no new version; after a weight edit → version 2, with version 1 unchanged;
  - remove-pallet → new version, the pallet back to mark=true/sent=false/cardId '', and removing the last pallet → cancelled;
  - resetPallets on a certified pallet → same effect;
  - list and filters;
  - profile PUT validation (number ≤ max issued → 400) and admin-only;
  - export admin-only.
- **E2E (desktop + tablet):**
  - issue from shipment prep → a PDF is produced (intercept the download/popup or stub `navigator.share`), the row shows the number;
  - "תעודות" lists it;
  - edit a weight, reprint → history shows version 2;
  - remove a pallet → it is back in shipment prep.
- The emulator seed (`seedTestCenter.js`) gets a certificate profile for the test farmer.
- **Manual before season:** print one certificate on the packhouse printer and compare it with the sample PDF.

## Out of scope

Stored PDF files or GCS; adding a pallet to an existing certificate; live updates on the certificates screen; entering price/quality/packaging in the app; per-farmer layout differences beyond the header; the full farmer registry (task 6).
