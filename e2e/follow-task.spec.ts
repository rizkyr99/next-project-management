import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** I4: follow a task to hear about its comments and column changes. */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('a follower hears about comments and column moves until they unfollow (I4)', async ({ browser }) => {
  test.setTimeout(90_000); // two users, many server round trips
  const s = stamp();
  const ownerEmail = `follow-own+${s}@example.com`;
  const owner = await newUser(browser, ownerEmail, `Nora ${s}`);
  const memberEmail = `follow-mem+${s}@example.com`;
  const member = await newUser(browser, memberEmail, `Milo ${s}`);

  const slug = `follow-${s}`;
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Follow WS ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Launch');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectId = owner.page.url().split('/').pop()!;

  const sql = await testDb();
  const [{ wsId, memberId, ownerId }] = await sql`
    select w.id as "wsId",
      (select id from "user" where email = ${memberEmail}) as "memberId",
      (select id from "user" where email = ${ownerEmail}) as "ownerId"
    from workspace w where w.slug = ${slug}`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${memberId}, 'member')`;
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and name = 'To Do'`;
  const taskId = crypto.randomUUID();
  await sql`insert into task (id, title, "order", project_id, status_id) values (${taskId}, 'Homepage copy', 1, ${projectId}, ${todo.id})`;
  const taskUrl = `/workspaces/${slug}/projects/${projectId}?task=${taskId}`;
  const notifications = async (type: string) =>
    sql`select actor_name, task_title, detail, read from notification where user_id = ${memberId} and type = ${type}`;

  // The member follows from the task sheet.
  await member.page.goto(taskUrl);
  const memberSheet = member.page.getByRole('dialog', { name: 'Homepage copy' });
  await memberSheet.getByRole('button', { name: 'Follow task' }).click();
  await expect(memberSheet.getByRole('button', { name: 'Unfollow task' })).toHaveAttribute('aria-pressed', 'true');
  await expect(member.page.getByText('You’ll be notified about comments and moves')).toBeVisible();

  // The owner comments, then moves the task twice: the member gets one comment
  // notification and one move notification, naming the latest column.
  await owner.page.goto(taskUrl);
  const ownerSheet = owner.page.getByRole('dialog', { name: 'Homepage copy' });
  await ownerSheet.getByPlaceholder(/Add (a|an internal) comment/).fill('First draft is in');
  await ownerSheet.getByRole('button', { name: 'Send comment' }).click();
  await expect(ownerSheet.getByText('First draft is in')).toBeVisible();
  // Commenting followed the task for the owner too.
  await expect(ownerSheet.getByRole('button', { name: 'Unfollow task' })).toBeVisible();
  for (const column of ['In Progress', 'Done']) {
    await ownerSheet.getByRole('combobox', { name: 'Status' }).click();
    await owner.page.getByRole('option', { name: column }).click();
    await expect(ownerSheet.getByRole('combobox', { name: 'Status' })).toHaveText(column);
    await expect
      .poll(async () => (await notifications('task_status_changed')).map((n) => n.detail), { timeout: 15000 })
      .toEqual([column]);
  }
  await expect.poll(async () => (await notifications('task_comment')).length, { timeout: 15000 }).toBe(1);
  const [ownerFollows] = await sql`select count(*)::int as n from task_follower where task_id = ${taskId} and user_id = ${ownerId}`;
  expect(ownerFollows.n).toBe(1);

  // The member sees both in the bell, and one opens the task.
  await member.page.goto(`/workspaces/${slug}`);
  await member.page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(member.page.getByRole('button', { name: /New comment/ })).toContainText(
    `Nora ${s} commented on Homepage copy`,
  );
  const moved = member.page.getByRole('button', { name: /Task moved/ });
  await expect(moved).toContainText(`Nora ${s} moved Homepage copy to Done`);
  await moved.click();
  await expect(member.page.getByRole('dialog', { name: 'Homepage copy' })).toBeVisible({ timeout: 15000 });

  // After unfollowing, a new comment doesn't reach them.
  await member.page.getByRole('dialog', { name: 'Homepage copy' }).getByRole('button', { name: 'Unfollow task' }).click();
  await expect(member.page.getByText('Unfollowed')).toBeVisible();
  await expect
    .poll(async () => (await sql`select count(*)::int as n from task_follower where user_id = ${memberId}`)[0].n)
    .toBe(0);
  await ownerSheet.getByPlaceholder(/Add (a|an internal) comment/).fill('Second draft');
  await ownerSheet.getByRole('button', { name: 'Send comment' }).click();
  await expect(ownerSheet.getByText('Second draft')).toBeVisible();
  await owner.page.waitForTimeout(2000); // the notification would be written just after the response
  expect((await notifications('task_comment')).length).toBe(1);

  await owner.context.close();
  await member.context.close();
});
