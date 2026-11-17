import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** P3.4: email preferences save per toggle and survive a reload. */

test('email preferences save on toggle; unverified users are told why nothing is sent', async ({ page }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `prefs+${s}@example.com`;
  await registerAndLogin(page, email, 'Pia');

  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Email notifications' })).toBeVisible();
  // Unverified: explained, with a way to verify.
  await expect(page.getByRole('status').filter({ hasText: 'only emails verified addresses' })).toBeVisible();

  const assign = page.getByLabel('When someone assigns me a task');
  const mention = page.getByLabel('When someone @mentions me in a comment');
  const digest = page.getByLabel('Daily summary of unread notifications');
  // Defaults: instant emails on, digest off.
  await expect(assign).toBeChecked();
  await expect(mention).toBeChecked();
  await expect(digest).not.toBeChecked();

  await digest.click();
  await expect(page.getByText('Preferences saved').first()).toBeVisible();
  await mention.click();
  await expect(mention).not.toBeChecked();

  const sql = await testDb();
  await expect
    .poll(async () => {
      const [row] = await sql`
        select p.email_on_assign, p.email_on_mention, p.email_digest
        from user_preferences p join "user" u on u.id = p.user_id where u.email = ${email}`;
      return row;
    })
    .toEqual({ email_on_assign: true, email_on_mention: false, email_digest: true });

  await page.reload();
  await expect(digest).toBeChecked();
  await expect(mention).not.toBeChecked();
  await expect(assign).toBeChecked();

  // Verified users don't see the notice.
  await sql`update "user" set email_verified = true where email = ${email}`;
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'only emails verified addresses' })).toHaveCount(0);
});
