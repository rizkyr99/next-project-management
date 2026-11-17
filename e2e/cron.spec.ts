import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { E2E_CRON_SECRET } from './helpers/cron';
import { testDb } from './helpers/db';

/** P3.3: the daily job sends due-soon reminders once per due date and cleans up. */

const WELCOME = 'Welcome to your new project!';
const auth = { Authorization: `Bearer ${E2E_CRON_SECRET}` };

test('the cron route refuses calls without the secret', async ({ request }) => {
  expect((await request.get('/api/cron/daily')).status()).toBe(401);
  expect((await request.get('/api/cron/daily', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);
});

test('due-soon reminders: once per due date, not for done or far-off tasks, plus cleanup', async ({ page, request }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `cron+${s}@example.com`;
  await registerAndLogin(page, email, 'Cleo');

  const slug = `cron-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Cron WS ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Deadlines');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });

  const sql = await testDb();
  const [{ userId, projectId, wsId }] = await sql`
    select u.id as "userId", p.id as "projectId", w.id as "wsId"
    from "user" u, workspace w join project p on p.workspace_id = w.id
    where u.email = ${email} and w.slug = ${slug}`;
  const statuses = await sql`select id, name from task_status where project_id = ${projectId} order by "order"`;
  const todo = statuses[0].id;
  const done = statuses[statuses.length - 1].id;
  const [welcome] = await sql`select id from task where project_id = ${projectId}`;

  // Welcome task due tomorrow (should remind); one in Done and one next week (should not).
  await sql`update task set due_date = now() + interval '20 hours' where id = ${welcome.id}`;
  const doneId = crypto.randomUUID();
  const farId = crypto.randomUUID();
  await sql`insert into task (id, title, project_id, status_id, "order", due_date) values
    (${doneId}, 'Already shipped', ${projectId}, ${done}, 1, now() + interval '20 hours'),
    (${farId}, 'Next week', ${projectId}, ${todo}, 2, now() + interval '6 days')`;
  await sql`insert into task_assignee (task_id, user_id) values (${welcome.id}, ${userId}), (${doneId}, ${userId}), (${farId}, ${userId})`;

  // Cleanup fixtures: an expired pending invite and a 91-day-old notification.
  const inviteId = crypto.randomUUID();
  await sql`insert into workspace_invite (id, workspace_id, email, role, token, status, invited_by_user_id, expires_at)
    values (${inviteId}, ${wsId}, ${`old+${s}@example.com`}, 'member', ${`tok-${s}`}, 'pending', ${userId}, now() - interval '1 day')`;
  const oldNotif = crypto.randomUUID();
  await sql`insert into notification (id, user_id, type, task_title, created_at)
    values (${oldNotif}, ${userId}, 'task_assigned', 'Ancient', now() - interval '91 days')`;

  const run = async () => {
    const res = await request.get('/api/cron/daily', { headers: auth });
    expect(res.status()).toBe(200);
    return res.json();
  };
  const reminders = () =>
    sql`select task_id, due_label, href from notification where user_id = ${userId} and type = 'due_soon'`;

  const first = await run();
  expect(first.dueSoonReminders).toBeGreaterThanOrEqual(1);
  let rows = await reminders();
  expect(rows).toHaveLength(1);
  expect(rows[0].task_id).toBe(welcome.id);
  expect(rows[0].due_label).toMatch(/^on [A-Z][a-z]{2} \d{1,2}$/);
  expect(rows[0].href).toBe(`/workspaces/${slug}/projects/${projectId}?task=${welcome.id}`);

  // Cleanup ran.
  const [inv] = await sql`select status from workspace_invite where id = ${inviteId}`;
  expect(inv.status).toBe('expired');
  expect(await sql`select id from notification where id = ${oldNotif}`).toHaveLength(0);

  // Idempotent: a second run reminds nobody again.
  await run();
  expect(await reminders()).toHaveLength(1);

  // Moving the due date makes it eligible again.
  await sql`update task set due_date = now() + interval '30 hours' where id = ${welcome.id}`;
  await run();
  rows = await reminders();
  expect(rows).toHaveLength(2);

  // Digest (P3.4): only verified users who opted in are processed, once per day.
  await sql`insert into user_preferences (user_id, email_digest) values (${userId}, true)`;
  await run();
  const digestAt = async () =>
    (await sql`select digest_last_sent_at from user_preferences where user_id = ${userId}`)[0].digest_last_sent_at;
  expect(await digestAt()).toBeNull(); // still unverified
  await sql`update "user" set email_verified = true where id = ${userId}`;
  const afterVerify = await run();
  expect(afterVerify.digests.checked).toBeGreaterThanOrEqual(1);
  // A test address can't receive mail, so the send "fails" and the window is
  // released for the next run instead of being skipped.
  expect(await digestAt()).toBeNull();

  // With nothing unread there's nothing to send: the cursor moves and stays.
  await sql`update notification set read = true where user_id = ${userId}`;
  await run();
  const firstDigest = await digestAt();
  expect(firstDigest).not.toBeNull();
  await run(); // within 20 h: not processed again
  expect(new Date(await digestAt()).toISOString()).toBe(new Date(firstDigest).toISOString());

  // The reminder shows in the bell and opens the task.
  await page.goto(`/workspaces/${slug}`);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const item = page.getByRole('button', { name: /Due date reminder/ }).first();
  await expect(item).toContainText(`${WELCOME} is due on`);
  await item.click();
  await expect(page.getByRole('dialog', { name: WELCOME })).toBeVisible({ timeout: 15000 });
});
