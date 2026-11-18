import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('switching between board, list and table is instant and needs no server request', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `views+${s}@example.com`, 'Vic Views');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Views ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`views-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/views-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Views');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectPath = new URL(page.url()).pathname;
  await expect(page.getByTestId('column-To Do')).toBeVisible({ timeout: 15000 });
  await addTask(page, 'To Do', 'Write the brief');
  // Let the live stream's first poll and the refresh after adding settle.
  await page.waitForTimeout(6000);

  // Any request for this page's server data would mean a round trip.
  const pageRequests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === projectPath && r.headers()['rsc'] === '1') pageRequests.push(r.url());
  });

  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('column-To Do')).toHaveCount(0, { timeout: 1000 });
  await expect(page.getByText('Write the brief')).toBeVisible({ timeout: 1000 });

  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole('table').getByText('Write the brief')).toBeVisible();

  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.getByTestId('column-To Do')).toBeVisible({ timeout: 2000 });

  expect(pageRequests).toEqual([]);

  // The view is in the URL, so a reload or a shared link opens it.
  await page.getByRole('button', { name: 'Table' }).click();
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
});
