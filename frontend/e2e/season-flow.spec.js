// The core season workflow, end to end through the real UI:
// intake → weigh + destination → mark for shipment → certificate.
import { test, expect } from '@playwright/test';
import { navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber, DESTINATION } from './helpers.js';

test('intake → weigh → mark for shipment → certificate', async ({ page }) => {
  await page.addInitScript(() => { navigator.canShare = () => true; navigator.share = async () => {}; });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  const pallet = uniquePalletNumber();

  await signIn(page);
  await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

  // Intake
  await intakePallet(page, pallet);

  // Weigh + destination + shipment date on the data table
  await navTo(page, 'טבלת נתונים');
  const row = rowByPallet(page, pallet);
  await expect(row).toHaveCount(1);
  const editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2026-10-09');
  await editor.getByRole('button', { name: 'שמור' }).click();

  await expect(row.locator('td[data-col="weight"]')).toHaveText('480');
  await expect(row.locator('td[data-col="destination"]')).toHaveText(DESTINATION);
  // Regression: an empty certificate number must not turn into "0" after save.
  await expect(row.locator('td[data-col="cardId"]')).toHaveText('');

  // Mark for shipment (confirm dialog)
  await row.locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'העבר למשלוח' }).click();
  await expect(page.getByText('אישור פעולה')).toBeVisible();
  await page.getByRole('button', { name: 'אשר' }).click();

  // Shows up on the shipment-prep page
  await navTo(page, 'הכנה למשלוח');
  const prepRow = rowByPallet(page, pallet);
  await expect(prepRow).toHaveCount(1);

  // Data survives a reload (it's in Firestore, not just local state)
  await page.reload();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('480');

  // Issue the certificate (print is stubbed): the cardId cell becomes a number
  await prepRow.locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(prepRow.locator('td[data-col="cardId"]')).toHaveText(/^\d+$/);

  // Dashboard reflects the new pallet
  await navTo(page, 'לוח בקרה');
  await expect(page.getByText(`משטח ${pallet}`)).toBeVisible();

  expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
});
