// Delete a pallet from the table (edit mode → מחק → confirm), then restore it from Settings.
import { test, expect } from '@playwright/test';
import { FARMER, navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber } from './helpers.js';

test('delete a pallet and restore it from Settings', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);

  await editRow(page, pallet);
  await page.getByRole('button', { name: 'מחק', exact: true }).click();
  await page.getByRole('button', { name: 'מחק משטח' }).click();
  await expect(rowByPallet(page, pallet)).toHaveCount(0);

  await navTo(page, 'ניהול הגדרות');
  await page.getByLabel('חקלאי למשטחים שנמחקו').selectOption(FARMER);
  await page.getByRole('button', { name: `שחזר משטח ${pallet}` }).click();
  await expect(page.getByText(`המשטח ${pallet} שוחזר`)).toBeVisible();

  await navTo(page, 'טבלת נתונים');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);
});
