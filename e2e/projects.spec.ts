import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** P2.1: rename and delete projects from the project header and the sidebar. */

test('rename and delete a project without reloading', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `proj+${stamp}@example.com`, 'Project Owner');

  const slug = `proj-${stamp}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Proj WS ${stamp}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15000 });
  const projectUrl = page.url();

  const sidebar = page.locator('[data-sidebar="sidebar"]').first();
  await expect(sidebar.getByRole('link', { name: 'Website' })).toBeVisible();

  // Rename from the header menu. A marker on window proves there's no full reload.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit project' });
  await dialog.getByLabel('Name').fill('Website Redesign');
  await dialog.getByLabel('Description').fill('Q3 marketing site refresh');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Website Redesign' })).toBeVisible();
  await expect(page.getByText('Q3 marketing site refresh')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Website Redesign' })).toBeVisible();
  await expect(page).toHaveTitle(/^Website Redesign · /);
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // Delete from the sidebar menu: type-the-name confirmation, then redirect home.
  await sidebar.getByRole('listitem').filter({ hasText: 'Website Redesign' }).hover();
  await sidebar.getByRole('button', { name: 'Website Redesign options' }).click();
  await page.getByRole('menuitem', { name: 'Delete project' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete project' });
  const deleteButton = confirm.getByRole('button', { name: 'Delete project' });
  await expect(deleteButton).toBeDisabled();
  await confirm.getByLabel(/Type .* to confirm/).fill('Website Redesign');
  await deleteButton.click();

  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await expect(sidebar.getByRole('link', { name: 'Website Redesign' })).toHaveCount(0);
  // The workspace's own "Getting started" project is still there (P4.3).
  await expect(sidebar.getByRole('link', { name: 'Getting started' })).toBeVisible();

  // The old URL is gone.
  await page.goto(projectUrl);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
