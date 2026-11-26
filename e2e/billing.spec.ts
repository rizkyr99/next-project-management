import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { makePro } from './helpers/plan';
import { PLAN_DETAILS } from '../lib/plans';

/**
 * E1: plans belong to workspaces and are priced per team member; clients
 * are free. Free stops client features, saved templates and a fourth team
 * member, with a message saying why; Pro lifts those limits. Stripe
 * Checkout itself isn't exercised here (it leaves the app).
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function invite(page: Page, email: string, role: 'Member' | 'Guest (client)') {
  const card = page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(email);
  await card.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: role }).click();
  if (role === 'Guest (client)') await card.getByRole('checkbox', { name: 'Acme website' }).check();
  await card.getByRole('button', { name: 'Send invite' }).click();
}

test('Free limits client features and seats; Pro lifts them; billing lives with the workspace (E1)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const s = stamp();
  const slug = `bill-${s}`;
  const price = PLAN_DETAILS.pro.priceMonthly;
  await registerAndLogin(page, `bill-owner+${s}@example.com`, 'Bea Owner');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Billing ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Acme website');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(page.url()).pathname;

  // Free: share links and saved templates explain they're Pro.
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Share link…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText(/Share links are part of Pro/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  await page.getByRole('dialog', { name: 'Save as template' }).getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText(/Saving your own templates is part of Pro/)).toBeVisible();
  await page.keyboard.press('Escape');

  // Free: no clients, and three team seats, pending invites included.
  await page.goto(`/workspaces/${slug}/settings?tab=members`);
  await invite(page, `bill-client+${s}@example.com`, 'Guest (client)');
  await expect(page.getByText(/Inviting clients is part of Pro/)).toBeVisible();
  await invite(page, `bill-a+${s}@example.com`, 'Member');
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible({ timeout: 15000 });
  await invite(page, `bill-b+${s}@example.com`, 'Member');
  await expect(page.getByText(`bill-b+${s}@example.com`).first()).toBeVisible({ timeout: 15000 });
  await invite(page, `bill-c+${s}@example.com`, 'Member');
  await expect(page.getByText(/Free workspaces have up to 3 team members/)).toBeVisible();

  // The Billing tab: Free, 1 of 3 members, what Pro would cost and add.
  await page.goto(`/workspaces/${slug}/settings?tab=billing`);
  const billing = page.getByRole('tabpanel', { name: 'Billing' });
  await expect(billing).toContainText('Free, with no billing.');
  await expect(billing).toContainText('1 of 3');
  await expect(billing).toContainText(`1 × $${price} = $${price} a month`);
  await expect(billing.getByRole('list', { name: 'What Pro adds' })).toContainText('Client approvals');
  await expect(billing.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();

  // On Pro the gates open, and billing shows the per-member cost.
  await makePro(slug);
  await page.goto(`/workspaces/${slug}/settings?tab=members`);
  await invite(page, `bill-client+${s}@example.com`, 'Guest (client)');
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible({ timeout: 15000 });
  await invite(page, `bill-c+${s}@example.com`, 'Member');
  await expect(page.getByText(`bill-c+${s}@example.com`).first()).toBeVisible({ timeout: 15000 });
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Share link…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByRole('textbox', { name: 'Share link' })).toBeVisible({ timeout: 15000 });

  await page.goto(`/workspaces/${slug}/settings?tab=billing`);
  await expect(billing.getByText('Pro', { exact: true })).toBeVisible();
  await expect(billing).toContainText(`1 × $${price} = $${price}`);
  await expect(billing.getByRole('button', { name: 'Upgrade to Pro' })).toHaveCount(0);

  // Account billing lists the workspace with its plan, linking to its Billing tab.
  await page.goto('/settings/billing');
  const list = page.getByRole('list', { name: 'Your workspaces' });
  await expect(list.getByRole('link', { name: new RegExp(`Billing ${s}`) })).toContainText('Pro');
  await expect(list.getByRole('link', { name: new RegExp(`Billing ${s}`) })).toHaveAttribute(
    'href',
    `/workspaces/${slug}/settings?tab=billing`,
  );
});
