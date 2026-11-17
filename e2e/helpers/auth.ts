import { Page } from '@playwright/test';

export async function registerAndLogin(
  page: Page,
  email: string,
  name = 'Test User',
  password = 'password123',
) {
  // Each simulated user gets its own client IP (RFC 2544 benchmarking range),
  // so a full suite's sign-ups don't add up against the real per-IP sign-up
  // limit (20/min). Locally the app trusts x-real-ip; on Vercel the platform
  // overwrites it with the real client IP, so this can't bypass production limits.
  await page.setExtraHTTPHeaders({
    'x-real-ip': `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`,
  });
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
