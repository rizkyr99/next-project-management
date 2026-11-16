import { createHash } from 'node:crypto';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P1.3: token-based invites. An owner invites a brand-new email, that person
 * registers through the link and lands in the workspace with the invited role.
 * Every dead-end state shows the right message.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newContextPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function createWorkspace(page: Page, slug: string, name: string) {
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(name);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
}

async function ownerWithWorkspace(browser: Browser) {
  const { context, page } = await newContextPage(browser);
  const s = stamp();
  await registerAndLogin(page, `inv-owner+${s}@example.com`, 'Invite Owner');
  const slug = `inv-${s}`;
  await createWorkspace(page, slug, `Invite WS ${s}`);
  return { context, page, slug, workspaceName: `Invite WS ${s}` };
}

async function openMembersTab(page: Page, slug: string) {
  await page.goto(`/workspaces/${slug}/settings`);
  await page.getByRole('tab', { name: /Members/ }).click();
}

/** Sends an invite from the settings page and returns the one-time link it shows. */
async function invite(page: Page, slug: string, email: string, role: 'Member' | 'Admin' = 'Member') {
  await openMembersTab(page, slug);
  const card = page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(email);
  if (role === 'Admin') {
    await card.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Admin' }).click();
  }
  await card.getByRole('button', { name: 'Send invite' }).click();
  const link = card.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const url = await link.inputValue();
  expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  return new URL(url).pathname; // relative, so it works whatever APP_URL is
}

test.describe('Workspace invites', () => {
  test('a brand-new user registers via the link and joins with the invited role', async ({ browser }) => {
    const owner = await ownerWithWorkspace(browser);
    const inviteeEmail = `inv-new+${stamp()}@example.com`;
    const invitePath = await invite(owner.page, owner.slug, inviteeEmail, 'Admin');
    const rawToken = invitePath.split('/').pop()!;

    // Only the hash is stored, never the raw token.
    const sql = await testDb();
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const stored = await sql`select token, status, role from workspace_invite where lower(email) = ${inviteeEmail}`;
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe(hash);
    expect(stored[0].token).not.toContain(rawToken);
    const rawHits = await sql`select count(*)::int as n from workspace_invite where token = ${rawToken}`;
    expect(rawHits[0].n).toBe(0);

    // Logged out: the link opens (not bounced to /login) and offers sign-up.
    const invitee = await newContextPage(browser);
    await invitee.page.goto(invitePath);
    await expect(invitee.page.getByText(`Join ${owner.workspaceName}`)).toBeVisible();
    await invitee.page.getByRole('link', { name: 'Create account' }).click();
    await expect(invitee.page).toHaveURL(/\/register\?callbackURL=/);

    await invitee.page.getByPlaceholder('Enter your email').fill(inviteeEmail);
    await invitee.page.getByPlaceholder('Enter your name').fill('New Invitee');
    await invitee.page.getByPlaceholder('Enter your password').fill('password123');
    await invitee.page.getByRole('button', { name: /register/i }).click();

    // Registration carries them back to the invite.
    await expect(invitee.page).toHaveURL(new RegExp(`${invitePath}$`), { timeout: 15000 });
    await invitee.page.getByRole('button', { name: 'Accept invite' }).click();
    await expect(invitee.page).toHaveURL(new RegExp(`/workspaces/${owner.slug}$`), { timeout: 15000 });

    const [membership] = await sql`
      select m.role from member m join "user" u on u.id = m.user_id
      join workspace w on w.id = m.workspace_id
      where lower(u.email) = ${inviteeEmail} and w.slug = ${owner.slug}`;
    expect(membership?.role).toBe('admin');

    // Reusing the link afterwards is a no-op that points back into the workspace.
    await invitee.page.goto(invitePath);
    await expect(invitee.page.getByText('Invite already accepted')).toBeVisible();

    await owner.context.close();
    await invitee.context.close();
  });

  test('wrong account, revoked, expired and malformed links each explain themselves', async ({ browser }) => {
    const owner = await ownerWithWorkspace(browser);
    const sql = await testDb();

    // Malformed / unknown token.
    await owner.page.goto('/invite/not-a-real-token');
    await expect(owner.page.getByText('Invalid invite link')).toBeVisible();

    // Wrong account: the owner opens a link meant for someone else.
    const otherEmail = `inv-other+${stamp()}@example.com`;
    const otherPath = await invite(owner.page, owner.slug, otherEmail);
    await owner.page.goto(otherPath);
    await expect(owner.page.getByText('This invite is for a different account')).toBeVisible();
    await expect(owner.page.getByText(otherEmail)).toHaveCount(0); // email is masked
    await expect(owner.page.getByRole('button', { name: 'Accept invite' })).toHaveCount(0);

    // Revoked from the settings page.
    await openMembersTab(owner.page, owner.slug);
    await owner.page.getByRole('button', { name: `Revoke invite to ${otherEmail}` }).click();
    await expect(owner.page.getByText(`Invite to ${otherEmail} revoked`)).toBeVisible();
    await owner.page.goto(otherPath);
    await expect(owner.page.getByText('This invite was revoked')).toBeVisible();

    // Expired: push expires_at into the past.
    const lateEmail = `inv-late+${stamp()}@example.com`;
    const latePath = await invite(owner.page, owner.slug, lateEmail);
    await sql`update workspace_invite set expires_at = now() - interval '1 minute' where lower(email) = ${lateEmail}`;
    const stranger = await newContextPage(browser);
    await stranger.page.goto(latePath);
    await expect(stranger.page.getByText('This invite has expired')).toBeVisible();

    // Re-inviting refreshes the same row: the old link dies, the new one works.
    const freshPath = await invite(owner.page, owner.slug, lateEmail);
    expect(freshPath).not.toBe(latePath);
    const rows = await sql`select count(*)::int as n from workspace_invite where lower(email) = ${lateEmail}`;
    expect(rows[0].n).toBe(1);
    await stranger.page.goto(latePath);
    await expect(stranger.page.getByText('Invalid invite link')).toBeVisible();
    await stranger.page.goto(freshPath);
    await expect(stranger.page.getByRole('link', { name: 'Create account' })).toBeVisible();

    await owner.context.close();
    await stranger.context.close();
  });

  test('an existing user is notified in-app and can accept from /invites', async ({ browser }) => {
    const owner = await ownerWithWorkspace(browser);

    const existing = await newContextPage(browser);
    const existingEmail = `inv-existing+${stamp()}@example.com`;
    await registerAndLogin(existing.page, existingEmail, 'Existing User');

    await invite(owner.page, owner.slug, existingEmail);

    // A user with no workspace is routed to their invites, not to "create workspace".
    await existing.page.goto('/');
    await expect(existing.page).toHaveURL(/\/invites$/, { timeout: 15000 });
    await expect(existing.page.getByText(owner.workspaceName)).toBeVisible();
    await existing.page.getByRole('button', { name: 'Accept invite' }).click();
    await expect(existing.page).toHaveURL(new RegExp(`/workspaces/${owner.slug}$`), { timeout: 15000 });

    await owner.context.close();
    await existing.context.close();
  });
});
