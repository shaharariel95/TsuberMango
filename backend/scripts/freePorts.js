// Kill stray emulator / dev-server processes left listening on this project's ports.
//
// Root cause (Windows): firebase-tools spawns `java` for the Firestore emulator and stops
// it with kill("SIGINT"), which Node maps to TerminateProcess on that single PID. When
// `java` resolves to Oracle's launcher shim (C:\Program Files\Common Files\Oracle\Java\
// javapath\java.exe), the shim spawns the real JDK java.exe as a child — only the shim
// dies, the real JVM is orphaned and keeps port 8080, so the next run fails with
// "port taken". Same for `concurrently` children when local:test is killed mid-run.
// A wrapper with `taskkill /T` would miss the killed-parent case and PATH reordering
// is per-machine, so this port sweep is the fix. Only java/node processes are touched.
//
// Usage: node scripts/freePorts.js          → emulator ports only
//        node scripts/freePorts.js --dev    → also the backend (3000) and Vite (5173)
const { execSync } = require('child_process');

const EMULATOR_PORTS = [8080, 9099, 4000, 4400, 4500, 9150];
const DEV_PORTS = [3000, 5173];
const ports = process.argv.includes('--dev') ? [...EMULATOR_PORTS, ...DEV_PORTS] : EMULATOR_PORTS;
const KILLABLE = /^(java|node)(\.exe)?$/i;

function listenersWindows() {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
    if (m && ports.includes(Number(m[1]))) pids.add(Number(m[2]));
  }
  return [...pids].filter(pid => {
    const name = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).split(',')[0].replace(/"/g, '').trim();
    return KILLABLE.test(name);
  });
}

function listenersPosix() {
  const pids = new Set();
  for (const port of ports) {
    try {
      execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' })
        .split('\n').filter(Boolean).forEach(pid => pids.add(Number(pid)));
    } catch { /* nothing listening */ }
  }
  return [...pids].filter(pid => {
    const name = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim().split('/').pop();
    return KILLABLE.test(name);
  });
}

const pids = process.platform === 'win32' ? listenersWindows() : listenersPosix();
for (const pid of pids) {
  try {
    process.kill(pid, 'SIGKILL');
    console.log(`[freePorts] killed stray process ${pid}`);
  } catch (err) {
    console.log(`[freePorts] could not kill ${pid}: ${err.message}`);
  }
}
