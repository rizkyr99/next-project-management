import { expect, type Page } from '@playwright/test';

/**
 * Adds a task through the real "Add task" form at the bottom of a column.
 * New projects start empty (P4.3), so specs create the tasks they need.
 */
export async function addTask(page: Page, column: string, title: string) {
  const col = page.getByTestId(`column-${column}`);
  await col.getByRole('button', { name: 'Add task' }).click();
  await col.getByPlaceholder('Task Name').fill(title);
  await col.getByPlaceholder('Task Name').press('Enter');
  await expect(page.getByRole('button', { name: `Open task ${title}` })).toBeVisible({ timeout: 15000 });
}
