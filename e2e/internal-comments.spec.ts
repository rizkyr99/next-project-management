import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

/**
 * C2 internal vs client-visible comments. Once a project has a guest, team
 * comments are internal unless posted to the client; a guest sees only what
 * was shared (thread, counts, images), and sharing can be undone.
 */

const PNG = readFileSync(path.join(__dirname, 'fixtures/screenshot.png'));
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

async function post(page: Page, text: string) {
  const sheet = page.getByRole('dialog', { name: 'Homepage' });
  await sheet.getByPlaceholder(/Add (a|an internal) comment/).fill(text);
  await sheet.getByRole('button', { name: 'Send comment' }).click();
  // Wait for the save, not just the optimistic copy (aria-busy while pending).
  const item = sheet.getByRole('list', { name: 'Comments' }).getByRole('listitem').filter({ hasText: text.split('\n')[0] });
  await expect(item).toBeVisible({ timeout: 15000 });
  await expect(item).not.toHaveAttribute('aria-busy', 'true', { timeout: 15000 });
}

test('internal comments stay with the team; shared ones reach the client', async ({ browser }) => {
  test.setTimeout(150_000);
  const s = stamp();
  const slug = `int-${s}`;
  const guestEmail = `int-client+${s}@example.com`;

  const owner = await newUser(browser, `int-owner+${s}@example.com`, 'Studio Owner');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Studio ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Acme website');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(owner.page.url()).pathname;
  await addTask(owner.page, 'To Do', 'Homepage');

  // Before any guest: no choice to make, but the comment is still internal.
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const sheet = owner.page.getByRole('dialog', { name: 'Homepage' });
  await expect(sheet.getByRole('radiogroup', { name: 'Who sees this comment' })).toHaveCount(0);
  await post(owner.page, 'Early note before the client joined');

  // Invite the client to this project.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await owner.page.getByRole('tab', { name: /Members/ }).click();
  const card = owner.page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(guestEmail);
  await card.getByRole('combobox', { name: 'Role' }).click();
  await owner.page.getByRole('option', { name: 'Guest (client)' }).click();
  await card.getByRole('checkbox', { name: 'Acme website' }).check();
  await card.getByRole('button', { name: 'Send invite' }).click();
  const link = card.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  const guest = await newUser(browser, guestEmail, 'Cleo Client');
  await guest.page.goto(invitePath);
  await guest.page.getByRole('button', { name: 'Accept invite' }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // Now the team chooses: internal by default, with an image.
  await owner.page.goto(projectUrl);
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const comments = sheet.getByRole('list', { name: 'Comments' });
  await expect(comments.getByRole('listitem').filter({ hasText: 'Early note' })).toContainText('Internal', {
    timeout: 15000,
  });
  const choice = sheet.getByRole('radiogroup', { name: 'Who sees this comment' });
  await expect(choice.getByRole('radio', { name: 'Internal' })).toHaveAttribute('aria-checked', 'true');
  const upload = await owner.page.request.post('/api/uploads', {
    multipart: {
      taskId: await owner.page.evaluate(() => new URL(location.href).searchParams.get('task') ?? ''),
      file: { name: 'budget.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  expect(upload.ok()).toBe(true);
  const { url: imageUrl } = (await upload.json()) as { url: string };
  await post(owner.page, `Budget is tight on this one\n\n![budget](${imageUrl})`);
  await choice.getByRole('radio', { name: 'Client can see' }).click();
  await post(owner.page, 'Here is the first draft');
  await expect(comments.getByRole('listitem').filter({ hasText: 'first draft' })).toContainText('Client can see');

  // The client sees only the shared comment: count, thread, no image, no activity hint.
  await guest.page.goto(projectUrl);
  await expect(guest.page.getByLabel('1 comment', { exact: true })).toBeVisible();
  await guest.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const guestSheet = guest.page.getByRole('dialog', { name: 'Homepage' });
  const guestComments = guestSheet.getByRole('list', { name: 'Comments' });
  await expect(guestComments.getByText('Here is the first draft')).toBeVisible();
  await expect(guestComments.getByRole('listitem')).toHaveCount(1);
  await expect(guestSheet.getByText(/Budget is tight|Early note/)).toHaveCount(0);
  await expect(guestSheet.getByRole('radiogroup')).toHaveCount(0);
  await expect(guestSheet.getByText('Internal', { exact: true })).toHaveCount(0);
  expect((await guest.page.request.get(imageUrl)).status()).toBe(404);
  await post(guest.page, 'Thanks, looks good');

  // The team sees the client's reply as client-visible, and can't hide it.
  await owner.page.reload();
  const reply = comments.getByRole('listitem').filter({ hasText: 'Thanks, looks good' });
  await expect(reply).toContainText('Client can see', { timeout: 15000 });
  await expect(reply.getByRole('button', { name: 'Make comment internal' })).toHaveCount(0);

  // Sharing the internal comment reveals it (and its image) to the client...
  const budget = comments.getByRole('listitem').filter({ hasText: 'Budget is tight' });
  await budget.getByRole('button', { name: 'Share comment with client' }).click();
  await expect(budget).toContainText('Client can see');
  await expect(budget).not.toContainText('(edited)');
  await expect.poll(async () => (await guest.page.request.get(imageUrl)).status(), { timeout: 15000 }).toBe(200);
  await guest.page.reload();
  await expect(guestComments.getByText('Budget is tight on this one')).toBeVisible({ timeout: 15000 });

  // ...and making it internal again hides it.
  await budget.getByRole('button', { name: 'Make comment internal' }).click();
  await expect(budget).toContainText('Internal');
  await expect.poll(async () => (await guest.page.request.get(imageUrl)).status(), { timeout: 15000 }).toBe(404);
  await guest.page.reload();
  await expect(guestComments.getByText('Here is the first draft')).toBeVisible({ timeout: 15000 });
  await expect(guestSheet.getByText('Budget is tight')).toHaveCount(0);

  await owner.context.close();
  await guest.context.close();
});
