import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P3.2: soft-gate email verification. Test addresses never get real mail, so
 * the link is minted the way Better Auth does it (an HS256 JWT over the
 * email, signed with BETTER_AUTH_SECRET).
 */

async function verificationLink(email: string, expiresInSeconds = 3600) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set for E2E');
  const token = await new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
  return `/api/auth/verify-email?token=${token}&callbackURL=%2Femail-verified`;
}

test('unverified users see a banner until they verify', async ({ page }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `verify+${s}@example.com`;
  await registerAndLogin(page, email, 'Vera');

  const slug = `verify-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Verify WS ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  const banner = page.getByRole('region', { name: 'Email verification' });
  await expect(banner).toContainText('Verify your email to receive invites and notifications');
  await expect(banner).toContainText(email);

  // Resend works (and is rate limited by the proxy like other auth calls).
  await banner.getByRole('button', { name: 'Resend email' }).click();
  await expect(banner.getByRole('button', { name: 'Email sent' })).toBeDisabled();

  // A bad link explains itself and offers a new one.
  await page.goto('/api/auth/verify-email?token=nope&callbackURL=%2Femail-verified');
  await expect(page).toHaveURL(/\/email-verified\?error=invalid_token/);
  await expect(page.getByRole('alert').filter({ hasText: 'invalid' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend email' })).toBeVisible();

  // An expired one too.
  await page.goto(await verificationLink(email, -60));
  await expect(page.getByRole('alert').filter({ hasText: 'expired' })).toBeVisible();

  // The real link verifies the account.
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/\/email-verified$/);
  await expect(page.getByRole('heading', { name: 'Your email is verified' })).toBeVisible();

  const sql = await testDb();
  const [row] = await sql`select email_verified from "user" where email = ${email}`;
  expect(row.email_verified).toBe(true);

  await page.goto(`/workspaces/${slug}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Email verification' })).toHaveCount(0);
});
