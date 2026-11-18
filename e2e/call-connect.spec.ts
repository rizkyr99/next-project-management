import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

// Chromium's built-in fake camera and microphone, with permission granted.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});

/** Videos actually showing frames: your own, plus one per connected peer. */
const playingVideos = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length);

test('two people in a call see each other, and leaving ends it for the other side', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await registerAndLogin(a, `calla+${s}@example.com`, 'Ada Caller');
  await a.goto('/create-workspace');
  await a.getByPlaceholder('e.g. Tide Corp Design').fill(`Call ${s}`);
  await a.getByPlaceholder('e.g. tide-corp-design').fill(`call-${s}`);
  await a.getByRole('button', { name: /create workspace/i }).click();
  await expect(a).toHaveURL(new RegExp(`/workspaces/call-${s}$`), { timeout: 15000 });
  await a.getByRole('button', { name: 'Add project' }).click();
  await a.getByLabel('Name').fill('Standup');
  await a.getByRole('button', { name: 'Create project' }).click();
  await expect(a).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = a.url();

  // Bob joins the workspace directly (invites have their own spec).
  await registerAndLogin(b, `callb+${s}@example.com`, 'Bob Caller');
  const sql = await testDb();
  await sql`
    insert into member (id, workspace_id, user_id, role)
    select ${crypto.randomUUID()}, w.id, u.id, 'member'
    from workspace w, "user" u
    where w.slug = ${`call-${s}`} and u.email = ${`callb+${s}@example.com`}`;
  await b.goto(projectUrl);

  await a.getByRole('button', { name: /start call/i }).click();
  await expect(a.getByText('Call · 1 of 4')).toBeVisible({ timeout: 15000 });
  await expect(a.getByText('Beta')).toBeVisible();

  // Bob sees Ada waiting, and joins.
  const join = b.getByRole('button', { name: /join call \(1\)/i });
  await expect(join).toBeVisible({ timeout: 15000 });
  await join.click();

  for (const page of [a, b]) {
    await expect(page.getByText('Call · 2 of 4')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => playingVideos(page), { timeout: 30000 }).toBe(2);
  }

  // Bob leaves: Ada's call drops back to one, and Bob isn't put back.
  await b.getByRole('button', { name: 'Leave call' }).click();
  await expect(a.getByText('Call · 1 of 4')).toBeVisible({ timeout: 15000 });
  await expect(b.getByRole('button', { name: /join call \(1\)/i })).toBeVisible({ timeout: 15000 });
  await b.waitForTimeout(4000);
  const bob = await sql`
    select 1 from call_participant cp join "user" u on u.id = cp.user_id
    where u.email = ${`callb+${s}@example.com`}`;
  expect(bob).toHaveLength(0);
});
