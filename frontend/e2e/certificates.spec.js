import { test, expect } from '@playwright/test';
import { navTo, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber, DESTINATION } from './helpers.js';

// Capture the generated PDF instead of a real share sheet / new tab.
async function stubPrinting(page, { failShare = false } = {}) {
  await page.addInitScript((failShare) => {
    window.__printed = [];
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => {
      if (failShare) throw new Error('share blocked');
      window.__printed.push(files[0].name);
    };
  }, failShare);
}

// Intake + weigh + destination + date, then mark for shipment and open the prep page.
export async function preparePallet(page, pallet) {
  await intakePallet(page, pallet);
  await navTo(page, 'טבלת נתונים');
  const editor = await editRow(page, pallet);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2026-12-01');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('480');
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'העבר למשלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await navTo(page, 'הכנה למשלוח');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);
}

test('issue a certificate from shipment prep: confirm shows split, PDF printed, row stamped', async ({ page }) => {
  await stubPrinting(page);
  const pallet = uniquePalletNumber();
  await signIn(page);
  await preparePallet(page, pallet);
  const row = rowByPallet(page, pallet);
  await row.locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await expect(page.getByText('תיווצר תעודה אחת')).toBeVisible();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  await expect(row.locator('td[data-col="cardId"]')).toHaveText(/^\d+$/);
  await expect(row.locator('td[data-col="cardId"] a')).toHaveAttribute('href', /\/Certificates\?/);
});

test('a failed print still keeps the certificate and says where to reprint', async ({ page }) => {
  await stubPrinting(page, { failShare: true });
  const pallet = uniquePalletNumber();
  await signIn(page);
  await preparePallet(page, pallet);
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(page.getByText(/התעודה נשמרה/)).toBeVisible();
  await page.getByRole('button', { name: 'הבנתי' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="cardId"]')).toHaveText(/^\d+$/);
});
