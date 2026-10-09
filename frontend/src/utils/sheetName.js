// Excel sheet names: max 31 chars, none of  / \ ? * [ ] :, no leading/trailing apostrophe,
// not empty, unique (case-insensitive). `used` is a Set the caller keeps across calls.
const MAX = 31;

export function safeSheetName(name, used = new Set()) {
  let base = String(name ?? '').replace(/[\\/?*[\]:]/g, '_').trim().replace(/^'+|'+$/g, '').trim();
  if (!base) base = 'מגדל';
  base = base.slice(0, MAX).replace(/^'+|'+$/g, '').trim() || 'מגדל';

  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, MAX - suffix.length).replace(/'+$/, '').trimEnd() + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
