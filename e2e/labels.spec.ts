import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('create a label from a task, see it on the card, filter by it, and take it off', async ({ page }) => {
  test.setTimeout(90_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `lbl+${s}@example.com`, 'Lu Label');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Lbl ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`lbl-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/lbl-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Rebrand');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Rebrand' })).toBeVisible();
  await addTask(page, 'To Do', 'Logo concepts');
  await addTask(page, 'To Do', 'Invoice client');

  // Create "Design" from the task sheet; it's applied to the task at once.
  await page.getByRole('button', { name: 'Open task Logo concepts' }).click();
  const sheet = page.getByRole('dialog', { name: 'Logo concepts' });
  await sheet.getByRole('button', { name: 'Add labels' }).click();
  await page.getByRole('textbox', { name: 'Find or create a label' }).fill('Design');
  await page.getByRole('button', { name: /Create .Design./ }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Design' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('button', { name: /^Labels: Design\./ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // On the card.
  const card = page.getByRole('button', { name: 'Open task Logo concepts' });
  await expect(card).toContainText('Design', { timeout: 15000 });

  // Filter the board by the label.
  await page.getByRole('combobox', { name: 'Label' }).click();
  await page.getByRole('option', { name: 'Design' }).click();
  await expect(page).toHaveURL(/[?&]label=/);
  await expect(page.getByRole('button', { name: 'Open task Invoice client' })).toHaveCount(0);
  await expect(card).toBeVisible();

  // Survives a reload (saved), then take it off.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open task Logo concepts' })).toContainText('Design', { timeout: 15000 });
  await page.getByRole('button', { name: 'Open task Logo concepts' }).click();
  await page.getByRole('dialog', { name: 'Logo concepts' }).getByRole('button', { name: /^Labels: Design\./ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Design' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Logo concepts' }).getByRole('button', { name: 'Add labels' })).toBeVisible();

  // Put it back, then rename it in workspace settings: the card follows.
  await page.getByRole('dialog', { name: 'Logo concepts' }).getByRole('button', { name: 'Add labels' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Design' }).click();
  await page.waitForTimeout(800);
  const projectUrl = page.url().split('?')[0];
  await page.goto(`/workspaces/lbl-${s}/settings`);
  await page.getByRole('tab', { name: 'Labels' }).click();
  const nameBox = page.getByRole('textbox', { name: 'Name of Design' });
  await expect(page.getByRole('list', { name: 'Labels' })).toContainText('1 task');
  await nameBox.fill('Brand design');
  await nameBox.press('Enter');
  await page.waitForTimeout(800);
  await page.goto(projectUrl);
  await expect(page.getByRole('button', { name: 'Open task Logo concepts' })).toContainText('Brand design', { timeout: 15000 });

  // Owners can delete it; it comes off the task.
  await page.goto(`/workspaces/lbl-${s}/settings`);
  await page.getByRole('tab', { name: 'Labels' }).click();
  await page.getByRole('button', { name: 'Delete Brand design' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('on 1 task');
  await page.getByRole('button', { name: 'Delete label' }).click();
  await expect(page.getByText('No labels yet')).toBeVisible({ timeout: 15000 });
  await page.goto(projectUrl);
  await expect(page.getByRole('button', { name: 'Open task Logo concepts' })).not.toContainText('Brand design', { timeout: 15000 });
});
