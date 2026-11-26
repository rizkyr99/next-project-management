import { test, expect } from '@playwright/test';
import { PLAN_DETAILS } from '../lib/plans';
import { registerAndLogin } from './helpers/auth';

/** P4.1: the public site. */

test('the landing page is public and prices come from the shared plans', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Tide: project management for studios and agencies');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Client work, without the email chains.');
  await expect(page.getByRole('img', { name: /A Tide board for a spring launch/ })).toBeVisible();
  // E4: the client moments, from the real product.
  await expect(page.getByRole('img', { name: /What a client sees/ })).toBeAttached();
  await expect(page.getByRole('img', { name: /asked for approval on the Visual design task/ })).toBeAttached();
  await expect(page.getByRole('img', { name: /The studio overview/ })).toBeAttached();

  // Same numbers as in-app billing (lib/plans.ts).
  const pricing = page.getByRole('region', { name: 'Pricing' });
  for (const plan of Object.values(PLAN_DETAILS)) {
    await expect(pricing.getByRole('region', { name: plan.name })).toContainText(`$${plan.priceMonthly}`);
  }

  // FAQ answers open without JavaScript (native <details>).
  await page.getByText('What does my client see?').click();
  await expect(page.getByText(/Only the projects you share with them\. On those/)).toBeVisible();

  await page.getByRole('banner').getByRole('link', { name: 'Start free trial' }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test('pricing, privacy and terms are public; robots, sitemap and icons resolve', async ({ page, request }) => {
  for (const [path, heading] of [
    ['/pricing', 'Pricing'],
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of service'],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /workspaces');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/pricing</loc>');
  expect(sitemap).not.toContain('/workspaces');
  for (const icon of ['/icon.svg', '/apple-icon.png']) {
    expect((await request.get(icon, { maxRedirects: 0 })).status()).toBe(200);
  }
});

test('signed-in people skip the landing page', async ({ page }) => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `mkt+${s}@example.com`, 'Marketing Visitor');
  await page.goto('/');
  // No workspace yet, so the app sends them to create one.
  await expect(page).toHaveURL(/\/create-workspace$/);
});
