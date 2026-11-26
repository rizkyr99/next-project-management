import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

/** B4: a task's start date makes a range on the card and in the table, and the pickers keep it in order. */

/** The calendar's button for a day of the month shown (its data-day is the browser's en-US date). */
const popovers = (page: Page) => page.locator('[data-radix-popper-content-wrapper]');
const day = (page: Page, d: Date) => page.locator(`button[data-day="${d.toLocaleDateString('en-US')}"]:visible`);

test('set a start date: the card shows the range, the pickers keep it in order, the table has a Start column', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `sd+${s}@example.com`, 'Sam Start');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Start ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`sd-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/sd-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await addTask(page, 'To Do', 'Design');

  // Both days in the month the pickers open on.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 10);
  const due = new Date(now.getFullYear(), now.getMonth(), 20);
  const label = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  await page.getByRole('button', { name: 'Open task Design' }).click();
  const sheet = page.getByRole('dialog', { name: 'Design' });
  await sheet.getByRole('button', { name: 'Start date' }).click();
  await day(page, start).click();
  await expect(sheet.getByRole('button', { name: 'Start date' })).toHaveText(label(start));
  await expect(popovers(page)).toHaveCount(0);

  // The due picker won't go before the start.
  await sheet.getByRole('button', { name: 'Pick a date' }).click();
  await expect(day(page, new Date(now.getFullYear(), now.getMonth(), 5))).toBeDisabled();
  await day(page, due).click();
  // Picking a day (no time) closes the picker; let it finish closing before opening the next.
  await expect(sheet.getByRole('button', { name: label(due) })).toBeVisible();
  await expect(popovers(page)).toHaveCount(0);
  // And the start picker won't go after the due day.
  await sheet.getByRole('button', { name: 'Start date' }).click();
  await expect(day(page, new Date(now.getFullYear(), now.getMonth(), 25))).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  const card = page.getByRole('button', { name: 'Open task Design' });
  await expect(card).toContainText(`${label(start)} – ${label(due)}`, { timeout: 15000 });

  // Saved, and in the table.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open task Design' })).toContainText(`${label(start)} –`, {
    timeout: 15000,
  });
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Start' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('row', { name: /Design/ })).toContainText(label(start));
});
