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
  // "Add new account" renders in both the empty and the account-list views.
  await popup.getByRole('button', { name: 'Add new account' }).waitFor();

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

export async function intakePallet(page, palletNumber, { boxes = 40, size = 'L' } = {}) {
  await page.getByRole('link', { name: 'קליטה' }).click();
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
