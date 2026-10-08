// Guard against touching real Google Sheets from a local/emulator run.
// The emulator stack (npm test, npm run local:test) runs against fake Firestore data,
// but the Sheets services hold production spreadsheet ids — a test certificate or
// create-sheet call would land in a live customer file. Set ALLOW_REAL_SHEETS=true
// to opt in deliberately.

function isEmulatorMode() {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

function assertRealSheetsAllowed() {
  if (isEmulatorMode() && process.env.ALLOW_REAL_SHEETS !== 'true') {
    throw new Error('Google Sheets access is disabled while running against the Firebase emulators (set ALLOW_REAL_SHEETS=true to override)');
  }
}

module.exports = { isEmulatorMode, assertRealSheetsAllowed };
