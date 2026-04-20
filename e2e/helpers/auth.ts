import { Page } from '@playwright/test';

export async function registerAndLogin(
  page: Page,
  email: string,
  name = 'Test User',
  password = 'password123',
) {
  await page.goto('/register');
  await page.getByPlaceholder('Enter your email').fill(email);
  await page.getByPlaceholder('Enter your name').fill(name);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /register/i }).click();
  // wait for the auth API call to complete, then for the redirect chain: / → /create-workspace
  await page.waitForURL(/\/(create-workspace|workspaces|\s*)$/, { timeout: 15000 });
  if (page.url().endsWith('/')) {
    await page.waitForURL(/\/(create-workspace|workspaces)/, { timeout: 10000 });
  }
}
