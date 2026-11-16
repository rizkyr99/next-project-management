import { test, expect, type Browser, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/**
 * P0.3 / P0.4: a signed-in user must not be able to see or touch another
 * workspace's data by guessing or pasting its URL or IDs.
 */

async function createWorkspace(page: Page, slug: string, name: string) {
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(name);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15000 });
  return page.url().split('/projects/')[1].split(/[?#]/)[0];
}

async function newUser(browser: Browser, label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `${label}+${stamp}@example.com`, `${label} user`);
  return { context, page, stamp };
}

test.describe('Tenant isolation', () => {
  test('another user cannot view a workspace or project they are not a member of', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'owner');
    const ownerSlug = `iso-a-${owner.stamp}`;
    await createWorkspace(owner.page, ownerSlug, 'Owner Workspace');
    const secretName = `Secret project ${owner.stamp}`;
    const projectId = await createProject(owner.page, secretName);

    const outsider = await newUser(browser, 'outsider');
    await createWorkspace(outsider.page, `iso-b-${outsider.stamp}`, 'Outsider Workspace');

    // Workspace URL: 404, and the sidebar must not leak project names.
    const wsResponse = await outsider.page.goto(`/workspaces/${ownerSlug}`);
    expect(wsResponse?.status()).toBe(404);
    await expect(outsider.page.getByText(secretName)).toHaveCount(0);

    // Project URL under the owner's slug: 404.
    const projectResponse = await outsider.page.goto(
      `/workspaces/${ownerSlug}/projects/${projectId}`,
    );
    expect(projectResponse?.status()).toBe(404);
    await expect(outsider.page.getByText(secretName)).toHaveCount(0);

    // Project ID pasted under the outsider's own slug: still 404.
    const crossResponse = await outsider.page.goto(
      `/workspaces/iso-b-${outsider.stamp}/projects/${projectId}`,
    );
    expect(crossResponse?.status()).toBe(404);
    await expect(outsider.page.getByText(secretName)).toHaveCount(0);

    // API routes keyed by projectId.
    const api = outsider.context.request;
    const opts = { timeout: 10000 };
    expect(
      (await api.get(`/api/tasks/stream?projectId=${projectId}`, opts)).status(),
    ).toBe(404);
    expect(
      (await api.get(`/api/call/stream?projectId=${projectId}`, opts)).status(),
    ).toBe(404);
    expect(
      (await api.post('/api/call/join', { data: { projectId }, ...opts })).status(),
    ).toBe(404);
    expect(
      (
        await api.post('/api/call/signal', {
          data: { projectId, toUserId: 'anyone', type: 'offer', payload: 'x' },
          ...opts,
        })
      ).status(),
    ).toBe(404);

    // Sanity check: the owner still has access.
    const ownerResponse = await owner.page.goto(
      `/workspaces/${ownerSlug}/projects/${projectId}`,
    );
    expect(ownerResponse?.status()).toBe(200);
    await expect(owner.page.getByText(secretName).first()).toBeVisible();

    await owner.context.close();
    await outsider.context.close();
  });
});
