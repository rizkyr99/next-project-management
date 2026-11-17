import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/** P4.6: the main screens work on a phone (390×844, touch). */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('board, filters and touch targets on a phone', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `mob+${s}@example.com`, 'Mo Bile');
  const slug = `mob-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Mob ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // No horizontal page scroll on the workspace home.
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // The verify banner is the short version.
  await expect(page.getByText('Verify your email to get invites and notifications.')).toBeVisible();

  await page.goto(`/workspaces/${slug}`);
  await page.getByRole('button', { name: /toggle sidebar/i }).first().click();
  await page.getByRole('link', { name: 'Getting started' }).last().click();
  await expect(page.getByTestId('column-Done')).toBeAttached();

  // Columns are most of the screen wide, so the next one peeks in.
  const todo = page.locator('[data-testid^="column-"]').first();
  const box = (await todo.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  expect(box.width).toBeLessThan(390);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // The task panel covers the whole screen.
  await page.getByRole('button', { name: 'Open task Open a task to see its details' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await sheet.boundingBox())?.width).toBe(390);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // Filters fold behind a toggle; the selects appear when it opens.
  const assignee = page.getByRole('combobox', { name: 'Assignee' });
  await expect(assignee).toBeHidden();
  const toggle = page.getByRole('button', { name: /^Filters/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await assignee.click();
  await page.getByRole('option', { name: 'Assigned to me' }).click();
  await expect(page).toHaveURL(/assignee=me/);
  await expect(toggle).toHaveText(/Filters \(1\)/);

  // Start call is icon-only but keeps its name.
  const call = page.getByRole('button', { name: 'Start call' });
  await expect(call).toBeVisible();
  expect((await call.boundingBox())!.width).toBeLessThan(60);

  // Small icon buttons get a 44px touch area.
  const hit = await page.evaluate(() => {
    const el = document.querySelector('[data-size="icon-sm"], [data-size="icon"]');
    if (!el) return null;
    const after = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return { content: after.content, w: r.width - 2 * parseFloat(after.left) };
  });
  expect(hit).not.toBeNull();
  expect(hit!.content).not.toBe('none');
  expect(hit!.w).toBeGreaterThanOrEqual(44);
});
