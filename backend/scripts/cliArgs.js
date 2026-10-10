// Pure CLI arg helpers shared by clearSeason.js and restoreBackup.js.
// argValue returns undefined if the flag is absent; throws if it is present without a value or the value looks like a flag.
function argValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

module.exports = { argValue };
