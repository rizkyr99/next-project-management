import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** B7 project details, and B6 archive / restore (header, sidebar, Archived page, Undo). */
test('project details, then archive and restore a project', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `arc+${s}@example.com`, 'Ari Archive');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Arc ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`arc-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/arc-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Brand refresh');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Brand refresh' })).toBeVisible();
  const projectUrl = page.url();

  const sidebar = page.locator('[data-sidebar="sidebar"]').first();
  const projectsList = sidebar.getByRole('list', { name: 'Projects' });

  // Details: client, deadline and status show under the title.
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit project' });
  await dialog.getByLabel('Client').fill('Acme Co');
  await dialog.getByLabel('Deadline').fill('2030-01-15');
  await dialog.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'At risk' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const header = page.locator('main');
  await expect(header.getByText('Acme Co')).toBeVisible();
  await expect(header.getByText('At risk')).toBeVisible();
  await expect(header.getByText('Due Jan 15, 2030')).toBeVisible();

  // Editing from the sidebar keeps the details (the dialog starts from them).
  await projectsList.getByRole('listitem').filter({ hasText: 'Brand refresh' }).hover();
  await sidebar.getByRole('button', { name: 'Brand refresh options' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  await expect(dialog.getByLabel('Client')).toHaveValue('Acme Co');
  await expect(dialog.getByLabel('Deadline')).toHaveValue('2030-01-15');
  await page.keyboard.press('Escape');

  // Archive from the header: a banner, gone from the sidebar, counted under Archived.
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Archive project' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible();
  await expect(projectsList.getByRole('link', { name: 'Brand refresh' })).toHaveCount(0);
  const archivedLink = sidebar.getByRole('link', { name: /^Archived/ });
  await expect(archivedLink).toContainText('1');

  // The Archived page lists it; Restore brings it back.
  await archivedLink.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Archived projects' })).toBeVisible();
  const archivedList = page.getByRole('list', { name: 'Archived projects' });
  await expect(archivedList.getByRole('link', { name: 'Brand refresh' })).toBeVisible();
  await expect(archivedList).toContainText('Acme Co');
  await archivedList.getByRole('button', { name: 'Restore Brand refresh' }).click();
  await expect(projectsList.getByRole('link', { name: 'Brand refresh' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Nothing archived')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Archived/ })).toHaveCount(0);

  // Archive from the sidebar, then Undo from the toast.
  await projectsList.getByRole('listitem').filter({ hasText: 'Brand refresh' }).hover();
  await sidebar.getByRole('button', { name: 'Brand refresh options' }).click();
  await page.getByRole('menuitem', { name: 'Archive project' }).click();
  await expect(projectsList.getByRole('link', { name: 'Brand refresh' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(projectsList.getByRole('link', { name: 'Brand refresh' })).toBeVisible({ timeout: 15000 });

  // Restored for real: the project page has no banner.
  await page.goto(projectUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Brand refresh' })).toBeVisible();
  await expect(page.getByText('This project is archived')).toHaveCount(0);
});
