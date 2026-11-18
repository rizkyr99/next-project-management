import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

test('a slow navigation shows progress at once, and the sidebar marks the current page', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `nav+${s}@example.com`, 'Nora Nav');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Nav ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`nav-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/nav-${s}$`), { timeout: 15000 });

  // Let the app hydrate: a click before that is a full page load, not an
  // in-app navigation.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);

  const home = page.getByRole('link', { name: 'Home' });
  await expect(home).toHaveAttribute('aria-current', 'page');

  // Billing has no loading skeleton, so nothing else shows the click was
  // taken. Hold it back for 2 s, as on a slow connection. (Pages with a
  // skeleton show it at once; that's their feedback.)
  await page.route(
    (url) => url.pathname === '/settings/billing',
    async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    },
  );

  const bar = page.getByRole('progressbar', { name: 'Loading page' });
  await expect(bar).toHaveCount(0);
  const billing = page.getByRole('link', { name: 'Billing', exact: true });
  await billing.click();
  await expect(bar).toBeVisible({ timeout: 500 });
  // Still loading a second later: the bar stays, and the page hasn't changed yet.
  await page.waitForTimeout(1000);
  await expect(bar).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/workspaces/nav-${s}$`));

  await expect(page).toHaveURL(/\/settings\/billing$/, { timeout: 15000 });
  await expect(bar).toHaveCount(0, { timeout: 3000 });

  // Pages with a skeleton: the URL and the current-page mark move at once.
  await page.goBack();
  await expect(home).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'My tasks' }).click();
  await expect(page.getByRole('link', { name: 'My tasks' })).toHaveAttribute('aria-current', 'page', { timeout: 1000 });
  await expect(home).not.toHaveAttribute('aria-current', 'page');
});
