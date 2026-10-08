// Live updates: a write on one client must reach another client without a reload
// (backend emits farmer_events → client onSnapshot, gated by the Firestore rules).
import { test, expect } from '@playwright/test';
import fs from 'fs';
import { SECOND_ADMIN_EMAIL, signIn, intakePallet, editRow, rowByPallet, uniquePalletNumber } from './helpers.js';

test('an edit on one client appears on another without reload', async ({ browser }) => {
  const pallet = uniquePalletNumber();
  // Two independent signed-in clients; newContext() does not inherit the config `use` block.
  const { baseURL, viewport, locale } = test.info().project.use;
  const a = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const b = await (await browser.newContext({ baseURL, viewport, locale })).newPage();
  const logs = [];
  b.on('console', m => logs.push(`${m.type()}: ${m.text()}`));

  try {
    await signIn(a);
    // A different user: clients deliberately ignore their own user's events (echo suppression).
    await signIn(b, SECOND_ADMIN_EMAIL);
    await intakePallet(a, pallet);

    await a.getByRole('link', { name: 'טבלת נתונים' }).click();
    await b.getByRole('link', { name: 'טבלת נתונים' }).click();
    await expect(rowByPallet(b, pallet)).toHaveCount(1);

    const editor = await editRow(a, pallet);
    await editor.locator('td[data-col="weight"] input').fill('512');
    await editor.getByRole('button', { name: 'שמור' }).click();

    await expect(rowByPallet(b, pallet).locator('td[data-col="weight"]')).toHaveText('512');
  } finally {
    fs.writeFileSync(test.info().outputPath('client-b-console.txt'), logs.join('\n'));
  }
});
