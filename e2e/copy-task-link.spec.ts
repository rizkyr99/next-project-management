import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('copy a link to a task, and the link opens that task', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `link+${s}@example.com`, 'Lina Link');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Link ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`link-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/link-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Links');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await addTask(page, 'To Do', 'Logo options');

  // Copy from the sheet while the list view and a filter are on: the link is just the task.
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.getByRole('button', { name: 'Logo options', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Logo options' });
  await sheet.getByRole('button', { name: 'Copy link to task' }).click();
  await expect(sheet.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(page.getByText('Link copied').first()).toBeVisible();

  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/projects\/[0-9a-f-]{36}\?task=[0-9a-f-]{36}$/);
  expect(link).not.toContain('view=');

  await page.goto('/');
  await page.goto(link);
  await expect(page.getByRole('dialog', { name: 'Logo options' })).toBeVisible({ timeout: 15000 });
});
