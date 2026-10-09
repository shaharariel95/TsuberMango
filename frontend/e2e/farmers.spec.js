// Settings: add, hide and restore a farmer. Hidden farmers leave the sidebar farmer selector
// but keep their data (verified by the API tests).
import { test, expect } from '@playwright/test';
import { navTo, signIn } from './helpers.js';

test('settings: add, hide and restore a farmer', async ({ page }) => {
  const name = `חקלאי-${Date.now() % 1000000}`;
  const option = page.locator(`select:not([aria-label="חקלאי למשטחים שנמחקו"]) option[value="${name}"]`);
  await signIn(page);
  await navTo(page, 'ניהול הגדרות');

  await page.getByPlaceholder('שם חקלאי חדש').fill(name);
  await page.getByRole('button', { name: '+ הוסף חקלאי' }).click();
  await expect(option).toHaveCount(1);

  await page.getByRole('button', { name: `הסתר ${name}` }).click();
  await page.getByRole('button', { name: 'הסתר', exact: true }).click();
  await expect(option).toHaveCount(0);

  await page.getByText(/^חקלאים מוסתרים/).click();
  await page.getByRole('button', { name: `שחזר ${name}` }).click();
  await expect(option).toHaveCount(1);
});
