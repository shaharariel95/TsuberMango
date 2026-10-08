// Browser E2E against the local emulator stack (auth + Firestore emulators, seeded
// centers/test, backend with CENTER_ID=test, Vite with VITE_USE_EMULATORS=true).
// Run: npm run e2e   (starts the stack itself, or reuses one already running on :5173)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome', // the locally installed Chrome — no browser download
    locale: 'he-IL',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm --prefix ../backend run local:test',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
