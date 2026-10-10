// Task 26: a weight per box outside the configured range (default 4–9 kg) asks before saving;
// shipment confirms list pallets that still have no weight.
import { test, expect } from '@playwright/test';
import { navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber } from './helpers.js';

test('an abnormal weight asks first; cancel keeps editing, confirm saves', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet, { boxes: 100 });
  await navTo(page, 'טבלת נתונים');

  // 1 kg on 100 boxes — the classic typo
  let editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('1');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText('המשקל נראה חריג: 0.0 ק״ג לארגז (טווח רגיל 4–9)')).toBeVisible();
  await page.getByRole('button', { name: 'ביטול', exact: true }).last().click(); // the dialog's, not the row's
  await expect(editor.locator('td[data-col="weight"] input')).toHaveValue('1'); // still editing

  await editor.locator('td[data-col="weight"] input').fill('1500');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(page.getByText(/15\.0 ק״ג לארגז/)).toBeVisible();
  await page.getByRole('button', { name: 'שמור בכל זאת' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('1500');

  // A normal weight saves with no question
  editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('600');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('600');
  await expect(page.getByText('משקל חריג')).toHaveCount(0);
});

test('marking for shipment lists the selected pallets without weight', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'העבר למשלוח' }).click();
  await expect(page.getByText(`שים לב: 1 משטחים ללא משקל (${pallet})`)).toBeVisible();
  await page.getByRole('button', { name: 'ביטול', exact: true }).last().click(); // the dialog's, not the row's
});
