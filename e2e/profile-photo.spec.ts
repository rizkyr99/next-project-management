import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

/** I11: upload a profile photo, see it in the header, and remove it. */
test('upload a profile photo, see it in the header, then remove it (I11)', async ({ page }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `photo+${s}@example.com`;
  await registerAndLogin(page, email, 'Pia Photo');
  const slug = `photo-${s}`;
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Photo ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  await page.goto(`/workspaces/${slug}/account`);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photo' }).click();
  await (await chooser).setFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: readFileSync(path.join(__dirname, 'fixtures', 'screenshot.png')),
  });
  await expect(page.getByText('Photo updated')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

  // Saved as a small square image at an unguessable URL, shown in the header.
  const sql = await testDb();
  const [{ image, id: userId }] = await sql`select id, image from "user" where email = ${email}`;
  expect(image).toMatch(new RegExp(`^/api/avatars/${userId}/[0-9a-f-]{36}\\.(webp|jpg)$`));
  await expect(page.locator(`header img[src="${image}"]`).first()).toBeVisible({ timeout: 10000 });
  const served = await page.request.get(image);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);
  expect((await served.body()).length).toBeLessThan(512 * 1024);
  expect((await page.request.get(`/api/avatars/${userId}/not-a-photo.png`)).status()).toBe(404);

  // Better Auth's own profile update can't set a photo (only the upload can).
  const sneaky = await page.request.post('/api/auth/update-user', {
    headers: { Origin: new URL(page.url()).origin },
    data: { image: '/api/avatars/someone-else/0f8fad5b-d9cb-469f-a165-70867728950e.png' },
  });
  expect(sneaky.ok()).toBe(false);
  expect(await sneaky.text()).toContain('Change your photo from your account page.');
  expect((await sql`select image from "user" where id = ${userId}`)[0].image).toBe(image);

  // Removing goes back to initials.
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Photo removed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await expect(page.locator('header img[src^="/api/avatars/"]')).toHaveCount(0);
  const [{ image: after }] = await sql`select image from "user" where email = ${email}`;
  expect(after).toBeNull();
});
