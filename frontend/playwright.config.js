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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1600, height: 900 } } },
    // The packhouse device is a Samsung Galaxy Tab (exact model unknown) used in landscape.
    // ≤1366px renders the drawer layout — navTo() in e2e/helpers.js opens it.
    { name: 'tablet', use: { viewport: { width: 1280, height: 800 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm --prefix ../backend run local:test',
    // Wait for the backend, not Vite: Vite is up in <1s while the backend is still
    // booting, and an early sign-in fails. 401 counts as ready for Playwright.
    url: 'http://localhost:3000/api/auth/me',
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
