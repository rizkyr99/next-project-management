import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';

// Chromium's built-in fake camera and microphone, with permission granted.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});

/**
 * Headless Chromium has no screen picker, so the "screen" is a 1280×720
 * canvas: a different size from the fake camera, so the other side can tell
 * which one it's receiving.
 */
const FAKE_SCREEN = () => {
  const w = window as unknown as { __screenDelay?: number; __lastScreen?: MediaStream };
  navigator.mediaDevices.getDisplayMedia = async () => {
    // Like a person taking a while in the browser's picker.
    if (w.__screenDelay) await new Promise((r) => setTimeout(r, w.__screenDelay));
    const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    const ctx = canvas.getContext('2d')!;
    let hue = 0;
    setInterval(() => {
      hue = (hue + 7) % 360;
      ctx.fillStyle = `hsl(${hue} 70% 50%)`;
      ctx.fillRect(0, 0, 1280, 720);
    }, 50);
    w.__lastScreen = canvas.captureStream(15);
    return w.__lastScreen;
  };
};

/** The width of the video in a tile labelled with this name, 0 if none is playing. */
const videoWidth = (page: Page, label: string) =>
  page.evaluate((l) => {
    const video = [...document.querySelectorAll('video')].find((v) => v.getAttribute('aria-label') === l);
    return video?.videoWidth ?? 0;
  }, label);

test('share a screen in a call: the other side sees it instead of the camera, then the camera again (I12)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const aContext = await browser.newContext();
  await aContext.addInitScript(FAKE_SCREEN);
  const a = await aContext.newPage();
  const b = await (await browser.newContext()).newPage();

  await registerAndLogin(a, `sharea+${s}@example.com`, 'Ada Sharer');
  await a.goto('/create-workspace');
  await a.getByPlaceholder('e.g. Tide Corp Design').fill(`Share ${s}`);
  await a.getByPlaceholder('e.g. tide-corp-design').fill(`share-${s}`);
  await a.getByRole('button', { name: /create workspace/i }).click();
  await expect(a).toHaveURL(new RegExp(`/workspaces/share-${s}$`), { timeout: 15000 });
  await a.getByRole('button', { name: 'Add project' }).click();
  await a.getByLabel('Name').fill('Review');
  await a.getByRole('button', { name: 'Create project' }).click();
  await expect(a).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = a.url();

  await registerAndLogin(b, `shareb+${s}@example.com`, 'Bob Viewer');
  const sql = await testDb();
  await sql`
    insert into member (id, workspace_id, user_id, role)
    select ${crypto.randomUUID()}, w.id, u.id, 'member'
    from workspace w, "user" u
    where w.slug = ${`share-${s}`} and u.email = ${`shareb+${s}@example.com`}`;
  await b.goto(projectUrl);

  await a.getByRole('button', { name: /start call/i }).click();
  await expect(a.getByText('Call · 1 of 4')).toBeVisible({ timeout: 15000 });
  await b.getByRole('button', { name: /join call \(1\)/i }).click();
  await expect.poll(() => videoWidth(b, 'Ada Sharer'), { timeout: 30000 }).toBeGreaterThan(0);
  // WebRTC adapts the camera's resolution as the connection settles, but it's never the 1280-wide screen.
  expect(await videoWidth(b, 'Ada Sharer')).toBeLessThan(1280);

  // Ada shares: Bob's tile for her becomes her screen, shown whole, with full screen.
  await a.getByRole('button', { name: 'Share your screen' }).click();
  await expect(a.getByRole('button', { name: 'Stop sharing your screen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(a.getByTestId('screen-tile')).toContainText('Ada Sharer (you): screen');
  await expect(b.getByTestId('screen-tile')).toContainText('Ada Sharer: screen', { timeout: 15000 });
  await expect(b.getByRole('button', { name: 'View Ada Sharer’s screen full screen' })).toBeVisible();
  await expect.poll(() => videoWidth(b, 'Ada Sharer: screen'), { timeout: 30000 }).toBe(1280);

  // Ada stops: Bob sees her camera again.
  await a.getByRole('button', { name: 'Stop sharing your screen' }).click();
  await expect(b.getByTestId('screen-tile')).toHaveCount(0, { timeout: 15000 });
  await expect
    .poll(async () => {
      const width = await videoWidth(b, 'Ada Sharer');
      return width > 0 && width < 1280;
    }, { timeout: 30000 })
    .toBe(true);

  await a.getByRole('button', { name: 'Leave call' }).click();
  await b.getByRole('button', { name: 'Leave call' }).click();
});

test('a screen picked after leaving the call isn’t left running (I12)', async ({ browser }) => {
  test.setTimeout(60_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const context = await browser.newContext();
  await context.addInitScript(FAKE_SCREEN);
  const a = await context.newPage();
  await registerAndLogin(a, `sharelate+${s}@example.com`, 'Lee Late');
  await a.goto('/create-workspace');
  await a.getByPlaceholder('e.g. Tide Corp Design').fill(`Late ${s}`);
  await a.getByPlaceholder('e.g. tide-corp-design').fill(`late-${s}`);
  await a.getByRole('button', { name: /create workspace/i }).click();
  await expect(a).toHaveURL(new RegExp(`/workspaces/late-${s}$`), { timeout: 15000 });
  await a.getByRole('button', { name: 'Add project' }).click();
  await a.getByLabel('Name').fill('Solo');
  await a.getByRole('button', { name: 'Create project' }).click();
  await expect(a).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });

  await a.getByRole('button', { name: /start call/i }).click();
  await expect(a.getByText('Call · 1 of 4')).toBeVisible({ timeout: 15000 });
  await a.evaluate(() => ((window as unknown as { __screenDelay: number }).__screenDelay = 1500));
  await a.getByRole('button', { name: 'Share your screen' }).click();
  await a.getByRole('button', { name: 'Leave call' }).click();

  // Once the picker answers, the capture is stopped at once, not shared into nothing.
  await expect
    .poll(
      () =>
        a.evaluate(() => {
          const stream = (window as unknown as { __lastScreen?: MediaStream }).__lastScreen;
          return stream ? stream.getTracks().every((t) => t.readyState === 'ended') : null;
        }),
      { timeout: 10000 },
    )
    .toBe(true);
});
