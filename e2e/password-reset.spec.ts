import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P3.1: forgot password → email link → new password. Test addresses never
 * get real mail, so the token is read from the verification table, exactly
 * as the emailed link would carry it.
 */

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Enter your email').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

test('reset a forgotten password and sign out other sessions', async ({ browser }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `reset+${s}@example.com`;

  // A session that's signed in elsewhere: it must be signed out by the reset.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerAndLogin(otherPage, email, 'Reset User');

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ 'x-real-ip': `198.18.200.${1 + Math.floor(Math.random() * 254)}` });

  // From the login page.
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  // Unknown addresses get exactly the same answer.
  await page.getByLabel('Email').fill(`nobody+${s}@example.com`);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(`If an account exists for nobody+${s}@example.com`);
  await page.getByRole('button', { name: 'Use a different email' }).click();

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(`If an account exists for ${email}`);

  const sql = await testDb();
  const [row] = await sql`
    select v.identifier from verification v join "user" u on u.id = v.value
    where u.email = ${email} and v.identifier like 'reset-password:%'`;
  expect(row).toBeDefined();
  const token = row.identifier.slice('reset-password:'.length);
  const link = `/api/auth/reset-password/${token}?callbackURL=%2Freset-password`;

  // The emailed link lands on the form, carrying the token.
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=/);

  await page.getByLabel('New password', { exact: true }).fill('newpassword456');
  await page.getByLabel('Confirm new password').fill('different789');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Passwords' })).toHaveText('Passwords do not match.');

  await page.getByLabel('Confirm new password').fill('newpassword456');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/, { timeout: 15000 });
  await expect(page.getByRole('status')).toHaveText('Your password has been changed. Log in with your new password.');

  // The link works once.
  await page.goto(link);
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or has expired' })).toBeVisible();

  // The other device was signed out.
  await otherPage.goto('/home');
  await expect(otherPage).toHaveURL(/\/login/);

  // Old password no longer works; the new one does.
  await login(page, email, 'password123');
  await expect(page).toHaveURL(/\/login/);
  await login(page, email, 'newpassword456');
  await expect(page).toHaveURL(/\/(create-workspace|workspaces|invites)/, { timeout: 15000 });

  await context.close();
  await other.close();
});

test('a bad or missing reset token explains itself', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or has expired' })).toBeVisible();
  await page.goto('/api/auth/reset-password/not-a-real-token?callbackURL=%2Freset-password');
  await expect(page).toHaveURL(/\/reset-password\?error=INVALID_TOKEN/);
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or has expired' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
});
