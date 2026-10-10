// Task 31: the Dashboard lists unsent pallets older than N days from harvest — only when enabled
// in Settings (off by default). The seeded pallet 1 was harvested 2026-07-25 and is unsent.
import { test, expect } from '@playwright/test';
import { navTo, signIn, FARMER } from './helpers.js';

async function setStale(page, enabled) {
  await navTo(page, 'ניהול הגדרות');
  const section = page.getByTestId('checks-settings');
  const toggle = section.getByRole('checkbox');
  if (enabled) await toggle.check(); else await toggle.uncheck();
  await section.getByLabel('ימים מהקטיף').fill('3');
  await section.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText('הבדיקות והתזכורות נשמרו')).toBeVisible();
}

test('stale pallets appear on the Dashboard only when enabled', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  await expect(page.getByTestId('stale-pallets')).toHaveCount(0); // off by default

  await setStale(page, true);
  await navTo(page, 'לוח בקרה');
  const card = page.getByTestId('stale-pallets');
  await expect(card).toContainText('ממתינים יותר מ-3 ימים מהקטיף');
  await expect(card.getByRole('button').filter({ hasText: FARMER }).filter({ hasText: 'משטח 1' })).toBeVisible();

  // Clicking a pallet opens shipment prep for that farmer
  await card.getByRole('button').filter({ hasText: 'משטח 1' }).first().click();
  await expect(page).toHaveURL(/\/Destination/);

  await setStale(page, false);
  await navTo(page, 'לוח בקרה');
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  await expect(page.getByTestId('stale-pallets')).toHaveCount(0);
});
