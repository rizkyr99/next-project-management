import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';
import { PLAN_DETAILS } from '../lib/plans';

/** E5: the public help centre, and feedback from the app's header. */

test('the help centre is public, and its billing guide matches the plans', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  const guides = page.getByRole('list', { name: 'Guides' });
  await expect(guides.getByRole('link')).toHaveCount(4);
  await guides.getByRole('link', { name: /Working with clients/ }).click();
  await expect(page).toHaveURL(/\/help\/clients$/);
  await expect(page.getByRole('heading', { level: 2, name: 'What a client sees' })).toBeVisible();

  await page.getByRole('navigation', { name: 'More guides' }).getByRole('link', { name: /Plans, billing/ }).click();
  await expect(page).toHaveURL(/\/help\/billing$/);
  await expect(page.getByRole('main')).toContainText(`$${PLAN_DETAILS.pro.priceMonthly} per team member per month`);

  expect((await page.request.get('/help/not-a-guide')).status()).toBe(404);
  await page.goto('/');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
});

test('feedback from the header is saved with the page it came from', async ({ page }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `fb+${s}@example.com`;
  await registerAndLogin(page, email, 'Fay Feedback');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Feedback ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`fb-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/fb-${s}$`), { timeout: 15000 });

  await page.getByRole('button', { name: 'Help and feedback' }).click();
  await expect(page.getByRole('menuitem', { name: 'Help centre' })).toHaveAttribute('href', '/help');
  await page.getByRole('menuitem', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(dialog.getByRole('button', { name: 'Send feedback' })).toBeDisabled();
  await dialog.getByLabel('Your feedback').fill('The overview is great.\nCould it show this week’s approvals too?');
  await dialog.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByText('Thanks, your feedback was sent')).toBeVisible({ timeout: 15000 });
  await expect(dialog).toBeHidden();

  const sql = await testDb();
  const rows = await sql`
    select f.message, f.page, w.slug, f.emailed_at
    from feedback f join "user" u on u.id = f.user_id left join workspace w on w.id = f.workspace_id
    where u.email = ${email}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].message).toBe('The overview is great.\nCould it show this week’s approvals too?');
  expect(rows[0].page).toBe(`/workspaces/fb-${s}`);
  expect(rows[0].slug).toBe(`fb-${s}`);
});
