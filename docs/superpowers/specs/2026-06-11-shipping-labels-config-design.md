# Shipping Labels — Firestore Config + Automated Sheet Creation

**Date:** 2026-06-11
**Status:** Approved

---

## Problem

Adding a new farmer's shipping label spreadsheet currently requires five manual steps:

1. Copy a template spreadsheet in Google Drive
2. Share the copy with the service account email
3. Add `SHIPPING_LABELS_ID_<FARMER>=<id>` to `.env`
4. Add the Hebrew farmer name → env var mapping to `shippingLabelsService.js`
5. Redeploy the backend to Cloud Run

This is brittle (silent fallback to Tsuberi's spreadsheet on name mismatch), requires developer involvement for what is a config-level change, and is inconsistent with the rest of the app where farmers are managed entirely via the Settings UI + Firestore.

---

## Goal

After this change, adding a new farmer's shipping labels requires only clicking a button in the Settings UI. No code changes, no `.env` edits, no redeployment.

---

## Architecture

### Why the service account creates the copy

The Drive API `permissions.create` call must come from someone who already has access to the file — the service account can't share a file it doesn't own yet. The cleanest solution: the **service account creates the copy itself** via `drive.files.copy`. It owns the resulting copy and no sharing grant is needed. A single `.env` variable `SHIPPING_LABELS_TEMPLATE_ID` points to the master template (shared with the service account once, ever).

### Data model

Extend each farmer object in Firestore `config/global`:
```json
{
  "name": "ברק מלצר",
  "allowGidon": false,
  "shippingLabelSpreadsheetId": "abc123def456"
}
```

`shippingLabelsService.js` queries this field instead of reading from the hardcoded `FARMER_SPREADSHEET_IDS` map.

---

## Components

### `backend/services/shippingLabelsService.js`

**Changes:**
- Add `https://www.googleapis.com/auth/drive` scope to `GoogleAuth`
- Initialize `this.drive = google.drive({ version: 'v3', auth })` alongside `this.sheets`
- Replace synchronous `FARMER_SPREADSHEET_IDS` map + `getSpreadsheetIdByFarmer()` with:
  - `async getSpreadsheetId(farmer)` — queries Firestore `config/global`, finds farmer by name, returns `shippingLabelSpreadsheetId`. Throws if not found (no silent fallback).
  - In-memory cache: `Map<farmerName, { id, expiresAt }>` with 5-minute TTL
  - `invalidateShippingIdCache(farmerName)` — called after any Firestore update to a farmer's shipping ID
- Add `async createShippingLabelSpreadsheet(farmerName)`:
  - Calls `drive.files.copy(SHIPPING_LABELS_TEMPLATE_ID, { name: '<farmerName> - תעודות משלוח' })`
  - Returns `{ spreadsheetId, spreadsheetUrl }`
- Update `getAndIncrementHighestId`, `copyPageWithNewId`, `writeShippingDataToSheet` to `await this.getSpreadsheetId(farmer)` (replacing the sync call)

### `backend/routes/sheetRoutes.js` (or `server.js`)

**New endpoint:**
```
POST /api/admin/farmers/:farmerName/create-shipping-sheet
```
- Protected by `ensureAdmin`
- Calls `shippingLabelsService.createShippingLabelSpreadsheet(farmerName)`
- Updates Firestore: sets `shippingLabelSpreadsheetId` on the matching farmer in `config/global.farmers`
- Invalidates in-memory shipping ID cache for this farmer
- Returns `{ spreadsheetId, spreadsheetUrl }`

### `frontend/src/components/Settings.vue`

In the farmer management section, add per farmer:
- Read-only display: linked spreadsheet ID, or "לא מוגדר" if none
- **"צור גיליון תוויות"** button — calls the new endpoint; on success shows toast with link to the new spreadsheet, updates local farmer state
- **"קשר גיליון קיים"** — a small text input + link button for migration: admin pastes an existing spreadsheet ID, calls `POST /api/admin/config` with the updated `farmers` array

### `backend/.env`

- Add: `SHIPPING_LABELS_TEMPLATE_ID=<id of master template>`
- Keep existing `SHIPPING_LABELS_ID_*` vars intact during migration phase

---

## One-Time Template Setup (manual, done once)

1. Pick one existing shipping label spreadsheet as the permanent master template (or create a clean dedicated one)
2. Share it with the service account email (same account already writing all shipping sheets)
3. Copy the spreadsheet ID into `.env` as `SHIPPING_LABELS_TEMPLATE_ID` and into Cloud Run env vars

---

## Migration Path (zero-downtime)

1. Deploy new code — old `.env` IDs still present, Firestore IDs empty initially
2. **Fallback behavior during migration:** `getSpreadsheetId` checks Firestore first; if `shippingLabelSpreadsheetId` is absent, falls back to old `process.env.SHIPPING_LABELS_ID_*` lookup (temporary, removed after migration)
3. Admin opens Settings → uses "קשר גיליון קיים" for each existing farmer → pastes their current spreadsheet ID → saved to Firestore
4. Verify shipping label creation works for all farmers
5. Remove `SHIPPING_LABELS_ID_*` from `.env` and Cloud Run, remove fallback code, redeploy

---

## Files Changed

| File | Change |
|---|---|
| `backend/services/shippingLabelsService.js` | Add Drive scope + client; async Firestore lookup with TTL cache; `createShippingLabelSpreadsheet()`; make service methods async |
| `backend/routes/sheetRoutes.js` or `server.js` | New `POST /api/admin/farmers/:farmerName/create-shipping-sheet` route |
| `frontend/src/components/Settings.vue` | Spreadsheet ID display + "Create" + "Link" buttons per farmer |
| `backend/.env` | Add `SHIPPING_LABELS_TEMPLATE_ID` |
| `NEW_SEASON.md` | Remove per-farmer `SHIPPING_LABELS_ID_*` vars; replace with Settings UI instructions |

---

## Verification

1. `POST /api/admin/farmers/ברק מלצר/create-shipping-sheet` → returns `{ spreadsheetId, spreadsheetUrl }`
2. Open returned URL → spreadsheet is a copy of the template with `base` sheet and valid ID in cell `D7`
3. Settings UI shows the linked ID for ברק מלצר; Firestore `config/global` reflects it
4. Create a shipping label for ברק מלצר → data written to the correct new spreadsheet
5. Farmer with no `shippingLabelSpreadsheetId` → endpoint returns a clear error (not silent fallback to Tsuberi)
