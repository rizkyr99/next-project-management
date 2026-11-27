import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** I2: duplicate a task, and move one to another project. */
test('duplicate a task with its checklist and labels; move it to another project with its comments (I2)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `dup+${s}@example.com`;
  await registerAndLogin(page, email, 'Dana Dup');
  const slug = `dup-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Dup ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  const ids: Record<string, string> = {};
  for (const name of ['Website', 'Brand']) {
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('dialog', { name: 'Create new project' }).getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
    ids[name] = page.url().split('/').pop()!;
  }

  // Seed: a task in Website's "In Progress", mine, labelled, with a half-done checklist and a comment.
  const sql = await testDb();
  const [{ me, workspaceId }] = await sql`
    select u.id as me, p.workspace_id as "workspaceId" from "user" u, project p
    where u.email = ${email} and p.id = ${ids.Website}`;
  const [doing] = await sql`select id from task_status where project_id = ${ids.Website} and name = 'In Progress'`;
  const taskId = crypto.randomUUID();
  const labelId = crypto.randomUUID();
  await sql`insert into task (id, title, priority, "order", project_id, status_id)
    values (${taskId}, 'Hero illustration', 'high', 1, ${ids.Website}, ${doing.id})`;
  await sql`insert into task_assignee (task_id, user_id) values (${taskId}, ${me})`;
  await sql`insert into label (id, workspace_id, name, color) values (${labelId}, ${workspaceId}, 'Design', 'pink')`;
  await sql`insert into task_label (task_id, label_id) values (${taskId}, ${labelId})`;
  await sql`insert into checklist_item (id, task_id, title, done, position) values
    (${crypto.randomUUID()}, ${taskId}, 'Sketch', true, 0), (${crypto.randomUUID()}, ${taskId}, 'Colour', false, 1)`;
  await sql`insert into comment (id, task_id, author_id, body) values (${crypto.randomUUID()}, ${taskId}, ${me}, 'Use the new palette')`;

  // Duplicate: a copy in the same column, checklist unticked, same label.
  await page.goto(`/workspaces/${slug}/projects/${ids.Website}?task=${taskId}`);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Hero illustration' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Task actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate task' }).click();
  await expect(page.getByText('Duplicated “Hero illustration”')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Hero illustration (copy)' })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  const column = page.getByTestId('column-In Progress');
  const copy = column.getByRole('button', { name: 'Open task Hero illustration (copy)' });
  await expect(copy).toContainText('Design');
  await expect(copy.getByLabel('Checklist: 0 of 2 done')).toBeVisible();
  await expect(column.getByRole('button', { name: 'Open task Hero illustration', exact: true })).toBeVisible();

  // Move the original to Brand: same-named column there, with its comment and checklist.
  await column.getByRole('button', { name: 'Open task Hero illustration', exact: true }).click();
  await sheet.getByRole('button', { name: 'Task actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to project…' }).click();
  const move = page.getByRole('dialog', { name: 'Move task' });
  await move.getByLabel('Project').click();
  await page.getByRole('option', { name: 'Brand' }).click();
  await move.getByRole('button', { name: 'Move task' }).click();
  await expect(page.getByText('Moved “Hero illustration” to Brand')).toBeVisible();
  await expect(page.getByText('It’s in In Progress.')).toBeVisible();
  // Straight to the toast's action, before it times out on a slow machine.
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${ids.Brand}\\?task=${taskId}`));
  await expect(sheet.getByRole('button', { name: 'Hero illustration' })).toBeVisible({ timeout: 15000 });
  await expect(sheet.getByText('Use the new palette')).toBeVisible();
  await expect(sheet.getByText('moved "Hero illustration" from "Website" to "Brand"')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByTestId('column-In Progress').getByRole('button', { name: 'Open task Hero illustration', exact: true }),
  ).toContainText('Design');

  // Website keeps only the copy.
  await page.goto(`/workspaces/${slug}/projects/${ids.Website}`);
  await expect(page.getByRole('button', { name: 'Open task Hero illustration (copy)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open task Hero illustration', exact: true })).toHaveCount(0);
});
