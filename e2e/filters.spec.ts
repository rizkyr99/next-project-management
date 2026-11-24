import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** P4.4: filters live in the URL, apply to every view, and the list sorts. */

const cards = (page: Page) =>
  page.locator('[data-testid^="task-"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Open task ', '')).sort());

test('filter the board and list by assignee, priority, due date and text; sort the list', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `flt+${s}@example.com`;
  await registerAndLogin(page, email, 'Fay');
  const slug = `flt-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Flt WS ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Filters');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = page.url();

  // Seed: five tasks with a spread of owners, priorities and due dates.
  const sql = await testDb();
  const [{ me, projectId }] = await sql`
    select u.id as me, p.id as "projectId" from "user" u, project p
    where u.email = ${email} and p.id = ${projectUrl.split('/').pop()}`;
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and is_default`;
  const rows: [string, string, number | null, boolean, string | null][] = [
    ['Fix login bug', 'high', -2, true, 'Users get logged out'],
    ['Write release notes', 'medium', 3, true, null],
    ['Plan offsite', 'low', null, false, 'Budget and venue'],
    ['Update pricing page', 'high', 10, false, null],
    ['Archive old tickets', 'low', -5, false, null],
  ];
  let order = 0;
  for (const [title, priority, dueIn, mine, description] of rows) {
    const id = crypto.randomUUID();
    await sql`insert into task (id, title, description, priority, due_date, "order", project_id, status_id)
      values (${id}, ${title}, ${description}, ${priority}, ${dueIn === null ? null : new Date(Date.now() + dueIn * 86400000).toISOString()}, ${order++}, ${projectId}, ${todo.id})`;
    if (mine) await sql`insert into task_assignee (task_id, user_id) values (${id}, ${me})`;
  }
  await page.reload();
  await expect.poll(() => cards(page)).toHaveLength(5);

  // Assigned to me.
  await page.getByRole('combobox', { name: 'Assignee' }).click();
  await page.getByRole('option', { name: 'Assigned to me' }).click();
  await expect.poll(() => cards(page)).toEqual(['Fix login bug', 'Write release notes']);
  await expect(page).toHaveURL(/assignee=me/);
  await expect(page.getByRole('status').filter({ hasText: 'Showing 2 of 5 tasks' })).toContainText(
    'Dragging cards is off',
  );

  // Plus high priority.
  await page.getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'High' }).click();
  await expect.poll(() => cards(page)).toEqual(['Fix login bug']);

  // Reset assignee; overdue + text in the description.
  await page.getByRole('combobox', { name: 'Assignee' }).click();
  await page.getByRole('option', { name: 'Anyone' }).click();
  await page.getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'Any priority' }).click();
  await page.getByRole('combobox', { name: 'Due date' }).click();
  await page.getByRole('option', { name: 'Overdue' }).click();
  await expect.poll(() => cards(page)).toEqual(['Archive old tickets', 'Fix login bug']);
  await page.getByLabel('Filter by text').fill('logged out');
  await expect.poll(() => cards(page)).toEqual(['Fix login bug']);
  await expect(page).toHaveURL(/q=logged\+out/);

  // Shareable: survives a reload, and switching to the list keeps it.
  await page.reload();
  await expect.poll(() => cards(page)).toEqual(['Fix login bug']);
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page).toHaveURL(/due=overdue/);
  await expect(page.getByRole('button', { name: 'Fix login bug', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive old tickets', exact: true })).toHaveCount(0);

  // Clear, then sort the list by task name.
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByRole('button', { name: 'Plan offsite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Sort by Task/ }).click();
  await expect(page).toHaveURL(/sort=title/);
  const listTitles = () =>
    page.getByTestId('list-task-title').evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  await expect
    .poll(listTitles)
    .toEqual(['Archive old tickets', 'Fix login bug', 'Plan offsite', 'Update pricing page', 'Write release notes']);
  await page.getByRole('button', { name: /^Sort by Task, currently ascending/ }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await expect
    .poll(listTitles)
    .toEqual(['Write release notes', 'Update pricing page', 'Plan offsite', 'Fix login bug', 'Archive old tickets']);

  // Nothing matches: say so, with a way out.
  await page.getByLabel('Filter by text').fill('zzz-nothing');
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
});
