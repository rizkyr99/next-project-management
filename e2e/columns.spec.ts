import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** P2.2: add, rename, delete (moving tasks) and reorder board columns. */

async function columnOrder(page: Page) {
  return page
    .locator('[data-testid^="column-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace(/^column-/, '')));
}

test('manage board columns without losing tasks', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `cols+${stamp}@example.com`, 'Column Owner');

  const slug = `cols-${stamp}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Cols WS ${stamp}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });

  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Board');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15000 });

  // New projects start with To Do (default, holding the welcome task), In Progress, Done.
  await expect.poll(() => columnOrder(page)).toEqual(['To Do', 'In Progress', 'Done']);
  const welcome = 'Welcome to your new project!';
  await expect(page.getByTestId('column-To Do').getByText(welcome)).toBeVisible();

  // Add a column.
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('New column name').fill('Review');
  await page.getByLabel('New column name').press('Enter');
  await expect.poll(() => columnOrder(page)).toEqual(['To Do', 'In Progress', 'Done', 'Review']);

  // Rename it inline (double-click), and the change survives a reload.
  await page.getByTestId('column-Review').getByRole('button', { name: 'Review', exact: true }).dblclick();
  await page.getByLabel('Column name').fill('QA');
  await page.getByLabel('Column name').press('Enter');
  await expect(page.getByTestId('column-QA')).toBeVisible();

  // Delete the default column that holds a task: a destination is required.
  await page.getByRole('button', { name: 'Column To Do options' }).click();
  await page.getByRole('menuitem', { name: 'Delete column' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete column' });
  await expect(dialog).toContainText('1 task');
  await expect(dialog).toContainText('becomes the new default');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Done' }).click();
  await dialog.getByRole('button', { name: 'Delete column' }).click();

  await expect.poll(() => columnOrder(page)).toEqual(['In Progress', 'Done', 'QA']);
  await expect(page.getByTestId('column-Done').getByText(welcome)).toBeVisible(); // not lost
  await expect(page.getByTestId('column-Done').getByLabel('Default column')).toBeVisible();

  // Move "QA" to the front with the keyboard (dnd-kit's accessible sorting):
  // focus its grip, pick it up with Space, move left twice, drop with Space.
  // This is deterministic, unlike a raw mouse drag over animating columns.
  const grip = page.getByRole('button', { name: 'Reorder column QA' });
  // Each step is confirmed through dnd-kit's live-region announcement, so
  // the next key press never races the previous step's animation.
  const announcer = page.locator('[id^="DndLiveRegion"]');
  const step = async (key: string) => {
    const before = await announcer.textContent();
    await page.keyboard.press(key);
    await expect(announcer).not.toHaveText(before ?? '');
  };
  await grip.focus();
  await step('Space');
  await step('ArrowLeft');
  await step('ArrowLeft');
  // The board reorders optimistically; wait for the server action to finish
  // saving before reloading, or the reload can cancel it.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined,
  );
  await page.keyboard.press('Space');
  await expect.poll(() => columnOrder(page)).toEqual(['QA', 'In Progress', 'Done']);
  expect((await saved).ok()).toBe(true);

  // Persisted server-side: survives a reload (and is what every other member loads).
  await page.reload();
  await expect.poll(() => columnOrder(page)).toEqual(['QA', 'In Progress', 'Done']);
  await expect(page.getByTestId('column-Done').getByText(welcome)).toBeVisible();
});
