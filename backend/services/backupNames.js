// Pure helpers for backup object names (no GCS access).
// New names: backups/YYYY-MM-DD-HHmmss.json (UTC, from the payload timestamp). Old names: backups/YYYY-MM-DD.json.

function backupFileName(isoTimestamp) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(isoTimestamp);
  if (!m) throw new Error(`Bad backup timestamp: ${isoTimestamp}`);
  return `backups/${m[1]}-${m[2]}${m[3]}${m[4]}.json`;
}

// Sort key without the extension, so "2026-07-14" < "2026-07-14-020000" (old date-only sorts before same-day timestamped).
const sortKey = (name) => name.replace(/\.json$/, '');
const byAge = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);

// names: all object names under backups/. which: 'latest' | 'YYYY-MM-DD' | full object name.
// Returns { name, candidates } (candidates = every match for that date/latest, oldest first).
function resolveBackupName(names, which) {
  const sorted = names.filter(n => /\.json$/.test(n)).sort(byAge);
  if (which === 'latest') {
    if (!sorted.length) throw new Error('No backups in the bucket');
    return { name: sorted[sorted.length - 1], candidates: sorted.slice(-1) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(which)) {
    const candidates = sorted.filter(n => n.startsWith(`backups/${which}`));
    if (!candidates.length) throw new Error(`No backup for ${which} (UTC date)`);
    return { name: candidates[candidates.length - 1], candidates };
  }
  return { name: which, candidates: [which] };
}

module.exports = { backupFileName, resolveBackupName };
