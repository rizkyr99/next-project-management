import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('activity can be filtered by project and person, and the filter is in the URL', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `act+${s}@example.com`, 'Ari Activity');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Act ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`act-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/act-${s}$`), { timeout: 15000 });

  for (const [name, task] of [['Website', 'Hero banner'], ['Brand', 'Logo sketches']] as const) {
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await addTask(page, 'To Do', task);
  }

  await page.goto(`/workspaces/act-${s}/activity`);
  const feed = page.getByRole('main');
  await expect(feed.getByText('Hero banner').first()).toBeVisible({ timeout: 15000 });
  await expect(feed.getByText('Logo sketches').first()).toBeVisible();

  // One project.
  await page.getByRole('combobox', { name: 'Project' }).click();
  await page.getByRole('option', { name: 'Website' }).click();
  await expect(page).toHaveURL(/[?&]project=[0-9a-f-]{36}/);
  await expect(feed.getByText('Logo sketches')).toHaveCount(0, { timeout: 15000 });
  await expect(feed.getByText('Hero banner').first()).toBeVisible();

  // Shareable: a reload keeps it.
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveText('Website');
  await expect(feed.getByText('Logo sketches')).toHaveCount(0);

  // By person, across all projects.
  await page.getByRole('combobox', { name: 'Project' }).click();
  await page.getByRole('option', { name: 'All projects' }).click();
  await page.getByRole('combobox', { name: 'Person' }).click();
  await page.getByRole('option', { name: 'Ari Activity' }).click();
  await expect(page).toHaveURL(/[?&]person=/);
  await expect(feed.getByText('Logo sketches').first()).toBeVisible({ timeout: 15000 });
  await expect(page).not.toHaveURL(/[?&]project=/);
});
