// Fridge map: place / move / clear, live updates on a second client, and the red "sent" flag.
import { test, expect } from '@playwright/test';
import { SECOND_ADMIN_EMAIL, DESTINATION, signIn, navTo, intakePallet, editRow, uniquePalletNumber,
  openFridge, slotOf, placeOnFirstEmpty, clearSlot } from './helpers.js';

test('place, move and clear a pallet', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await openFridge(page);

  const from = await placeOnFirstEmpty(page, pallet);
  await expect(slotOf(page, from)).toHaveAttribute('data-status', 'ok');
  // Placed pallets leave the pick list.
  await expect(page.locator(`button[data-pallet="${pallet}"]`)).toHaveCount(0);

  await slotOf(page, from).click();
  await page.getByRole('dialog').getByRole('button', { name: 'העבר' }).click();
  const target = page.locator('[data-slot][data-state="empty"]').first();
  const to = await target.getAttribute('data-slot');
  await target.click();
  await expect(slotOf(page, to)).toContainText(String(pallet));
  await expect(slotOf(page, from)).toHaveAttribute('data-state', 'empty');

  await page.reload();
  await expect(slotOf(page, to)).toContainText(String(pallet));
  await clearSlot(page, to);
});

test('a placement appears on a second client without reload', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  await signIn(a);
  await signIn(b, SECOND_ADMIN_EMAIL);
  await intakePallet(a, pallet);
  await openFridge(a);
  await openFridge(b);

  const slot = await placeOnFirstEmpty(a, pallet);
  await expect(slotOf(b, slot)).toContainText(String(pallet));
  await clearSlot(a, slot);
  await expect(slotOf(b, slot)).toHaveAttribute('data-state', 'empty');
});

test('a pallet sent elsewhere turns its slot red live, and can be cleared', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  await signIn(a);
  await signIn(b, SECOND_ADMIN_EMAIL);
  await intakePallet(a, pallet);
  await openFridge(b);
  const slot = await placeOnFirstEmpty(b, pallet);

  // Mark it sent on client A (data table editor), while B keeps the fridge open.
  await navTo(a, 'טבלת נתונים');
  const editor = await editRow(a, pallet);
  await editor.locator('td[data-col="weight"] input').fill('480');
  await editor.locator('td[data-col="destination"] select').selectOption(DESTINATION);
  await editor.locator('td[data-col="shipmentDate"] input').fill('2027-05-10');
  await editor.locator('td[data-col="sent"] input[type="checkbox"]').check();
  await editor.getByRole('button', { name: 'שמור' }).click();

  await expect(slotOf(b, slot)).toHaveAttribute('data-status', 'sent');
  await expect(slotOf(b, slot)).toContainText('נשלח');
  await slotOf(b, slot).getByRole('button', { name: 'פנה תא' }).click();
  await b.getByRole('button', { name: 'אשר' }).click();
  await expect(slotOf(b, slot)).toHaveAttribute('data-state', 'empty');
});
