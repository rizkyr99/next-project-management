import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** I6: group the list and table by assignee, priority, due date or column. */
test('group the list by assignee and the table by priority; fold a group; the URL keeps it (I6)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `group+${s}@example.com`;
  await registerAndLogin(page, email, 'Gina Group');
  const slug = `group-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Group ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('dialog', { name: 'Create new project' }).getByLabel('Name').fill('Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Site' })).toBeVisible({ timeout: 15000 });
  const projectId = page.url().split('/').pop()!;

  // Seed: three tasks; one mine and urgent, one shared with a teammate, one unassigned.
  const sql = await testDb();
  const [{ me, wsId }] = await sql`
    select u.id as me, p.workspace_id as "wsId" from "user" u, project p where u.email = ${email} and p.id = ${projectId}`;
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and name = 'To Do'`;
  const teo = crypto.randomUUID();
  await sql`insert into "user" (id, name, email) values (${teo}, 'Teo', ${`group-teo+${s}@example.com`})`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${teo}, 'member')`;
  const ids = { logo: crypto.randomUUID(), copy: crypto.randomUUID(), photos: crypto.randomUUID() };
  await sql`insert into task (id, title, priority, "order", project_id, status_id) values
    (${ids.logo}, 'Logo', 'urgent', 101, ${projectId}, ${todo.id}),
    (${ids.copy}, 'Copy', 'low', 102, ${projectId}, ${todo.id}),
    (${ids.photos}, 'Photos', 'low', 103, ${projectId}, ${todo.id})`;
  await sql`insert into task_assignee (task_id, user_id) values
    (${ids.logo}, ${me}), (${ids.copy}, ${me}), (${ids.copy}, ${teo})`;

  // List, grouped by assignee: me first, then Teo, then unassigned; "Copy" under both of us.
  await page.goto(`/workspaces/${slug}/projects/${projectId}?view=list`);
  await page.getByRole('combobox', { name: 'Group by' }).click();
  await page.getByRole('option', { name: 'Assignee' }).click();
  await expect(page).toHaveURL(/group=assignee/);
  const mine = page.getByRole('group', { name: 'Gina Group (you)' });
  const teos = page.getByRole('group', { name: 'Teo' });
  const unassigned = page.getByRole('group', { name: 'Unassigned' });
  await expect(mine.getByTestId('list-task-title')).toHaveText(['Logo', 'Copy']);
  await expect(teos.getByTestId('list-task-title')).toHaveText(['Copy']);
  await expect(unassigned.getByTestId('list-task-title')).toContainText(['Photos']);

  // Fold my group: its tasks hide, the count stays.
  const myToggle = mine.getByRole('button', { name: /Gina Group \(you\)/ });
  await expect(myToggle).toContainText('2');
  await myToggle.click();
  await expect(myToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(mine.getByTestId('list-task-title')).toHaveCount(0);

  // Select all takes only what's on screen: "Copy" (still open under Teo),
  // not "Logo", which is only in the folded group.
  await page.getByRole('checkbox', { name: 'Select all' }).click();
  await myToggle.click();
  await expect(mine.getByRole('checkbox', { name: 'Select Logo' })).not.toBeChecked();
  await expect(mine.getByRole('checkbox', { name: 'Select Copy' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Select all' }).click(); // now not all: selects the rest
  await page.getByRole('checkbox', { name: 'Select all' }).click(); // clears
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0);

  // Table, grouped by priority, survives a reload.
  await page.goto(`/workspaces/${slug}/projects/${projectId}?view=table`);
  await page.getByRole('combobox', { name: 'Group by' }).click();
  await page.getByRole('option', { name: 'Priority' }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Group by' })).toHaveText('Priority');
  const headings = page.getByRole('button', { expanded: true });
  await expect(headings.filter({ hasText: 'Urgent' })).toContainText('1');
  await expect(headings.filter({ hasText: 'Low' })).toContainText('2');

  // Back to one flat list.
  await page.getByRole('combobox', { name: 'Group by' }).click();
  await page.getByRole('option', { name: 'Nothing' }).click();
  await expect(page).not.toHaveURL(/group=/);
  await expect(page.getByRole('button', { expanded: true }).filter({ hasText: 'Urgent' })).toHaveCount(0);
});
