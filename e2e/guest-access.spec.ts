import { test, expect, type Browser, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';
import { testDb } from './helpers/db';

/**
 * C1 client guests. A guest sees only the projects shared with them, can
 * comment there, can't edit, and can't reach anything else in the workspace:
 * not another project (by URL, live stream or upload), not the member list,
 * not search results from other projects. Removing them ends it all.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

async function createProject(page: Page, name: string) {
  const from = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  // A new project page, not the one we may already be on.
  await page.waitForURL((u) => u.pathname !== from && /\/projects\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
  return page.url().split('/projects/')[1];
}

test('a client guest sees only shared projects, comments there, and nothing else', async ({ browser }) => {
  test.setTimeout(150_000);
  const s = stamp();
  const slug = `gst-${s}`;
  const guestEmail = `gst-client+${s}@example.com`;

  // The studio: two client projects, a task in each.
  const owner = await newUser(browser, `gst-owner+${s}@example.com`, 'Studio Owner');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Studio ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  const projectA = await createProject(owner.page, 'Acme website');
  await addTask(owner.page, 'To Do', 'Homepage design');
  const projectB = await createProject(owner.page, 'Globex rebrand');
  await addTask(owner.page, 'To Do', 'Secret logo work');
  const [{ id: taskB }] = await (await testDb())`select id from task where project_id = ${projectB}`;

  // Invite the client as a guest of "Acme website" only.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await owner.page.getByRole('tab', { name: /Members/ }).click();
  const card = owner.page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(guestEmail);
  await card.getByRole('combobox', { name: 'Role' }).click();
  await owner.page.getByRole('option', { name: 'Guest (client)' }).click();
  // A guest invite needs a project.
  await card.getByRole('button', { name: 'Send invite' }).click();
  await expect(card.getByText('Choose at least one project to share.')).toBeVisible();
  await card.getByRole('checkbox', { name: 'Acme website' }).check();
  await card.getByRole('button', { name: 'Send invite' }).click();
  const link = card.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const invitePath = new URL(await link.inputValue()).pathname;

  // The client accepts.
  const guest = await newUser(browser, guestEmail, 'Cleo Client');
  await guest.page.goto(invitePath);
  await expect(guest.page.getByText(/as a guest/)).toBeVisible();
  await guest.page.getByRole('button', { name: 'Accept invite' }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // Their home and sidebar show only the shared project; no team pages, no invite.
  await expect(guest.page.getByRole('list', { name: 'Shared projects' }).getByRole('link')).toHaveCount(1);
  const sidebar = guest.page.locator('[data-sidebar="sidebar"]').first();
  await expect(sidebar.getByRole('link', { name: 'Acme website' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Globex rebrand' })).toHaveCount(0);
  for (const name of ['My tasks', 'Activity', 'Settings']) {
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(0);
  }
  await expect(sidebar.getByRole('button', { name: 'Add project' })).toHaveCount(0);
  await expect(guest.page.getByRole('button', { name: 'Invite to workspace' })).toHaveCount(0);

  // In the shared project: read-only board, but comments work.
  await sidebar.getByRole('link', { name: 'Acme website' }).click();
  await expect(guest.page.getByRole('heading', { level: 1, name: 'Acme website' })).toBeVisible();
  await expect(guest.page.getByRole('button', { name: 'Add task' })).toHaveCount(0);
  await expect(guest.page.getByRole('button', { name: 'Project options' })).toHaveCount(0);
  await guest.page.getByRole('button', { name: 'Open task Homepage design' }).click();
  const sheet = guest.page.getByRole('dialog', { name: 'Homepage design' });
  await expect(sheet.getByRole('button', { name: 'Delete task' })).toHaveCount(0);
  await expect(sheet.getByRole('combobox', { name: 'Status' })).toHaveCount(0);
  await expect(sheet.getByRole('textbox', { name: 'Add a checklist step' })).toHaveCount(0);
  await sheet.getByPlaceholder(/Add a comment/).fill('Looks great, approved from our side.');
  await sheet.getByRole('button', { name: 'Send comment' }).click();
  await expect(sheet.getByText('Looks great, approved from our side.')).toBeVisible({ timeout: 15000 });

  // The other client's project is out of reach: page, live stream and uploads.
  await guest.page.goto(`/workspaces/${slug}/projects/${projectB}`);
  await expect(guest.page.getByText(/could not be found/i)).toBeVisible();
  await expect(guest.page).not.toHaveTitle(/Globex/);
  expect((await guest.page.request.get(`/api/tasks/stream?projectId=${projectB}`)).status()).toBe(404);
  const upload = await guest.page.request.post('/api/uploads', {
    multipart: { taskId: taskB, file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
  });
  expect(upload.status()).toBe(404);

  // Team pages send them home; settings offer only "Leave".
  for (const path of ['my-tasks', 'activity', 'archived']) {
    await guest.page.goto(`/workspaces/${slug}/${path}`);
    await expect(guest.page).toHaveURL(new RegExp(`/workspaces/${slug}$`));
  }
  await guest.page.goto(`/workspaces/${slug}/settings`);
  await expect(guest.page.getByRole('button', { name: 'Leave workspace' })).toBeVisible();
  await expect(guest.page.getByText(`gst-owner+${s}@example.com`)).toHaveCount(0);
  await expect(guest.page.getByRole('tab', { name: /Members/ })).toHaveCount(0);

  // The studio sees the comment and the guest, then shares the second project too.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await owner.page.getByRole('tab', { name: /Members/ }).click();
  await expect(owner.page.getByText('Sees: Acme website')).toBeVisible();
  await owner.page.getByRole('button', { name: 'Cleo Client options' }).click();
  await owner.page.getByRole('menuitem', { name: 'Change projects' }).click();
  const dialog = owner.page.getByRole('dialog', { name: /Projects shared with Cleo Client/ });
  await dialog.getByRole('checkbox', { name: 'Globex rebrand' }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(owner.page.getByText('Sees: Acme website, Globex rebrand')).toBeVisible({ timeout: 15000 });
  await guest.page.goto(`/workspaces/${slug}/projects/${projectB}`);
  await expect(guest.page.getByRole('heading', { level: 1, name: 'Globex rebrand' })).toBeVisible();

  // Removing the guest ends their access everywhere.
  await owner.page.getByRole('button', { name: 'Cleo Client options' }).click();
  await owner.page.getByRole('menuitem', { name: 'Remove member' }).click();
  await expect(owner.page.getByText('Sees: Acme website, Globex rebrand')).toHaveCount(0, { timeout: 15000 });
  const [{ n }] = await (await testDb())`
    select count(*)::int as n from project_guest pg join "user" u on u.id = pg.user_id where lower(u.email) = ${guestEmail}`;
  expect(n).toBe(0);
  await guest.page.goto(`/workspaces/${slug}/projects/${projectA}`);
  await expect(guest.page.getByRole('heading', { level: 1, name: 'Acme website' })).toHaveCount(0);

  await owner.context.close();
  await guest.context.close();
});
