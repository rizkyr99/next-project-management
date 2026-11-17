import { test, expect } from '@playwright/test';

test('redirects unauthenticated users to login from app pages', async ({ page }) => {
  // `/` is the public landing page (P4.1); app pages still require a session.
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login\?callbackURL=%2Fnotifications$/);
});

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
});
