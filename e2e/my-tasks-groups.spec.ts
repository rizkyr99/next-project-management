import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

test('My tasks is grouped into overdue, today, next 7 days, later and no due date', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `mine+${s}@example.com`;
  await registerAndLogin(page, email, 'Mina Mine');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Mine ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`mine-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/mine-${s}$`), { timeout: 15000 });

  // Five tasks assigned to me, one per group, in the Getting started project.
  const sql = await testDb();
  const [{ userId, projectId, statusId }] = await sql`
    select u.id as "userId", p.id as "projectId", ts.id as "statusId"
    from "user" u join member m on m.user_id = u.id join workspace w on w.id = m.workspace_id
    join project p on p.workspace_id = w.id join task_status ts on ts.project_id = p.id
    where u.email = ${email} and w.slug = ${`mine-${s}`} order by ts."order" limit 1`;
  const day = 86_400_000;
  const noonToday = new Date();
  noonToday.setHours(12, 0, 0, 0);
  const rows: [string, Date | null][] = [
    ['Overdue invoice', new Date(noonToday.getTime() - 3 * day)],
    ['Today standup notes', new Date(noonToday.getTime() + 60_000)],
    ['Soon client review', new Date(noonToday.getTime() + 3 * day)],
    ['Later rebrand', new Date(noonToday.getTime() + 30 * day)],
    ['Someday ideas', null],
  ];
  let order = 100;
  for (const [title, due] of rows) {
    const id = crypto.randomUUID();
    await sql`insert into task (id, title, priority, due_date, "order", project_id, status_id)
      values (${id}, ${title}, 'medium', ${due ? due.toISOString() : null}, ${order++}, ${projectId}, ${statusId})`;
    await sql`insert into task_assignee (task_id, user_id) values (${id}, ${userId})`;
  }

  await page.goto(`/workspaces/mine-${s}/my-tasks`);
  const expected: [string, string, string][] = [
    ['overdue', 'Overdue', 'Overdue invoice'],
    ['today', 'Today', 'Today standup notes'],
    ['week', 'Next 7 days', 'Soon client review'],
    ['later', 'Later', 'Later rebrand'],
    ['none', 'No due date', 'Someday ideas'],
  ];
  for (const [key, heading, title] of expected) {
    const group = page.getByTestId(`due-group-${key}`);
    await expect(group.getByRole('heading', { name: new RegExp(`^${heading}`) })).toBeVisible();
    await expect(group.getByRole('link', { name: title })).toBeVisible();
  }
  // In this order on the page (the Getting started tasks may add to some groups).
  const onPage = await page.locator('[data-testid^="due-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const positions = expected.map(([key]) => onPage.indexOf(`due-group-${key}`));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});
