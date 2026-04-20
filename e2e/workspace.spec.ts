import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

test.describe('Workspace creation', () => {
  test('create-workspace page renders for authenticated user', async ({ page }) => {
    await registerAndLogin(page, `ws-render+${Date.now()}@example.com`);
    await page.goto('/create-workspace');
    await expect(page.getByRole('heading', { name: /create your workspace/i })).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await registerAndLogin(page, `ws-val+${Date.now()}@example.com`);
    await page.goto('/create-workspace');
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText(/workspace name is required/i)).toBeVisible();
    await expect(page.getByText(/workspace url is required/i)).toBeVisible();
  });

  test('shows error for invalid URL format', async ({ page }) => {
    await registerAndLogin(page, `ws-url+${Date.now()}@example.com`);
    await page.goto('/create-workspace');
    await page.getByPlaceholder('e.g. Tide Corp Design').fill('My Workspace');
    await page.getByPlaceholder('e.g. tide-corp-design').fill('Invalid URL!!');
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText(/lowercase letters, numbers, and hyphens/i)).toBeVisible();
  });

  test('successfully creates workspace and redirects', async ({ page }) => {
    await registerAndLogin(page, `ws-create+${Date.now()}@example.com`);
    await page.goto('/create-workspace');

    const slug = `test-ws-${Date.now()}`;
    await page.getByPlaceholder('e.g. Tide Corp Design').fill('Test Workspace');
    await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
    await page.getByRole('button', { name: /create workspace/i }).click();

    await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 10000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/create-workspace');
    await expect(page).toHaveURL(/\/login/);
  });
});
