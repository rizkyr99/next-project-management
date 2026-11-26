import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';
import { testDb } from './helpers/db';
import { endTrial } from './helpers/plan';

/** D2: open tasks per person per week, with the tasks behind each count; Pro only. */

test('workload counts each person’s open tasks by week, and lists them (D2)', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `wl-${s}`;
  const email = `wl+${s}@example.com`;
  await registerAndLogin(page, email, 'Wren Load');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Workload ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectId = page.url().split('/').pop()!;
  for (const t of ['Today task', 'Spanning', 'Late', 'Someday', 'Nobody']) await addTask(page, 'To Do', t);

  const sql = await testDb();
  const [{ id: me }] = await sql`select id from "user" where email = ${email}`;
  const now = new Date();
  const inDays = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const day = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await sql`update task set due_date = ${inDays(0)} where project_id = ${projectId} and title = 'Today task'`;
  // Starts today and runs 8 days: this week and next.
  await sql`update task set start_date = ${day(inDays(0))}, due_date = ${inDays(8)} where project_id = ${projectId} and title = 'Spanning'`;
  await sql`update task set due_date = ${inDays(-3)} where project_id = ${projectId} and title = 'Late'`;
  await sql`update task set due_date = ${inDays(0)} where project_id = ${projectId} and title = 'Nobody'`;
  await sql`insert into task_assignee (task_id, user_id)
    select id, ${me} from task where project_id = ${projectId} and title in ('Today task', 'Spanning', 'Late', 'Someday')`;

  // The seeded Getting started project has its own dated, unassigned task; leave it out so the counts are this test's.
  await sql`delete from project where workspace_id = (select id from workspace where slug = ${slug}) and name = 'Getting started'`;

  await page.getByRole('link', { name: 'Workload' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workload' })).toBeVisible({ timeout: 15000 });
  const table = page.getByRole('table', { name: 'Open tasks per person, by week' });
  await expect(table.getByRole('button', { name: 'Wren Load, this week: 2 tasks' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Wren Load, next week: 1 task' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Wren Load, overdue: 1 task' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Wren Load, no date: 1 task' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Unassigned, this week: 1 task' })).toBeVisible();

  await table.getByRole('button', { name: 'Wren Load, this week: 2 tasks' }).click();
  const list = page.getByRole('list', { name: 'Wren Load, this week' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await list.getByRole('link', { name: /Spanning/ }).click();
  await expect(page.getByRole('dialog', { name: 'Spanning' })).toBeVisible({ timeout: 15000 });

  // On Free, the page offers the upgrade.
  await endTrial(slug);
  await page.goto(`/workspaces/${slug}/workload`);
  await expect(page.getByRole('heading', { name: 'See who’s busy before you assign' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
