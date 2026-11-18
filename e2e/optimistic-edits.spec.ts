import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** Server actions are POSTs to the page with a Next-Action header. */
async function holdSaves(page: Page, ms: number) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action']) {
      await new Promise((r) => setTimeout(r, ms));
    }
    await route.fallback();
  });
}

async function newProject(page: Page) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `opt+${s}@example.com`, 'Olive Optimist');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Opt ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`opt-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/opt-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Optimistic');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByTestId('column-To Do')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
}

test('tasks, comments and column names show at once, before the server answers', async ({ page }) => {
  test.setTimeout(90_000);
  await newProject(page);
  await holdSaves(page, 2000);
  const col = page.getByTestId('column-To Do');

  // A new task appears at once, marked as saving, then becomes a normal card.
  await col.getByRole('button', { name: 'Add task' }).click();
  await col.getByPlaceholder('Task Name').fill('Moodboard');
  await col.getByPlaceholder('Task Name').press('Enter');
  await expect(col.getByTestId('task-saving')).toContainText('Moodboard', { timeout: 500 });
  await expect(page.getByRole('button', { name: 'Open task Moodboard' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('task-saving')).toHaveCount(0);

  // A comment shows at once.
  await page.getByRole('button', { name: 'Open task Moodboard' }).click();
  const sheet = page.getByRole('dialog', { name: 'Moodboard' });
  const box = sheet.getByPlaceholder(/comment/i);
  await box.fill('Pinned three references');
  await box.press('Enter');
  await expect(sheet.getByText('Pinned three references')).toBeVisible({ timeout: 500 });
  await expect(box).toHaveValue('');
  await page.keyboard.press('Escape');

  // A column rename shows at once.
  await page.getByTestId('column-To Do').getByTitle('Double-click to rename').dblclick();
  const rename = page.getByRole('textbox', { name: 'Column name' });
  await rename.fill('Backlog');
  await rename.press('Enter');
  // The header shows the new name at once; the column's test ID follows the
  // saved name once the server answers.
  await expect(page.getByTitle('Double-click to rename').first()).toHaveText('Backlog', { timeout: 500 });
  await expect(page.getByTestId('column-Backlog')).toBeVisible({ timeout: 10000 });
});

test('a task that fails to save disappears, and what was typed comes back', async ({ page }) => {
  test.setTimeout(60_000);
  await newProject(page);
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action']) return route.abort('failed');
    return route.fallback();
  });
  const col = page.getByTestId('column-To Do');
  await col.getByRole('button', { name: 'Add task' }).click();
  await col.getByPlaceholder('Task Name').fill('Lost in transit');
  await col.getByPlaceholder('Task Name').press('Enter');

  await expect(page.getByText(/could not add the task/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('task-saving')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open task Lost in transit' })).toHaveCount(0);
  await expect(col.getByPlaceholder('Task Name')).toHaveValue('Lost in transit');
});
