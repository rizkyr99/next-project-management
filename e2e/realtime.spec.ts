import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P5.1: an open project picks up changes made elsewhere (written straight to
 * the database here, as another user's request would), including the kinds
 * the old count/created_at check missed.
 */

const cardNames = (page: Page) =>
  page.locator('[data-testid^="task-"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Open task ', '')).sort());

test('board and list follow changes made by others, and catch up after the tab was hidden', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `rt+${s}@example.com`;
  await registerAndLogin(page, email, 'Rhea Time');
  const slug = `rt-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`RT ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Live');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectId = page.url().split('/').pop()!;

  const sql = await testDb();
  const [{ me }] = await sql`select id as me from "user" where email = ${email}`;
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and is_default`;
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  await sql`insert into task (id, title, priority, "order", project_id, status_id) values
    (${a}, 'Alpha', 'low', 0, ${projectId}, ${todo.id}), (${b}, 'Beta', 'low', 1, ${projectId}, ${todo.id})`;

  // A new task appears (this worked before too).
  await expect.poll(() => cardNames(page), { timeout: 15000 }).toEqual(['Alpha', 'Beta']);

  // Renaming a task: no new row, same count.
  await sql`update task set title = 'Alpha renamed' where id = ${a}`;
  await expect.poll(() => cardNames(page), { timeout: 15000 }).toEqual(['Alpha renamed', 'Beta']);

  // Assigning someone: only task_assignee changes.
  await sql`insert into task_assignee (task_id, user_id) values (${b}, ${me})`;
  await expect(page.getByTestId(`task-${b}`).getByText('RT', { exact: true })).toBeVisible({ timeout: 15000 });

  // Renaming a column: only task_status changes.
  await sql`update task_status set name = 'Backlog' where id = ${todo.id}`;
  await expect(page.getByTestId('column-Backlog')).toBeVisible({ timeout: 15000 });

  // A delete and a create in the same poll: the count stays the same.
  const c = crypto.randomUUID();
  await sql`delete from task where id = ${a}`;
  await sql`insert into task (id, title, priority, "order", project_id, status_id) values (${c}, 'Gamma', 'low', 2, ${projectId}, ${todo.id})`;
  await expect.poll(() => cardNames(page), { timeout: 15000 }).toEqual(['Beta', 'Gamma']);

  // The list view is live too.
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await sql`update task set title = 'Gamma in list' where id = ${c}`;
  await expect(page.getByRole('button', { name: 'Gamma in list', exact: true })).toBeVisible({ timeout: 15000 });

  // Hidden tab: the stream closes; on return it catches up straight away.
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((st) => {
      Object.defineProperty(document, 'visibilityState', { value: st, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await sql`update task set title = 'Changed while away' where id = ${b}`;
  await page.waitForTimeout(6000); // longer than a poll; nothing should arrive while hidden
  await expect(page.getByRole('button', { name: 'Changed while away', exact: true })).toHaveCount(0);
  await setVisibility('visible');
  await expect(page.getByRole('button', { name: 'Changed while away', exact: true })).toBeVisible({ timeout: 5000 });
});
