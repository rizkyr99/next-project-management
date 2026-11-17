import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

/** P4.3: a guided first workspace, a data-driven checklist, and real empty states. */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createWorkspace(page: Page, slug: string) {
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Onb WS ${slug}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
}

const checklist = (page: Page) => page.getByRole('region', { name: 'Set up your workspace' });

test('a new workspace is guided: Getting started project and a checklist driven by real data', async ({ page }) => {
  test.setTimeout(60_000);
  const s = stamp();
  await registerAndLogin(page, `onb+${s}@example.com`, 'Olu');
  const slug = `onb-${s}`;
  await createWorkspace(page, slug);

  // The checklist starts at 0 of 3.
  await expect(checklist(page)).toContainText('0 of 3 done');

  // Getting started comes with tasks that each teach one thing.
  const sidebar = page.locator('[data-sidebar="sidebar"]').first();
  await sidebar.getByRole('link', { name: 'Getting started' }).click();
  await expect(page.getByRole('button', { name: 'Open task Open a task to see its details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open task Invite a teammate' })).toBeVisible();
  await expect(page.getByTestId('column-Done').getByText('Create your workspace')).toBeVisible();

  // My tasks is empty, and says how to fill it.
  await page.goto(`/workspaces/${slug}/my-tasks`);
  await expect(page.getByText('Nothing assigned to you')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse projects' })).toBeVisible();

  // Step 1: create a project (from the checklist itself). New projects start empty.
  await page.goto(`/workspaces/${slug}`);
  await checklist(page).getByRole('button', { name: 'Create a project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Launch');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByTestId('column-To Do').getByText('No tasks yet. Add the first one below.')).toBeVisible();

  // Step 2: add a task.
  await addTask(page, 'To Do', 'Write the launch plan');

  await page.goto(`/workspaces/${slug}`);
  await expect(checklist(page)).toContainText('2 of 3 done');

  // Step 3: invite someone; with everything done, the checklist gets out of the way.
  await checklist(page).getByRole('link', { name: 'Invite people' }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}/settings\\?tab=members$`));
  const card = page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(`teammate+${s}@example.com`);
  await card.getByRole('button', { name: 'Send invite' }).click();
  await expect(card.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible({ timeout: 15000 });

  await page.goto(`/workspaces/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
});

test('the checklist can be hidden, and stays hidden', async ({ page }) => {
  const s = stamp();
  await registerAndLogin(page, `onb2+${s}@example.com`, 'Hal');
  const slug = `onb2-${s}`;
  await createWorkspace(page, slug);

  await expect(checklist(page)).toBeVisible();
  await checklist(page).getByRole('button', { name: 'Hide' }).click();
  await expect(checklist(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
});
