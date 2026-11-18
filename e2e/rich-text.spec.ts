import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

const PNG_BASE64 = readFileSync(path.join(__dirname, 'fixtures/screenshot.png')).toString('base64');

/** Paste an image the way the browser does on Cmd/Ctrl+V. */
async function pasteImage(target: Locator) {
  await target.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, PNG_BASE64);
}

async function setUp(page: Page) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `rich+${s}@example.com`, 'Rita Rich');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Rich ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`rich-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/rich-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Rich');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await addTask(page, 'To Do', 'Homepage');
  await page.getByRole('button', { name: 'Open task Homepage' }).click();
  return page.getByRole('dialog', { name: 'Homepage' });
}

test('descriptions and comments: formatting, pasted screenshots, and files only members can open', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const sheet = await setUp(page);

  // Description: a checklist and a pasted screenshot.
  await sheet.getByRole('button', { name: 'Add a description…' }).click();
  const editor = sheet.getByRole('textbox', { name: 'Description' });
  await expect(editor).toBeFocused({ timeout: 10000 });
  await page.keyboard.type('Brief');
  await page.keyboard.press('Enter');
  await sheet.getByRole('button', { name: 'Checklist' }).click();
  await page.keyboard.type('Send moodboard');
  await expect(sheet.getByRole('button', { name: 'Checklist' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await pasteImage(editor);
  await expect(editor.locator('img[src^="/api/files/"]')).toBeVisible({ timeout: 15000 });
  await sheet.getByRole('button', { name: 'Save' }).click();

  const description = sheet.getByTestId('task-description');
  await expect(description.getByRole('checkbox')).toHaveCount(1);
  await expect(description).toContainText('Send moodboard');
  const image = description.locator('img');
  await expect(image).toBeVisible();
  // The browser really loaded it through the access-checked route.
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  const src = (await image.getAttribute('src'))!;
  expect(src).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);

  // Comment: Markdown formatting, and a pasted screenshot.
  const box = sheet.getByPlaceholder(/add a comment/i);
  await box.fill('Looks **great**');
  await pasteImage(box);
  await expect(box).toHaveValue(/!\[screenshot\.png\]\(\/api\/files\/[0-9a-f-]{36}\)/, { timeout: 15000 });
  await box.press('Enter');
  await expect(sheet.locator('strong', { hasText: 'great' })).toBeVisible();
  await expect(sheet.locator('img[src^="/api/files/"]')).toHaveCount(2);

  // The file is as private as the task: a member gets it, anyone else a 404.
  const mine = await page.request.get(src);
  expect(mine.status()).toBe(200);
  expect(mine.headers()['content-type']).toBe('image/png');

  const other = await browser.newContext();
  const outsider = await other.newPage();
  await registerAndLogin(outsider, `rich-out+${Date.now()}@example.com`, 'Otto Outsider');
  expect((await outsider.request.get(src)).status()).toBe(404);
  await other.close();

  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`${new URL(page.url()).origin}${src}`)).status()).toBe(401);
  await anonymous.close();
});
