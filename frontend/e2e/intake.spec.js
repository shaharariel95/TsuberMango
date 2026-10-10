// Intake form rules: no shipment-date field; mandatory fields validated client-side.
import { test, expect } from '@playwright/test';
import { navTo, signIn, uniquePalletNumber } from './helpers.js';

test('intake has no shipment date and rejects missing mandatory fields', async ({ page }) => {
  await signIn(page);
  await navTo(page, 'קליטה');
  const form = page.locator('form');
  await expect(form).toBeVisible();

  // CR#2: shipment date is gone from the intake form.
  await expect(form.getByText('תאריך משלוח')).toHaveCount(0);
  await expect(form.getByText('תאריך קטיף')).toHaveCount(1);

  // Pallet number + boxes filled, but no kind/size and an emptied harvest date.
  await form.locator('input[type="number"]').nth(0).fill(String(uniquePalletNumber()));
  await form.locator('input[type="number"]').nth(1).fill('40');
  await form.locator('input[type="date"]').fill('');
  await page.getByRole('button', { name: 'הוסף' }).click();

  const alert = page.getByText(/שדות חובה חסרים:/);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('תאריך קטיף');
  await expect(alert).toContainText('זן');
  await expect(alert).toContainText('גודל');
  await expect(alert).not.toContainText('ארגזים');
  await page.getByRole('button', { name: 'הבנתי' }).click();
  await expect(page.getByText('הנתונים נשלחו בהצלחה')).toHaveCount(0);
});
