import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';
import { makePro } from './helpers/plan';

/** C2: internal tasks are the team's; the client and the share link never see them. */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('the team hides a task from the client; the client, search and the share link never see it (C2)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const s = stamp();
  const slug = `itask-${s}`;
  const guestEmail = `itask-client+${s}@example.com`;
  const owner = await newUser(browser, `itask-owner+${s}@example.com`, 'Studio Owner');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Studio ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await makePro(slug);
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Acme website');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectId = owner.page.url().split('/').pop()!;
  const projectUrl = `/workspaces/${slug}/projects/${projectId}`;

  // Two tasks, and the client added as a guest of this project (invites have their own spec).
  const guest = await newUser(browser, guestEmail, 'Cleo Client');
  const sql = await testDb();
  const [{ wsId, guestId }] = await sql`
    select w.id as "wsId", (select id from "user" where email = ${guestEmail}) as "guestId"
    from workspace w where w.slug = ${slug}`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${crypto.randomUUID()}, ${wsId}, ${guestId}, 'guest')`;
  await sql`insert into project_guest (project_id, user_id) values (${projectId}, ${guestId})`;
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and name = 'To Do'`;
  const hidden = crypto.randomUUID();
  await sql`insert into task (id, title, description, "order", project_id, status_id) values
    (${crypto.randomUUID()}, 'Invoice template', null, 1, ${projectId}, ${todo.id}),
    (${hidden}, 'Chase late invoice', 'Overdue since March', 2, ${projectId}, ${todo.id})`;

  // The team hides one from the client: badge on the card and in the sheet.
  await owner.page.goto(`${projectUrl}?task=${hidden}`);
  const sheet = owner.page.getByRole('dialog', { name: 'Chase late invoice' });
  await sheet.getByRole('button', { name: 'Task actions' }).click();
  await owner.page.getByRole('menuitem', { name: 'Hide from client' }).click();
  await expect(owner.page.getByText('Only your team can see this task now')).toBeVisible();
  await expect(sheet.getByText('Internal', { exact: true })).toBeVisible({ timeout: 15000 });
  // Nothing on it can be shared with or asked of the client.
  await expect(sheet.getByRole('button', { name: /request approval/i })).toHaveCount(0);
  await expect(sheet.getByRole('radiogroup', { name: 'Who sees this comment' })).toHaveCount(0);
  await owner.page.keyboard.press('Escape');
  await expect(owner.page.getByRole('button', { name: 'Open task Chase late invoice' })).toContainText('Internal');
  const [{ internal }] = await sql`select internal from task where id = ${hidden}`;
  expect(internal).toBe(true);

  // The client sees the other task, not this one: not on the board, by link, or in search.
  await guest.page.goto(projectUrl);
  await expect(guest.page.getByRole('button', { name: 'Open task Invoice template' })).toBeVisible({ timeout: 15000 });
  await expect(guest.page.getByRole('button', { name: 'Open task Chase late invoice' })).toHaveCount(0);
  await guest.page.goto(`${projectUrl}?task=${hidden}`);
  await expect(guest.page.getByRole('dialog', { name: 'Chase late invoice' })).toHaveCount(0);
  await guest.page.keyboard.press('ControlOrMeta+k');
  await guest.page.getByPlaceholder('Search, or type a command…').fill('invoice');
  // Results have arrived (the visible task matches too), and the internal one isn't among them.
  await expect(guest.page.getByRole('option', { name: /Invoice template/ })).toBeVisible({ timeout: 15000 });
  await expect(guest.page.getByRole('option', { name: /Chase late invoice/ })).toHaveCount(0);
  await guest.page.keyboard.press('Escape');

  // Nor does the share link.
  // A real share link's shape: 32 random bytes, base64url (43 characters).
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  await sql`update project set share_token = ${token} where id = ${projectId}`;
  await guest.page.goto(`/share/${token}`);
  await expect(guest.page.getByText('Invoice template')).toBeVisible({ timeout: 15000 });
  await expect(guest.page.getByText('Chase late invoice')).toHaveCount(0);

  // Shown again, the client sees it.
  await owner.page.goto(`${projectUrl}?task=${hidden}`);
  await sheet.getByRole('button', { name: 'Task actions' }).click();
  await owner.page.getByRole('menuitem', { name: 'Show to client' }).click();
  await expect(owner.page.getByText('The client can see this task now')).toBeVisible();
  await guest.page.goto(projectUrl);
  await expect(guest.page.getByRole('button', { name: 'Open task Chase late invoice' })).toBeVisible({
    timeout: 15000,
  });

  await owner.context.close();
  await guest.context.close();
});
