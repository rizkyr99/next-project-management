import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

test('keyboard shortcuts and ⌘K actions', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `keys+${s}@example.com`, 'Kai Keys');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Keys ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`keys-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/keys-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Keys');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const todo = page.getByTestId('column-To Do');
  await expect(todo).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // hydrated

  // C: add a task to the default column.
  await page.keyboard.press('c');
  await expect(todo.getByPlaceholder('Task Name')).toBeFocused();
  await page.keyboard.type('Wireframes');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Open task Wireframes' })).toBeVisible({ timeout: 15000 });

  // C from the list view: switches to the board and opens the form.
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.keyboard.press('c');
  await expect(page).not.toHaveURL(/view=/);
  await expect(todo.getByPlaceholder('Task Name')).toBeFocused({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);

  // /: focus the filter. Typing there doesn't trigger shortcuts.
  await page.keyboard.press('/');
  const filter = page.getByRole('searchbox', { name: 'Filter by text' });
  await expect(filter).toBeFocused();
  await page.keyboard.type('c');
  await expect(filter).toHaveValue('c');
  await expect(todo.getByPlaceholder('Task Name')).toHaveCount(0);
  await filter.fill('');
  await filter.blur();

  // ?: the shortcut list.
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Add a task')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  // G then M: go to My tasks.
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await expect(page).toHaveURL(new RegExp(`/workspaces/keys-${s}/my-tasks$`), { timeout: 15000 });
  await page.waitForTimeout(1000);

  // ⌘K lists actions before typing, and filters them while typing.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect(page.getByRole('option', { name: /New project/ })).toBeVisible();
  await page.keyboard.type('activity');
  await expect(page.getByRole('option', { name: /New project/ })).toHaveCount(0);
  await page.getByRole('option', { name: /Go to Activity/ }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/keys-${s}/activity$`), { timeout: 15000 });

  // ⌘K → New project opens the dialog (once).
  await page.waitForTimeout(1000);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.getByRole('option', { name: /New project/ }).click();
  await expect(page.getByRole('dialog', { name: 'Create new project' })).toHaveCount(1);
});
