import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

/** P2.3: the task sheet, its Markdown description, ?task= deep links, and delete with undo. */

const WELCOME = 'Welcome to your new project!';

test('task sheet: description, deep link and delete with undo', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `sheet+${stamp}@example.com`, 'Sheet Owner');

  const slug = `sheet-${stamp}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Sheet WS ${stamp}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Sheets');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = page.url();
  await addTask(page, 'To Do', WELCOME);

  // Clicking a card opens the sheet and puts the task in the URL.
  const card = page.getByRole('button', { name: `Open task ${WELCOME}` });
  await card.click();
  const sheet = page.getByRole('dialog', { name: WELCOME });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?task=[0-9a-f-]{36}$/);
  const taskUrl = page.url();

  // Description: edited visually (Markdown shortcuts and autolinks work as
  // you type), saved with Cmd/Ctrl+Enter, stored as Markdown, rendered sanitized.
  await sheet.getByRole('button', { name: 'Add a description…' }).click();
  const editor = sheet.getByRole('textbox', { name: 'Description' });
  await expect(editor).toBeFocused({ timeout: 10000 });
  await page.keyboard.type('**Ship** the docs https://example.com ');
  await page.keyboard.type('<img src=x onerror="window.__xss=1">');
  const saved = page.waitForResponse(
    (r) =>
      r.request().headers()['next-action'] !== undefined &&
      (r.request().postData() ?? '').includes('"description"'),
  );
  await page.keyboard.press('ControlOrMeta+Enter');
  const rendered = sheet.getByTestId('task-description');
  await expect(rendered.locator('strong')).toHaveText('Ship');
  await expect(rendered.getByRole('link', { name: 'https://example.com' })).toHaveAttribute('target', '_blank');
  await expect(rendered.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect((await saved).ok()).toBe(true);

  // Escape closes the sheet and drops the param; the card shows the description icon.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Focus goes back to the card that opened it (P4.5).
  await expect(card).toBeFocused();
  await expect(page).toHaveURL(projectUrl);
  await expect(card.getByLabel('Has description')).toBeVisible();

  // A pasted link opens the same task, with the saved description.
  await page.goto(taskUrl);
  await expect(page.getByRole('dialog', { name: WELCOME }).getByTestId('task-description')).toContainText(
    'Ship the docs',
  );

  // A link to a task that doesn't exist says so instead of opening nothing.
  await page.goto(`${projectUrl}?task=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText('That task no longer exists.')).toBeVisible();
  await expect(page).toHaveURL(projectUrl);

  // Delete with undo: the card disappears at once and Undo brings it back.
  await card.click();
  await page.getByRole('dialog', { name: WELCOME }).getByRole('button', { name: 'Delete task' }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toBeVisible();

  // Without Undo, the server delete runs once the 5 s window passes.
  await card.click();
  // Match deleteTask's own request ({ taskId }); opening the sheet also
  // fires server actions (comments, activity). Reloading before this lands
  // would cancel the pending delete, by design.
  const taskId = new URL(taskUrl).searchParams.get('task')!;
  const deleted = page.waitForResponse(
    (r) =>
      r.request().headers()['next-action'] !== undefined &&
      (r.request().postData() ?? '').includes(`"taskId":"${taskId}"`),
    { timeout: 15000 },
  );
  await page.getByRole('dialog', { name: WELCOME }).getByRole('button', { name: 'Delete task' }).click();
  await expect(card).toHaveCount(0);
  expect((await deleted).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('column-To Do')).toBeVisible();
  await expect(card).toHaveCount(0);

  // ...and its old link now reports the task as gone.
  await page.goto(taskUrl);
  await expect(page.getByText('That task no longer exists.')).toBeVisible();
});
