// Fridge map: place / move / clear (tap and drag), live updates on a second client, and the red "sent" flag.
import { test, expect } from '@playwright/test';
import { SECOND_ADMIN_EMAIL, DESTINATION, signIn, navTo, intakePallet, editRow, uniquePalletNumber,
  openFridge, slotOf, placeOnFirstEmpty, clearSlot, pickButton, dragTo } from './helpers.js';

test('place, move and clear a pallet', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await openFridge(page);

  const from = await placeOnFirstEmpty(page, pallet);
  await expect(slotOf(page, from)).toHaveAttribute('data-status', 'ok');
  // Placed pallets leave the pick list.
  await expect(pickButton(page, pallet)).toHaveCount(0);

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

test('drag place, drag move, drag to remove', async ({ page }) => {
  const pallet = uniquePalletNumber();
  await signIn(page);
  await intakePallet(page, pallet);
  await openFridge(page);

  // List entry -> first empty slot (all-farmers view, filtered by number).
  await page.getByLabel('חיפוש משטח').fill(String(pallet));
  const first = page.locator('[data-slot][data-state="empty"]').first();
  const from = await first.getAttribute('data-slot');
  await dragTo(page, pickButton(page, pallet), first);
  await expect(slotOf(page, from)).toContainText(String(pallet));
  await expect(pickButton(page, pallet)).toHaveCount(0);
  // The drag must not also fire the tap (no detail sheet).
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Slot -> another empty slot.
  const second = page.locator('[data-slot][data-state="empty"]').first();
  const to = await second.getAttribute('data-slot');
  await dragTo(page, slotOf(page, from), second);
  await expect(slotOf(page, to)).toContainText(String(pallet));
  await expect(slotOf(page, from)).toHaveAttribute('data-state', 'empty');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Slot -> remove zone (appears over the side panel once the drag starts), confirm.
  const s = await slotOf(page, to).boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 15, s.y + s.height / 2 + 15, { steps: 4 });
  const zone = page.locator('[data-drop="remove"]');
  await expect(zone).toBeVisible();
  const z = await zone.boundingBox();
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(slotOf(page, to)).toHaveAttribute('data-state', 'empty');
  await expect(zone).toHaveCount(0);
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
