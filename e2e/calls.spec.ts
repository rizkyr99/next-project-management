import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

async function newProject(page: Page, prefix: string) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `${prefix}+${s}@example.com`, 'Cal Caller');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`${prefix} ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`${prefix}-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${prefix}-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Calls');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  return { projectId: new URL(page.url()).pathname.split('/').pop()!, s };
}

test('viewing a project does not put you in its call', async ({ page }) => {
  test.setTimeout(60_000);
  const { projectId } = await newProject(page, 'view');
  await expect(page.getByRole('button', { name: /start call/i })).toBeVisible();
  // Longer than a few polls of the call stream.
  await page.waitForTimeout(8000);
  const sql = await testDb();
  const rows = await sql`select 1 from call_participant where project_id = ${projectId}`;
  expect(rows).toHaveLength(0);
  await expect(page.getByRole('button', { name: /start call/i })).toBeVisible();
});

test('a full call says so instead of joining', async ({ page }) => {
  test.setTimeout(60_000);
  const { projectId, s } = await newProject(page, 'full');
  const sql = await testDb();
  for (let i = 0; i < 4; i++) {
    const id = `e2e-call-${s}-${i}`;
    await sql`insert into "user" (id, name, email) values (${id}, ${`Guest ${i}`}, ${`${id}@example.com`})`;
    await sql`insert into call_participant (id, project_id, user_id) values (${crypto.randomUUID()}, ${projectId}, ${id})`;
  }
  // Keep the guests' places fresh while the page notices them.
  const keepAlive = setInterval(() => {
    void sql`update call_participant set last_seen = now() where project_id = ${projectId}`;
  }, 3000);
  try {
    const join = page.getByRole('button', { name: /join call \(4\)/i });
    await expect(join).toBeVisible({ timeout: 15000 });
    await join.click();
    await expect(page.getByText(/this call is full \(4 people max\)/i)).toBeVisible({ timeout: 15000 });
    const mine = await sql`
      select 1 from call_participant cp join "user" u on u.id = cp.user_id
      where cp.project_id = ${projectId} and u.email like ${'full+%'}`;
    expect(mine).toHaveLength(0);
  } finally {
    clearInterval(keepAlive);
    await sql`delete from "user" where id like ${`e2e-call-${s}-%`}`;
  }
});
