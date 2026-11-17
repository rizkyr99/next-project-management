import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** P4.2: 404s explain themselves and actions never crash into a raw error screen. */

test('unknown pages show the Tide 404 (logged-out visitors are sent to log in first)', async ({ page }) => {
  await page.goto('/definitely-not-a-page');
  await expect(page).toHaveURL(/\/login\?callbackURL=%2Fdefinitely-not-a-page$/);

  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `nf+${s}@example.com`, 'Nia');
  const res = await page.goto('/definitely-not-a-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page could not be found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Tide' })).toHaveAttribute('href', '/');
});

test('a missing project shows the in-app 404 and an expired session gives a message, not a crash', async ({ page, context }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `err+${s}@example.com`, 'Erin');
  const slug = `err-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Err WS ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  // Inside the workspace shell, with a way back.
  await page.goto(`/workspaces/${slug}/projects/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole('heading', { name: 'This page could not be found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to workspace' }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`));

  // The session disappears while the page is open (expired, or signed out elsewhere).
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('After expiry');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Your session has expired. Log in again to continue.')).toBeVisible();
  await expect(page.getByText(/An error occurred in the Server Components render/)).toHaveCount(0);
});
