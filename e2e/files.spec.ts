import { test, expect, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

/**
 * B3 task files. The team attaches files (small ones through the upload
 * route, large ones through the start/finish actions), downloads them,
 * shares them with the client or keeps them internal, and removes them. A
 * client sees only what's shared plus their own uploads.
 */

const PNG = readFileSync(path.join(__dirname, 'fixtures/screenshot.png'));
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('attach, download, share and remove task files; clients see only what is shared', async ({ browser }) => {
  test.setTimeout(150_000);
  const s = stamp();
  const slug = `files-${s}`;
  const guestEmail = `files-client+${s}@example.com`;

  const owner = await newUser(browser, `files-owner+${s}@example.com`, 'Studio Owner');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Files ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Acme website');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(owner.page.url()).pathname;
  await addTask(owner.page, 'To Do', 'Homepage');

  // Invite the client first, so files have an Internal / Client choice.
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

  // The team attaches a small PDF, a large zip (over the 4 MB route limit)
  // and an image. A program is refused.
  await owner.page.goto(projectUrl);
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const sheet = owner.page.getByRole('dialog', { name: 'Homepage' });
  const chooser = sheet.getByLabel('Choose files to attach');
  const files = sheet.getByRole('list', { name: 'Files' });

  await chooser.setInputFiles({ name: 'Brand guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 guide') });
  await expect(files.getByRole('link', { name: 'Brand guide.pdf' })).toBeVisible({ timeout: 15000 });
  await chooser.setInputFiles({
    name: 'Assets.zip',
    mimeType: 'application/zip',
    buffer: Buffer.alloc(5 * 1024 * 1024, 1),
  });
  await expect(files.getByRole('link', { name: 'Assets.zip' })).toBeVisible({ timeout: 30000 });
  await expect(files.getByRole('listitem').filter({ hasText: 'Assets.zip' })).toContainText('5 MB');
  await chooser.setInputFiles({ name: 'Moodboard.png', mimeType: 'image/png', buffer: PNG });
  await expect(files.getByRole('link', { name: 'Moodboard.png' })).toBeVisible({ timeout: 15000 });
  await chooser.setInputFiles({ name: 'installer.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(owner.page.getByText('“installer.exe” can’t be attached.', { exact: false })).toBeVisible();
  await expect(files.getByRole('listitem')).toHaveCount(3);
  await expect(files.getByRole('listitem').first()).toContainText('Internal');

  // A document downloads as plain bytes; the image opens inline.
  const pdfHref = await files.getByRole('link', { name: 'Brand guide.pdf' }).getAttribute('href');
  const pdf = await owner.page.request.get(pdfHref!);
  expect(pdf.headers()['content-disposition']).toMatch(/^attachment;/);
  expect(pdf.headers()['content-type']).toBe('application/octet-stream');
  expect(await pdf.text()).toBe('%PDF-1.7 guide');
  const imageHref = (await files.getByRole('link', { name: 'Moodboard.png' }).getAttribute('href'))!;
  const image = await owner.page.request.get(imageHref);
  expect(image.headers()['content-type']).toBe('image/png');
  expect(image.headers()['content-disposition']).toMatch(/^inline;/);

  // Share the PDF with the client.
  await files.getByRole('button', { name: 'Share Brand guide.pdf with client' }).click();
  await expect(files.getByRole('listitem').filter({ hasText: 'Brand guide.pdf' })).toContainText('Client can see', {
    timeout: 15000,
  });

  // The card counts the files.
  await owner.page.keyboard.press('Escape');
  await expect(owner.page.locator('[aria-label="Open task Homepage"]').getByLabel('3 files')).toBeVisible();

  // The client sees only the shared PDF, can't open internal files, and can add their own.
  await guest.page.goto(projectUrl);
  await expect(guest.page.getByLabel('1 file', { exact: true })).toBeVisible();
  await guest.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const guestSheet = guest.page.getByRole('dialog', { name: 'Homepage' });
  const guestFiles = guestSheet.getByRole('list', { name: 'Files' });
  await expect(guestFiles.getByRole('link', { name: 'Brand guide.pdf' })).toBeVisible();
  await expect(guestFiles.getByRole('listitem')).toHaveCount(1);
  await expect(guestSheet.getByText('Internal', { exact: true })).toHaveCount(0);
  await expect(guestFiles.getByRole('button', { name: /Remove|Share|internal/ })).toHaveCount(0);
  expect((await guest.page.request.get(imageHref)).status()).toBe(404);
  expect((await guest.page.request.get(pdfHref!)).status()).toBe(200);
  await guestSheet
    .getByLabel('Choose files to attach')
    .setInputFiles({ name: 'Feedback.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('notes') });
  await expect(guestFiles.getByRole('link', { name: 'Feedback.docx' })).toBeVisible({ timeout: 15000 });
  await expect(guestFiles.getByRole('button', { name: 'Remove Feedback.docx' })).toBeVisible();

  // The team sees the client's file marked as from the client, and removes the zip.
  await owner.page.reload();
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  await expect(files.getByRole('listitem').filter({ hasText: 'Feedback.docx' })).toContainText('From client', {
    timeout: 15000,
  });
  await files.getByRole('button', { name: 'Remove Assets.zip' }).click();
  await owner.page.getByRole('button', { name: 'Remove file' }).click();
  await expect(files.getByRole('link', { name: 'Assets.zip' })).toHaveCount(0, { timeout: 15000 });

  // Storage use shows in Settings.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await expect(owner.page.getByRole('progressbar', { name: 'File storage used' })).toBeVisible();

  await owner.context.close();
  await guest.context.close();
});
