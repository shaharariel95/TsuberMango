// Firebase Admin / GCS credentials: a local service-account key file when present (developer
// machines, scripts); otherwise Application Default Credentials (the Cloud Run service identity).
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');

function keyFileIfPresent(file = KEY_FILE) {
  return fs.existsSync(file) ? file : null;
}

// Options for admin.initializeApp(). `admin` is injected so this module stays side-effect free.
function adminInitOptions({ keyFile = keyFileIfPresent(), projectId = process.env.FIREBASE_PROJECT_ID, admin } = {}) {
  if (keyFile) {
    const serviceAccount = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    return {
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId || serviceAccount.project_id,
    };
  }
  if (!projectId) {
    throw new Error('No service-account key file and FIREBASE_PROJECT_ID is not set: cannot initialize Firebase Admin with Application Default Credentials');
  }
  return { projectId };
}

function storageOptions({ keyFile = keyFileIfPresent() } = {}) {
  return keyFile ? { keyFilename: keyFile } : {};
}

module.exports = { KEY_FILE, keyFileIfPresent, adminInitOptions, storageOptions };
