// CR#1: pick a shipment date once and apply it to every selected pallet (even unweighed ones),
// persisted through the narrow shipmentDate endpoint and pushed live to other clients.
import { test, expect } from '@playwright/test';
import { SECOND_ADMIN_EMAIL, navTo, signIn, intakePallet, rowByPallet, uniquePalletNumber } from './helpers.js';

test('"apply to all" stamps one shipment date on the selected pallets', async ({ browser }) => {
  const p1 = uniquePalletNumber();
  const p2 = p1 + 1;
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();

  await signIn(a);
  await signIn(b, SECOND_ADMIN_EMAIL);
  await intakePallet(a, p1);
  await intakePallet(a, p2);
  await navTo(a, 'טבלת נתונים');
  await navTo(b, 'טבלת נתונים');
  await expect(rowByPallet(b, p2)).toHaveCount(1);

  const apply = a.getByRole('button', { name: 'החל על הכל', exact: true });
  const dateInput = a.getByLabel('תאריך משלוח לכל הנבחרים');
  await expect(apply).toBeDisabled();

  const check = (p) => rowByPallet(a, p).locator('td[data-col="selected"] input[type="checkbox"]');
  await check(p1).check();
  await check(p2).check();
  await expect(apply).toBeEnabled();
  await dateInput.fill('2026-11-05');
  await apply.click();
  await expect(a.getByText(/האם לקבוע תאריך משלוח 2026-11-05 ל-2 משטחים/)).toBeVisible();
  await a.getByRole('button', { name: 'אשר' }).click();

  for (const p of [p1, p2]) {
    await expect(rowByPallet(a, p).locator('td[data-col="shipmentDate"]')).toContainText('2026-11-05');
  }
  // Other client gets it live
  await expect(rowByPallet(b, p1).locator('td[data-col="shipmentDate"]')).toContainText('2026-11-05');

  // Persisted
  await a.reload();
  await expect(rowByPallet(a, p2).locator('td[data-col="shipmentDate"]')).toContainText('2026-11-05');
});
