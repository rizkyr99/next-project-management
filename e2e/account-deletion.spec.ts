import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P2.6: account deletion is blocked while you own a workspace others use,
 * needs your email and password, and takes your solo workspaces with it.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('delete an account after handing off a shared workspace', async ({ browser }) => {
  const s = stamp();
  const email = `del+${s}@example.com`;
  const peerEmail = `del-peer+${s}@example.com`;
  const me = await newUser(browser, email, `Dana ${s}`);
  const peer = await newUser(browser, peerEmail, `Pat ${s}`);

  const slug = `del-${s}`;
  await me.page.goto('/create-workspace');
  await me.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Team ${s}`);
  await me.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await me.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(me.page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  // Seed: Pat joins the team workspace; Dana also owns a workspace nobody else is in.
  const sql = await testDb();
  const [{ wsId, myId, peerId }] = await sql`
    select w.id as "wsId",
      (select id from "user" where email = ${email}) as "myId",
      (select id from "user" where email = ${peerEmail}) as "peerId"
    from workspace w where w.slug = ${slug}`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${peerId}, 'member')`;
  const soloId = crypto.randomUUID();
  await sql`insert into workspace (id, name, slug, user_id, updated_at) values (${soloId}, ${`Solo ${s}`}, ${`solo-${s}`}, ${myId}, now())`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${soloId}, ${myId}, 'owner')`;

  // Blocked: the shared workspace is listed, and there's no delete button.
  await me.page.goto(`/workspaces/${slug}/account`);
  const card = me.page.locator('[data-slot="card"]', { hasText: 'Delete account' });
  await expect(card.getByText('You own workspaces that other people use')).toBeVisible();
  await expect(card.getByRole('link', { name: `Team ${s}` })).toBeVisible();
  await expect(card.getByText('(1 other member)')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete account' })).toHaveCount(0);

  // Hand the team workspace to Pat (P2.4's transfer, done directly here).
  await sql`update member set role = case when user_id = ${peerId} then 'owner'::role else 'admin'::role end where workspace_id = ${wsId}`;
  await sql`update workspace set user_id = ${peerId} where id = ${wsId}`;

  await me.page.reload();
  await card.getByRole('button', { name: 'Delete account' }).click();
  const dialog = me.page.getByRole('dialog', { name: 'Delete account' });
  await expect(dialog.getByText(`Solo ${s}`)).toBeVisible(); // warned it goes too
  const submit = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(submit).toBeDisabled();

  await dialog.getByLabel(/Type .* to confirm/).fill(email.toUpperCase()); // case-insensitive
  await dialog.getByLabel('Password').fill('not-my-password');
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('Incorrect password.');

  await dialog.getByLabel('Password').fill('password123');
  await submit.click();
  await expect(me.page).toHaveURL(/\/login\?deleted=1$/, { timeout: 15000 });
  await expect(me.page.getByRole('status')).toHaveText('Your account has been deleted.');

  // Gone: the user, their solo workspace; the team workspace lives on with Pat.
  expect((await sql`select count(*)::int as n from "user" where id = ${myId}`)[0].n).toBe(0);
  expect((await sql`select count(*)::int as n from workspace where id = ${soloId}`)[0].n).toBe(0);
  const team = await sql`select user_id from workspace where id = ${wsId}`;
  expect(team[0].user_id).toBe(peerId);
  expect((await sql`select count(*)::int as n from member where workspace_id = ${wsId}`)[0].n).toBe(1);

  // The old session no longer works.
  await me.page.goto(`/workspaces/${slug}`);
  await expect(me.page).toHaveURL(/\/login/);

  await me.context.close();
  await peer.context.close();
});
