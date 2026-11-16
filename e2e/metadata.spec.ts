import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** P1.6: real titles and share metadata, without leaking names across tenants. */

test('public pages and the share image have real metadata', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Log in · Tide');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Tide');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Project management/);

  // Link-preview crawlers are never logged in: the image must not bounce to /login.
  const image = await request.get('/opengraph-image', { maxRedirects: 0 });
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('workspace and project pages are titled, and foreign slugs leak nothing', async ({ browser }) => {
  const owner = await browser.newContext();
  const page = await owner.newPage();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `meta+${stamp}@example.com`, 'Meta Owner');

  const slug = `meta-${stamp}`;
  const wsName = `Acme ${stamp}`;
  await page.goto('/create-workspace');
  await expect(page).toHaveTitle('Create workspace · Tide');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(wsName);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}`), { timeout: 15000 });
  await expect(page).toHaveTitle(`${wsName} · Tide`);

  await page.goto(`/workspaces/${slug}/settings`);
  await expect(page).toHaveTitle(`Settings · ${wsName} · Tide`);

  await page.goto(`/workspaces/${slug}`);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Website Redesign');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15000 });
  await expect(page).toHaveTitle(`Website Redesign · ${wsName} · Tide`);
  const projectUrl = new URL(page.url()).pathname;

  // An outsider gets no names from <title>.
  const outsider = await browser.newContext();
  const other = await outsider.newPage();
  await registerAndLogin(other, `meta-out+${stamp}@example.com`, 'Outsider');
  await other.goto(projectUrl);
  const title = await other.title();
  expect(title).not.toContain(wsName);
  expect(title).not.toContain('Website Redesign');

  await owner.close();
  await outsider.close();
});
