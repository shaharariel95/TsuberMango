import { expect } from '@playwright/test';

// Seeded by `npm run seed:test` in backend/ as an admin of centers/test.
export const ADMIN_EMAIL = 'e2e-admin@test.local';
export const SECOND_ADMIN_EMAIL = 'e2e-admin-2@test.local';
export const FARMER = 'חקלאי-טסט';
export const KIND = 'טסט-זן';
export const DESTINATION = 'יעד-טסט';

// A pallet number unlikely to collide when reusing an already-running stack.
export const uniquePalletNumber = () => 1000 + (Date.now() % 900000);

// Sign in through the auth emulator's Google popup.
export async function signIn(page, email = ADMIN_EMAIL) {
  await page.goto('/login');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'התחבר עם Google' }).click();
  const popup = await popupPromise;
  // The emulator's account list is plain HTML, but its click handlers are wired by scripts
  // pulled from a CDN (unpkg). A click that lands before they finish loading is silently
  // dropped, the popup stays open and the app never gets a result (~1-2% of sign-ins).
  await popup.waitForLoadState('load');
  // The account list loads asynchronously: wait until it shows either some account
  // (an email) or the empty-state text before deciding which branch to take.
  await popup.getByText(/@|No Google\.com accounts exist/).first().waitFor();

  const existing = popup.getByText(email);
  if (await existing.count()) {
    await existing.first().click();
  } else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await popup.getByRole('textbox').first().fill(email);
    await popup.getByRole('button', { name: 'Sign in with Google.com' }).click();
  }
  await expect(page).toHaveURL(/\/Dashboard/);
}

export function rowByPallet(page, palletNumber) {
  return page.locator('tbody tr').filter({
    has: page.locator(`td[data-col="palletNumber"]`, { hasText: new RegExp(`^${palletNumber}$`) }),
  });
}

// 80 boxes keeps the weights the specs type (455–613 kg) inside the 4–9 kg/box check (task 26).
export async function intakePallet(page, palletNumber, { boxes = 80, size = 'L' } = {}) {
  await navTo(page, 'קליטה');
  await expect(page.getByRole('heading', { name: 'קליטה' })).toBeVisible();
  const form = page.locator('form');
  await form.locator('input[type="number"]').nth(0).fill(String(palletNumber));
  await form.locator('input[type="number"]').nth(1).fill(String(boxes));
  await form.getByText(KIND, { exact: true }).click();
  await form.getByText(size, { exact: true }).click();
  await page.getByRole('button', { name: 'הוסף' }).click();
  await expect(page.getByText('הנתונים נשלחו בהצלחה')).toBeVisible();
}

// Open the inline editor for a pallet row on a PalletTable page and return the row.
export async function editRow(page, palletNumber) {
  await rowByPallet(page, palletNumber).getByRole('button', { name: 'ערוך' }).click();
  return page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'שמור' }) });
}

// Navigate via the sidebar. At ≤1366px (tablet layout) the links live in a drawer
// that starts closed, so open it first via the ☰ button.
export async function navTo(page, label) {
  // The ☰ button only renders in the tablet layout; isVisible() on a link in the
  // closed drawer is unreliable (it is off-screen, not hidden).
  const menuButton = page.getByRole('button', { name: 'פתח תפריט' });
  if (await menuButton.isVisible()) await menuButton.click();
  const link = page.getByRole('link', { name: label });
  await expect(link).toBeInViewport();
  const href = await link.getAttribute('href');
  await link.click();
  // Wait for the route to commit: until then the previous page is still on screen, and an
  // immediate click lands on its (identical-looking) rows, which are then unmounted.
  if (href) await expect.poll(() => new URL(page.url()).pathname).toBe(href.split('?')[0]);
}

// --- Fridge map ---------------------------------------------------------------
export async function openFridge(page) {
  await navTo(page, 'מקרר');
  await expect(page.getByRole('heading', { name: 'מקרר' })).toBeVisible();
  await expect(page.locator('[data-slot]')).toHaveCount(40);
}

export const slotOf = (page, slot) => page.locator(`[data-slot="${slot}"]`);

// Pick the pallet in the side panel, tap the first empty slot; returns that slot id.
export async function placeOnFirstEmpty(page, palletNumber) {
  await page.getByLabel('חקלאי').selectOption(FARMER);
  await page.getByLabel('חיפוש משטח').fill(String(palletNumber));
  await page.locator(`button[data-pallet="${palletNumber}"]`).click();
  const empty = page.locator('[data-slot][data-state="empty"]').first();
  const slot = await empty.getAttribute('data-slot');
  await empty.click();
  await expect(slotOf(page, slot)).toContainText(String(palletNumber));
  return slot;
}

export async function clearSlot(page, slot) {
  await slotOf(page, slot).click();
  await page.getByRole('dialog').getByRole('button', { name: 'פנה תא' }).click();
  await page.getByRole('button', { name: 'אשר' }).click();
  await expect(slotOf(page, slot)).toHaveAttribute('data-state', 'empty');
}
