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

async function issueOne(page, pallet) {
  await preparePallet(page, pallet);
  await rowByPallet(page, pallet).locator('td[data-col="selected"] input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'צור תעודת משלוח' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  const cell = rowByPallet(page, pallet).locator('td[data-col="cardId"]');
  await expect(cell).toHaveText(/^\d+$/);
  return (await cell.textContent()).trim();
}

test('certificates screen: list, history after reprint, remove pallet, export', async ({ page }) => {
  await stubPrinting(page);
  const pallet = uniquePalletNumber();
  await signIn(page);
  const number = await issueOne(page, pallet);

  await navTo(page, 'טבלת נתונים');
  // Correct the weight, then reprint from the certificates screen -> version 2
  // (task 5 CR#3: the "already sent / certified" confirm appears when opening the editor)
  await rowByPallet(page, pallet).getByRole('button', { name: 'ערוך' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  const editor = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'שמור' }) });
  await editor.locator('td[data-col="weight"] input').fill('490');
  await editor.getByRole('button', { name: 'שמור' }).click();
  await expect(rowByPallet(page, pallet).locator('td[data-col="weight"]')).toHaveText('490');

  await navTo(page, 'תעודות');
  const certRow = page.locator('tr[data-certificate]', { hasText: number });
  await expect(certRow).toBeVisible();
  await certRow.getByRole('button', { name: 'הדפס' }).click();
  await expect(certRow.locator('[data-col="version"]')).toHaveText('2');

  // Expand -> pallets; history lists both versions
  await certRow.getByRole('button', { name: 'פרטים' }).click();
  await expect(page.getByText('גרסה 1')).toBeVisible();
  await expect(page.getByText('גרסה 2')).toBeVisible();

  // Excel export downloads a file
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא לאקסל' }).click();
  expect((await download).suggestedFilename()).toMatch(/^תעודות-.*\.xlsx$/);

  // Remove the pallet -> certificate cancelled, pallet back in shipment prep
  await page.getByRole('button', { name: 'הסר מתעודה' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(certRow.locator('[data-col="status"]')).toHaveText('מבוטלת');
  // Expanded row survives the reload, and the remove action is gone for a cancelled certificate
  await expect(page.getByText('גרסה 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'הסר מתעודה' })).toHaveCount(0);
  await navTo(page, 'הכנה למשלוח');
  await expect(rowByPallet(page, pallet)).toHaveCount(1);
});

test('settings: edit certificate details per farmer, reject a lower number, season export', async ({ page }) => {
  await stubPrinting(page);
  await signIn(page);
  await navTo(page, 'ניהול הגדרות');
  await page.getByRole('button', { name: 'פרטי תעודה' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'פרטי תעודה' });
  await expect(dialog.getByLabel('שורת כותרת 1')).toHaveValue(/^חקלאי טסט/); // the second project sees the first project's edit
  await dialog.getByLabel('שורת כותרת 1').fill('חקלאי טסט מעודכן');
  await dialog.getByLabel('מספר התעודה הבא').fill('1');
  await dialog.getByRole('button', { name: 'שמור' }).click();
  // Either saved (nothing issued yet) or rejected - both must be explicit
  await expect(dialog.getByText(/נשמר|חייב להיות גדול/)).toBeVisible();
  // Unique, growing number: always above anything issued by earlier tests/projects
  await dialog.getByLabel('מספר התעודה הבא').fill(String(Math.floor(Date.now() / 1000)));
  await dialog.getByRole('button', { name: 'שמור' }).click();
  await expect(dialog.getByText('נשמר', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'תצוגה מקדימה' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  await dialog.getByRole('button', { name: 'סגור' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא נתוני עונה' }).click();
  expect((await download).suggestedFilename()).toMatch(/^נתוני-עונה-.*\.xlsx$/);
});
