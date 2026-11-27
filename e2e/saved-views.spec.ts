import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** D3: built-in and saved views of a project, and My tasks by project. */

const cards = (page: Page) =>
  page
    .locator('[data-testid^="task-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Open task ', '')).sort());

const listRows = (page: Page) =>
  page.getByTestId('list-task-title').evaluateAll((els) => els.map((e) => e.textContent!.trim()).sort());

test('built-in views, save and reapply a view, delete it; My tasks by project (D3)', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `views+${s}@example.com`;
  await registerAndLogin(page, email, 'Vic Views');
  const slug = `views-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Views ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  const projectIds: string[] = [];
  for (const name of ['Website', 'Brand']) {
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('dialog', { name: 'Create new project' }).getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
    projectIds.push(page.url().split('/').pop()!);
  }

  // Seed: mine overdue, mine later, someone else's waiting on the client, unassigned.
  const sql = await testDb();
  const [{ me }] = await sql`select id as me from "user" where email = ${email}`;
  const day = 86_400_000;
  const seed: [string, number, string | null, boolean, boolean][] = [
    ['Fix footer', 0, new Date(Date.now() - 3 * day).toISOString(), true, false],
    ['Write copy', 0, new Date(Date.now() + 20 * day).toISOString(), true, false],
    ['Homepage mockup', 0, null, false, true],
    ['Pick fonts', 1, null, true, false],
  ];
  for (const [title, p, due, mine, approval] of seed) {
    const [todo] = await sql`select id from task_status where project_id = ${projectIds[p]} and is_default`;
    const id = crypto.randomUUID();
    await sql`insert into task (id, title, priority, due_date, "order", project_id, status_id)
      values (${id}, ${title}, 'medium', ${due}, 1, ${projectIds[p]}, ${todo.id})`;
    if (mine) await sql`insert into task_assignee (task_id, user_id) values (${id}, ${me})`;
    if (approval) await sql`insert into task_approval (id, task_id, status, requested_by_id) values (${crypto.randomUUID()}, ${id}, 'pending', ${me})`;
  }

  await page.goto(`/workspaces/${slug}/projects/${projectIds[0]}`);
  await expect.poll(() => cards(page)).toHaveLength(3);

  // Built in: filters only, the menu names the one in use.
  const views = page.getByRole('button', { name: /^Views:/ });
  await views.click();
  await page.getByRole('menuitem', { name: 'My overdue' }).click();
  await expect.poll(() => cards(page)).toEqual(['Fix footer']);
  await expect(page.getByRole('button', { name: 'Views: My overdue' })).toBeVisible();

  await page.getByRole('button', { name: 'Views: My overdue' }).click();
  await page.getByRole('menuitem', { name: 'Waiting on client' }).click();
  await expect.poll(() => cards(page)).toEqual(['Homepage mockup']);
  await expect(page.getByRole('combobox', { name: 'Approval' })).toContainText('Waiting on client');

  // Save a view of my own: the list, my tasks, sorted by due date.
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('combobox', { name: 'Assignee' }).click();
  await page.getByRole('option', { name: 'Assigned to me' }).click();
  await expect.poll(() => listRows(page)).toEqual(['Fix footer', 'Write copy']);
  // "Assigned to me" is also a built-in view; a layout makes it worth saving anyway.
  await page.getByRole('button', { name: 'Views: Assigned to me' }).click();
  await page.getByRole('menuitem', { name: 'Save current view…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save view' });
  await dialog.getByLabel('View name').fill('My list');
  await dialog.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText('Saved “My list”')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Views: My list' })).toBeVisible();

  // Back on the board with no filters, then reapply it.
  await page.goto(`/workspaces/${slug}/projects/${projectIds[0]}`);
  await expect.poll(() => cards(page)).toHaveLength(3);
  await page.getByRole('button', { name: 'Views: none' }).click();
  await page.getByRole('menuitem', { name: 'My list' }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => listRows(page)).toEqual(['Fix footer', 'Write copy']);

  // Delete it.
  await page.getByRole('button', { name: 'Views: My list' }).click();
  await page.getByRole('menuitem', { name: 'Delete a view' }).click();
  await page.getByRole('menuitem', { name: 'Delete My list' }).click();
  await expect(page.getByText('Deleted “My list”')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Views: Assigned to me' })).toBeVisible();

  // My tasks: by due date by default; by project on request, kept in the URL.
  await page.goto(`/workspaces/${slug}/my-tasks`);
  await expect(page.getByTestId('due-group-overdue')).toContainText('Fix footer');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await expect(page).toHaveURL(/group=project/);
  const brand = page.getByTestId(`project-group-${projectIds[1]}`);
  const website = page.getByTestId(`project-group-${projectIds[0]}`);
  await expect(brand).toContainText('Pick fonts');
  await expect(website.getByRole('link')).toHaveText(['Website', 'Fix footer', 'Write copy']);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Project', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
