import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('urgent priority, due time, comment reactions and favourite projects', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `b2+${s}@example.com`, 'Bea Batch');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`B2 ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`b2-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/b2-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Client site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Client site' })).toBeVisible();
  await addTask(page, 'To Do', 'Launch checklist');

  const card = page.getByRole('button', { name: 'Open task Launch checklist' });
  await card.click();
  const sheet = page.getByRole('dialog', { name: 'Launch checklist' });

  // Urgent priority.
  await sheet.getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'Urgent' }).click();
  await expect(sheet.getByRole('combobox', { name: 'Priority' })).toContainText('Urgent');

  // A due date with a time.
  await sheet.getByRole('button', { name: 'Pick a date' }).click();
  await page.getByRole('gridcell').filter({ hasNot: page.locator('[disabled]') }).getByRole('button').last().click();
  await page.getByLabel('Due time').fill('15:30');
  await expect(sheet.getByRole('button', { name: /, 3:30 PM$/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // A comment, then a reaction on it, then taking it back.
  const box = sheet.getByPlaceholder(/add a comment/i);
  await box.fill('Ready for review');
  await box.press('Enter');
  await expect(sheet.getByText('Ready for review')).toBeVisible();
  await sheet.getByRole('button', { name: 'Add reaction' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  const chip = sheet.getByRole('button', { name: /^Done: 1\./ });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1500); // saved
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Launch checklist' }).getByRole('button', { name: /^Done: 1\./ })).toBeVisible({ timeout: 15000 });
  await page.getByRole('dialog', { name: 'Launch checklist' }).getByRole('button', { name: /^Done: 1\./ }).click();
  await expect(page.getByRole('dialog', { name: 'Launch checklist' }).getByRole('button', { name: /^Done: / })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The card shows the urgent badge and the time (both saved).
  await expect(card).toContainText('Urgent');
  await expect(card).toContainText('3:30 PM');

  // Favourite: a Favourites group appears at the top of the sidebar.
  await page.getByRole('button', { name: 'Client site options' }).click();
  await page.getByRole('menuitem', { name: 'Add to favourites' }).click();
  const favourites = page.getByRole('list', { name: 'Favourite projects' });
  await expect(favourites.getByRole('link', { name: 'Client site' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('list', { name: 'Projects', exact: true }).getByRole('link', { name: 'Client site' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Favourite projects' }).getByRole('link', { name: 'Client site' })).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Client site options' }).click();
  await page.getByRole('menuitem', { name: 'Remove from favourites' }).click();
  await expect(page.getByRole('list', { name: 'Favourite projects' })).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByRole('list', { name: 'Projects', exact: true }).getByRole('link', { name: 'Client site' })).toBeVisible();
});
