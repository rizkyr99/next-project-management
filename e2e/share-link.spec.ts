import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { makePro } from './helpers/plan';
import { addTask } from './helpers/tasks';
import { testDb } from './helpers/db';

/**
 * C4 read-only share link: an admin turns it on and copies it; someone with
 * no account sees the board (and nothing internal); replacing, turning off or
 * archiving makes old links 404; the token never reaches non-admins' pages.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('a read-only share link shows the board to anyone, and can be replaced or turned off', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = stamp();
  const slug = `shr-${s}`;
  const memberEmail = `shr-mem+${s}@example.com`;

  const owner = await newUser(browser, `shr-owner+${s}@example.com`, 'Studio Owner');
  const member = await newUser(browser, memberEmail, 'Mia Member');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Studio ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await makePro(slug);
  const sql = await testDb();
  await sql`
    insert into member (id, workspace_id, user_id, role)
    select ${crypto.randomUUID()}, w.id, u.id, 'member' from workspace w, "user" u
    where w.slug = ${slug} and lower(u.email) = ${memberEmail}`;

  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Acme website');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectPath = new URL(owner.page.url()).pathname;
  await addTask(owner.page, 'To Do', 'Homepage');

  // Something internal that must never show on the shared board.
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const sheet = owner.page.getByRole('dialog', { name: 'Homepage' });
  await sheet.getByPlaceholder(/Add a comment/).fill('Secret budget note');
  await sheet.getByRole('button', { name: 'Send comment' }).click();
  await expect(sheet.getByRole('list', { name: 'Comments' }).getByRole('listitem')).not.toHaveAttribute(
    'aria-busy',
    'true',
    { timeout: 15000 },
  );
  await owner.page.keyboard.press('Escape');

  // The owner turns the link on and copies it.
  await owner.page.getByRole('button', { name: 'Project options' }).click();
  await owner.page.getByRole('menuitem', { name: 'Share link…' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Share Acme website' });
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const linkBox = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(linkBox).toBeVisible({ timeout: 15000 });
  const firstLink = new URL(await linkBox.inputValue()).pathname;
  expect(firstLink).toMatch(/^\/share\/[A-Za-z0-9_-]{43}$/);

  // Someone with no account sees the board, and nothing internal.
  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  await anon.goto(firstLink);
  await expect(anon.getByRole('heading', { level: 1, name: 'Acme website' })).toBeVisible();
  await expect(anon.getByText(`Shared by Studio ${s}`)).toBeVisible();
  await expect(anon.getByRole('region', { name: 'To Do' })).toContainText('Homepage');
  await expect(anon.locator('body')).not.toContainText('Secret budget note');
  await expect(anon.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(anon.getByRole('button')).toHaveCount(0);

  // A regular member's page never carries the token (only admins manage it).
  await member.page.goto(projectPath);
  await expect(member.page.getByRole('heading', { level: 1, name: 'Acme website' })).toBeVisible();
  expect(await member.page.content()).not.toContain(firstLink.split('/share/')[1]);
  await member.page.getByRole('button', { name: 'Project options' }).click();
  await expect(member.page.getByRole('menuitem', { name: 'Share link…' })).toHaveCount(0);
  await member.page.keyboard.press('Escape');

  // Replacing the link retires the old one.
  await dialog.getByRole('button', { name: 'Replace link' }).click();
  await expect.poll(async () => new URL(await linkBox.inputValue()).pathname).not.toBe(firstLink);
  const secondLink = new URL(await linkBox.inputValue()).pathname;
  await anon.goto(firstLink);
  await expect(anon.getByText('This page could not be found')).toBeVisible();
  await anon.goto(secondLink);
  await expect(anon.getByRole('heading', { level: 1, name: 'Acme website' })).toBeVisible();

  // Turning it off ends it.
  await dialog.getByRole('button', { name: 'Turn off link' }).click();
  await expect(dialog.getByText('Sharing is off')).toBeVisible({ timeout: 15000 });
  await anon.goto(secondLink);
  await expect(anon.getByText('This page could not be found')).toBeVisible();

  // An archived project isn't shown, even with the link on.
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(linkBox).toBeVisible({ timeout: 15000 });
  const thirdLink = new URL(await linkBox.inputValue()).pathname;
  await owner.page.keyboard.press('Escape');
  await owner.page.getByRole('button', { name: 'Project options' }).click();
  await owner.page.getByRole('menuitem', { name: 'Archive project' }).click();
  await expect(owner.page.getByRole('status').filter({ hasText: 'This project is archived' })).toBeVisible();
  await anon.goto(thirdLink);
  await expect(anon.getByText('This page could not be found')).toBeVisible();

  await owner.context.close();
  await member.context.close();
  await visitor.close();
});

test('the share link also shows the calendar, read-only and without internal tasks (C4)', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = stamp();
  const slug = `shrc-${s}`;
  const owner = await newUser(browser, `shrc-owner+${s}@example.com`, 'Studio Owner');
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
  await owner.context.close();

  // June 2027: Design runs the 7th to the 10th, Launch is due the 16th at 3 pm,
  // a private task is due the 8th, and one task has no dates.
  const sql = await testDb();
  const [todo] = await sql`select id from task_status where project_id = ${projectId} and name = 'To Do'`;
  await sql`insert into task (id, title, "order", project_id, status_id, start_date, due_date, due_has_time, internal) values
    (${crypto.randomUUID()}, 'Design', 1, ${projectId}, ${todo.id}, '2027-06-07', ${new Date(2027, 5, 10)}, false, false),
    (${crypto.randomUUID()}, 'Launch', 2, ${projectId}, ${todo.id}, null, ${new Date(2027, 5, 16, 15, 0)}, true, false),
    (${crypto.randomUUID()}, 'Budget review', 3, ${projectId}, ${todo.id}, null, ${new Date(2027, 5, 8)}, false, true),
    (${crypto.randomUUID()}, 'Copy', 4, ${projectId}, ${todo.id}, null, null, false, false)`;
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  await sql`update project set share_token = ${token} where id = ${projectId}`;

  // Someone without an account.
  const context = await browser.newContext();
  const page = await context.newPage();
  // "Today" is pinned outside June 2027, so switching to the week opens the
  // month's first week whenever this runs (in June 2027 it would open this week).
  await page.clock.setFixedTime(new Date(2026, 10, 15, 12));
  await page.goto(`/share/${token}`);
  const views = page.getByRole('navigation', { name: 'View' });
  await expect(views.getByRole('link', { name: 'Board' })).toHaveAttribute('aria-current', 'page', { timeout: 15000 });
  await views.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/\?view=calendar$/);
  await expect(views.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');

  // Straight to June 2027 (the month is kept in the URL, as in the app).
  await page.goto(`/share/${token}?view=calendar&month=2027-06`);
  await expect(page.getByRole('heading', { name: 'June 2027' })).toBeVisible({ timeout: 15000 });
  const item = (title: string) => page.getByRole('group', { name: new RegExp(`^${title},`) });
  await expect(item('Design')).toHaveAccessibleName(/^Design, Jun 7, 2027 to Jun 10, 2027/);
  await expect(item('Launch')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Without dates' }).getByRole('group', { name: /^Copy,/ })).toBeVisible();
  // Nothing internal, and nothing to click or drag.
  await expect(page.getByText('Budget review')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Design|Launch|Copy),/ })).toHaveCount(0);
  await expect(page.getByText('Drag one onto a day')).toHaveCount(0);

  // The week view works here too.
  await page.getByRole('group', { name: 'Calendar range' }).getByRole('button', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { name: 'May 31 – Jun 6, 2027' })).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByRole('heading', { name: 'Jun 14 – 20, 2027' })).toBeVisible();
  await expect(item('Launch')).toContainText('3:00 PM · To Do');
  await expect(item('Design')).toHaveCount(0);

  await context.close();
});
