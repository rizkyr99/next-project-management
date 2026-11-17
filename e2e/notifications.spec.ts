import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** P2.5: a notification opens what it's about, and is marked read on the way. */

const WELCOME = 'Welcome to your new project!';
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('an assignment notification opens the task and is marked read', async ({ browser }) => {
  test.setTimeout(60_000); // two users, many server round trips
  const s = stamp();
  const owner = await newUser(browser, `notif-own+${s}@example.com`, `Nora ${s}`);
  const memberEmail = `notif-mem+${s}@example.com`;
  const memberName = `Milo ${s}`;
  const member = await newUser(browser, memberEmail, memberName);

  const slug = `notif-${s}`;
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Notif WS ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  const sql = await testDb();
  const [{ wsId, memberId }] = await sql`
    select w.id as "wsId", (select id from "user" where email = ${memberEmail}) as "memberId"
    from workspace w where w.slug = ${slug}`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${memberId}, 'member')`;

  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Launch');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });

  // The owner assigns the member from the task sheet.
  await owner.page.getByRole('button', { name: `Open task ${WELCOME}` }).click();
  const sheet = owner.page.getByRole('dialog', { name: WELCOME });
  await sheet.getByRole('button', { name: 'Assign members' }).click();
  await owner.page.getByRole('dialog').getByText(memberName, { exact: true }).click();
  await expect(sheet.getByRole('button', { name: `Unassign ${memberName}` })).toBeVisible();
  await expect
    .poll(async () => (await sql`select count(*)::int as n from notification where user_id = ${memberId}`)[0].n)
    .toBe(1);

  // The member opens the bell and clicks the notification: it lands on the task.
  await member.page.goto(`/workspaces/${slug}`);
  await member.page.getByRole('button', { name: /^Notifications/ }).click();
  const item = member.page.getByRole('button', { name: /Task assigned to you/ });
  await expect(item).toContainText(`Nora ${s} assigned you to ${WELCOME}`);
  await item.click();
  await expect(member.page).toHaveURL(/\/projects\/[0-9a-f-]{36}\?task=[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(member.page.getByRole('dialog', { name: WELCOME })).toBeVisible();
  await expect
    .poll(async () => (await sql`select read from notification where user_id = ${memberId}`)[0].read)
    .toBe(true);

  // The full list links the same way.
  await member.page.goto('/notifications');
  await expect(member.page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await member.page.getByRole('button', { name: /Task assigned to you/ }).click();
  await expect(member.page.getByRole('dialog', { name: WELCOME })).toBeVisible({ timeout: 15000 });

  // Deleting the task takes its notifications with it: nothing links to a dead page.
  await sql`delete from task where id = (select task_id from notification where user_id = ${memberId})`;
  const left = await sql`select count(*)::int as n from notification where user_id = ${memberId}`;
  expect(left[0].n).toBe(0);
  await member.page.goto('/notifications');
  await expect(member.page.getByText('No notifications')).toBeVisible();

  await owner.context.close();
  await member.context.close();
});
