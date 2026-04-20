import { test, expect } from '@playwright/test';

test.describe('Register', () => {
  test('register page renders', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: /register/i }).click();
    await expect(page.getByText(/invalid email address/i)).toBeVisible();
    await expect(page.getByText(/name is required/i)).toBeVisible();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test('shows error for short password', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your password').fill('short');
    await page.getByRole('button', { name: /register/i }).click();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test('navigates to login from register page', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('link', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful registration redirects to create-workspace', async ({ page }) => {
    const uniqueEmail = `test+${Date.now()}@example.com`;

    await page.goto('/register');
    await page.getByPlaceholder('Enter your email').fill(uniqueEmail);
    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: /register/i }).click();

    // registration redirects to / which then redirects to /create-workspace for new users
    await page.waitForURL(/\/(create-workspace|workspaces|\s*)$/, { timeout: 15000 });
    if (page.url().endsWith('/')) {
      await page.waitForURL(/\/(create-workspace|workspaces)/, { timeout: 10000 });
    }
    await expect(page).toHaveURL(/\/(create-workspace|workspaces)/);
  });
});
