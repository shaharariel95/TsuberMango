// CR#3: a pallet that already left (sent) can still be edited, but only after an explicit confirmation.
import { test, expect } from '@playwright/test';
import { navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber, DESTINATION } from './helpers.js';

test('editing a sent pallet asks for confirmation first', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  const row = rowByPallet(page, pallet);
  await expect(row).toHaveCount(1);

  // Not sent yet: edit mode opens straight away (no dialog), then mark it as sent.
  const editor = await editRow(page, pallet);
  await expect(page.getByText('המשטח כבר יצא', { exact: true })).toHaveCount(0);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2026-10-09');
  await editor.locator('td[data-col="sent"] input[type="checkbox"]').check();
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(row.locator('td[data-col="weight"]')).toHaveText('480');

  // Sent: cancel keeps the row read-only.
  await row.getByRole('button', { name: 'ערוך' }).click();
  await expect(page.getByText('המשטח כבר יצא / הונפקה לו תעודה — לשנות בכל זאת?')).toBeVisible();
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('button', { name: 'שמור' })).toHaveCount(0);

  // Confirm: edit mode opens and the weight change is saved.
  await row.getByRole('button', { name: 'ערוך' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  const sentEditor = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'שמור' }) });
  await sentEditor.locator('td[data-col="weight"] input').fill('455');
  await sentEditor.getByRole('button', { name: 'שמור' }).click();
  await expect(row.locator('td[data-col="weight"]')).toHaveText('455');

  await page.reload();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('455');
});
