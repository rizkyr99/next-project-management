import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('collapse a column into a strip, remembered after a reload, and expand it again', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `fold+${s}@example.com`, 'Flo Fold');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Fold ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`fold-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/fold-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Fold');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await addTask(page, 'Done', 'Launched');

  const done = page.getByTestId('column-Done');
  await page.getByRole('button', { name: 'Column Done options' }).click();
  await page.getByRole('menuitem', { name: 'Collapse column' }).click();

  await expect(done).toHaveAttribute('data-collapsed', '');
  await expect(done.getByRole('button', { name: 'Expand column Done' })).toBeVisible();
  await expect(done).toContainText('1');
  await expect(page.getByRole('button', { name: 'Open task Launched' })).toHaveCount(0);
  // Other columns are untouched.
  await expect(page.getByTestId('column-To Do')).not.toHaveAttribute('data-collapsed', '');

  await page.reload();
  await expect(page.getByTestId('column-Done')).toHaveAttribute('data-collapsed', '', { timeout: 15000 });

  await page.getByRole('button', { name: 'Expand column Done' }).click();
  await expect(page.getByTestId('column-Done')).not.toHaveAttribute('data-collapsed', '');
  await expect(page.getByRole('button', { name: 'Open task Launched' })).toBeVisible();
});
