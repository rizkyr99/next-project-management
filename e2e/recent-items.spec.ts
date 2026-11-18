import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('⌘K lists recently opened tasks and projects before typing', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `recent+${s}@example.com`, 'Remy Recent');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Recent ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`recent-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/recent-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Spring campaign');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await addTask(page, 'To Do', 'Poster draft');
  await page.getByRole('button', { name: 'Open task Poster draft' }).click();
  await expect(page.getByRole('dialog', { name: 'Poster draft' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Somewhere else, open ⌘K: the task (newest) and the project are listed.
  await page.goto(`/workspaces/recent-${s}/activity`);
  await page.waitForTimeout(1000);
  await page.keyboard.press('ControlOrMeta+k');
  const recent = page.getByRole('group', { name: 'Recent' });
  await expect(recent.getByRole('option').first()).toContainText('Poster draft');
  await expect(recent.getByRole('option', { name: /Spring campaign\s*Project/ })).toBeVisible();

  // Choosing it opens the task.
  await recent.getByRole('option', { name: /Poster draft/ }).click();
  await expect(page.getByRole('dialog', { name: 'Poster draft' })).toBeVisible({ timeout: 15000 });

  // Typing hides recent items (search takes over).
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('pos');
  await expect(page.getByRole('group', { name: 'Recent' })).toHaveCount(0);
});
