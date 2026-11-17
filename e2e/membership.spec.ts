import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P2.4: the owner can't leave until they transfer ownership; transfer swaps
 * roles and the billing owner; leaving drops your task assignments.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('transfer ownership, then the old owner leaves and is unassigned', async ({ browser }) => {
  test.setTimeout(60_000); // two users, many server round trips
  const s = stamp();
  const ownerEmail = `own+${s}@example.com`;
  const heirEmail = `heir+${s}@example.com`;
  const owner = await newUser(browser, ownerEmail, `Olive ${s}`);
  const heir = await newUser(browser, heirEmail, `Theo ${s}`);
  const heirName = `Theo ${s}`;

  const slug = `own-${s}`;
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Own WS ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Roadmap');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15000 });

  // Seed: the heir joins as a member, and the owner is assigned to the welcome task.
  const sql = await testDb();
  const [{ wsId, ownerId, heirId }] = await sql`
    select w.id as "wsId",
      (select id from "user" where email = ${ownerEmail}) as "ownerId",
      (select id from "user" where email = ${heirEmail}) as "heirId"
    from workspace w where w.slug = ${slug}`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${heirId}, 'member')`;
  await sql`
    insert into task_assignee (task_id, user_id)
    select t.id, ${ownerId} from task t join project p on p.id = t.project_id where p.workspace_id = ${wsId}`;

  // The owner can't leave yet: the danger zone explains why and offers no button.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await owner.page.getByRole('tab', { name: 'Danger zone' }).click();
  await expect(owner.page.getByText(/Transfer ownership to another member .* before leaving/)).toBeVisible();
  await expect(owner.page.getByRole('button', { name: 'Leave workspace' })).toHaveCount(0);

  // Transfer from the member menu, confirming by typing the heir's name.
  await owner.page.getByRole('tab', { name: /Members/ }).click();
  await owner.page.getByRole('button', { name: `${heirName} options` }).click();
  await owner.page.getByRole('menuitem', { name: 'Transfer ownership' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Transfer ownership' });
  const confirm = dialog.getByRole('button', { name: 'Transfer ownership' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type .* to confirm/).fill(heirName);
  await confirm.click();
  await expect(owner.page.getByText(`${heirName} now owns Own WS ${s}`)).toBeVisible();

  const roles = await sql`select user_id, role from member where workspace_id = ${wsId}`;
  expect(Object.fromEntries(roles.map((r) => [r.user_id, r.role]))).toEqual({
    [ownerId]: 'admin',
    [heirId]: 'owner',
  });
  const [ws] = await sql`select user_id from workspace where id = ${wsId}`;
  expect(ws.user_id).toBe(heirId);

  // Now an admin, the old owner can leave; their assignments go with them.
  await owner.page.reload();
  await owner.page.getByRole('tab', { name: 'Danger zone' }).click();
  await owner.page.getByRole('button', { name: 'Leave workspace' }).click();
  await owner.page.getByRole('dialog', { name: 'Leave workspace' }).getByRole('button', { name: 'Leave workspace' }).click();
  await expect(owner.page).toHaveURL(/\/create-workspace$/, { timeout: 15000 });

  const left = await sql`select count(*)::int as n from member where workspace_id = ${wsId} and user_id = ${ownerId}`;
  expect(left[0].n).toBe(0);
  const assignments = await sql`select count(*)::int as n from task_assignee where user_id = ${ownerId}`;
  expect(assignments[0].n).toBe(0);

  // The new owner sees the workspace as theirs.
  await heir.page.goto(`/workspaces/${slug}/settings`);
  await heir.page.getByRole('tab', { name: 'Danger zone' }).click();
  await expect(heir.page.getByRole('button', { name: 'Delete workspace' })).toBeVisible();

  await owner.context.close();
  await heir.context.close();
});
