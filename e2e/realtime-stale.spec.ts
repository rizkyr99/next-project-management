import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/**
 * P5.1 follow-up: a live refresh that started before your own change, and
 * arrives after it, must not put the older board back on screen.
 *
 * Deterministic: the refresh triggered by another user's change is held
 * back by the browser until after we've added a column.
 */
test('a late, stale refresh does not undo a newer change', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `stale+${s}@example.com`, 'Stan Stale');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Stale ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`stale-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/stale-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Stale');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectPath = new URL(page.url()).pathname;
  const projectId = projectPath.split('/').pop()!;

  // Hold back the next live refresh of this page for 4 s after the server
  // has rendered it, so it arrives after the column added below.
  let held: () => void = () => {};
  const refreshRequested = new Promise<void>((resolve) => (held = resolve));
  let holdOnce = true;
  await page.route(
    (url) => url.pathname === projectPath,
    async (route) => {
      const req = route.request();
      if (!holdOnce || req.method() !== 'GET' || req.headers()['rsc'] !== '1' || req.headers()['next-router-prefetch']) {
        return route.continue();
      }
      holdOnce = false;
      const response = await route.fetch(); // rendered now: before the column exists
      held();
      await new Promise((r) => setTimeout(r, 4000));
      await route.fulfill({ response });
    },
  );

  // Another user's change: the stream notices it and asks for a refresh.
  const sql = await testDb();
  await sql`update project set description = 'changed elsewhere' where id = ${projectId}`;
  await refreshRequested;

  // Meanwhile, add a column ourselves.
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('New column name').fill('Review');
  await page.getByLabel('New column name').press('Enter');
  const review = page.getByTestId('column-Review');
  await expect(review).toBeVisible({ timeout: 10000 });

  // The held, older refresh now lands. The column must stay put throughout.
  for (let i = 0; i < 12; i++) {
    await expect(review).toBeVisible({ timeout: 100 });
    await page.waitForTimeout(500);
  }
  // And the other user's change still shows up.
  await expect(page.getByText('changed elsewhere')).toBeVisible({ timeout: 15000 });
});

test('your own change is not refreshed a second time by the live stream', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `own+${s}@example.com`, 'Owen Own');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Own ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`own-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/own-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Own');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectPath = new URL(page.url()).pathname;
  // Let the page's first stream poll pass.
  await page.waitForTimeout(6000);

  const refreshes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.headers()['rsc'] === '1' && !r.headers()['next-router-prefetch'] && new URL(r.url()).pathname === projectPath) {
      refreshes.push(r.url());
    }
  });
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('New column name').fill('Review');
  await page.getByLabel('New column name').press('Enter');
  await expect(page.getByTestId('column-Review')).toBeVisible();
  // Longer than a stream poll (5 s): it sees the change but the page has it.
  await page.waitForTimeout(7000);
  expect(refreshes).toEqual([]);
});
