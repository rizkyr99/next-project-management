import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** "Add project" → name → optional template and start date → Create. */
async function createProject(page: Page, name: string, template?: { name: string; start: string }) {
  const from = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create new project' });
  await dialog.getByLabel('Name').fill(name);
  if (template) {
    await dialog.getByRole('combobox', { name: 'Start from' }).click();
    await page.getByRole('option', { name: template.name }).click();
    await dialog.getByLabel('Start date').fill(template.start);
  }
  await dialog.getByRole('button', { name: 'Create project' }).click();
  // A new project page, not the one we may already be on.
  await page.waitForURL((u) => u.pathname !== from && /\/projects\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

test('start a project from a built-in template, save one as a template, reuse and delete it (B5)', async ({ page }) => {
  test.setTimeout(120_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `tpl+${s}@example.com`, 'Tia Template');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Tpl ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`tpl-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/tpl-${s}$`), { timeout: 15000 });

  // Built-in: columns, tasks, checklists, labels and dates counted from the start day.
  await createProject(page, 'Acme website', { name: 'Website build', start: '2027-01-04' });
  await expect(page.getByRole('button', { name: 'Column Client review options' })).toBeVisible();
  const kickoff = page.getByRole('button', { name: 'Open task Kickoff call' });
  await expect(kickoff).toContainText('Jan 4, 2027');
  await expect(kickoff.getByLabel('Checklist: 0 of 4 done')).toBeVisible();
  const sitemap = page.getByRole('button', { name: 'Open task Sitemap and content plan' });
  await expect(sitemap).toContainText('Jan 9, 2027');
  await expect(sitemap).toContainText('Copy');

  // Save it as the studio's own template.
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  const save = page.getByRole('dialog', { name: 'Save as template' });
  await save.getByLabel('Template name').fill('Studio site');
  await save.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText('Saved “Studio site” as a template')).toBeVisible();
  await expect(save).toBeHidden();

  // Start another project from it, a month later.
  await createProject(page, 'Beta website', { name: 'Studio site', start: '2027-02-01' });
  await expect(page.getByRole('button', { name: 'Open task Kickoff call' })).toContainText('Feb 1, 2027');
  await expect(page.getByRole('button', { name: 'Open task Launch' })).toContainText('Mar 18, 2027');
  await expect(page.getByRole('button', { name: 'Column Client review options' })).toBeVisible();

  // A blank project still gets the three default columns and nothing else.
  await createProject(page, 'Blank one');
  await expect(page.getByRole('button', { name: 'Column In Progress options' })).toBeVisible();
  await expect(page.locator('[data-testid^="task-"]')).toHaveCount(0);

  // Settings → Templates lists it; delete it.
  await page.goto(`/workspaces/tpl-${s}/settings?tab=templates`);
  const list = page.getByRole('list', { name: 'Saved templates' });
  await expect(list).toContainText('Studio site');
  await expect(list).toContainText('Saved');
  await list.getByRole('button', { name: 'Delete Studio site' }).click();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.getByText('Deleted “Studio site”')).toBeVisible();
  await expect(page.getByText('No saved templates yet.')).toBeVisible({ timeout: 15000 });
});
