import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { registerAndLogin } from './helpers/auth';

/**
 * The strict policy (lib/csp.ts) is Report-Only for now: a violation doesn't
 * break anything, it's only reported. These tests make sure normal use
 * produces none, so it can be enforced. Production build only: `next dev`
 * doesn't send it.
 */
test.skip(process.env.E2E_SERVER !== 'start', 'The strict CSP is only sent by a production build.');

/** Collect CSP violations the page reports, enforced or report-only. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.disposition} ${e.effectiveDirective}: ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber}) ${e.sample}`,
      );
    });
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? []);

test('inline scripts without the nonce are allowed by hash', async ({ request }) => {
  for (const path of ['/login', '/']) {
    const res = await request.get(path);
    const policy = res.headers()['content-security-policy-report-only'];
    expect(policy, `${path} sends the strict policy`).toBeTruthy();
    const html = await res.text();
    for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\ssrc=/.test(attrs) || /\snonce=/.test(attrs) || !policy.includes("'nonce-")) continue;
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      expect(policy, `Inline script on ${path} isn't allowed. If next-themes changed, set THEME_SCRIPT_HASH in lib/csp.ts to ${hash}. Script: ${body.slice(0, 80)}`).toContain(hash);
    }
  }
});

test('the enforced and report-only policies carry the same nonce', async ({ request }) => {
  // On Vercel, the page render sees the response's enforced CSP header, and
  // Next takes the nonce from it. Without the nonce there, scripts aren't
  // marked at all (this shipped once: locally `next start` didn't show it).
  const headers = (await request.get('/login')).headers();
  const nonce = (h: string | undefined) => h?.match(/'nonce-([^']+)'/)?.[1];
  const enforced = nonce(headers['content-security-policy']);
  expect(enforced).toBeTruthy();
  expect(enforced).toBe(nonce(headers['content-security-policy-report-only']));
});

test('static pages get no nonce; dynamic pages a fresh one each time', async ({ request }) => {
  const nonceOf = async (path: string) =>
    (await request.get(path)).headers()['content-security-policy-report-only']?.match(/'nonce-([^']+)'/)?.[1];
  expect(await nonceOf('/pricing')).toBeUndefined();
  const a = await nonceOf('/login');
  const b = await nonceOf('/login');
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);
});

test('public and app pages run without CSP violations', async ({ page }) => {
  test.setTimeout(90_000);
  await watchViolations(page);

  const check = async (label: string) => {
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    expect(await violations(page), label).toEqual([]);
  };

  for (const path of ['/', '/pricing', '/privacy', '/terms', '/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await check(path);
  }

  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `csp+${s}@example.com`, 'Cass Policy');
  await page.goto('/create-workspace');
  await check('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`CSP ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`csp-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/csp-${s}$`), { timeout: 15000 });
  await check('workspace home');

  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Policy');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await check('project board');

  // Client-side navigation and a theme switch, which runs the theme script's logic again.
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await check('theme switch');

  for (const path of [`/workspaces/csp-${s}/settings`, `/workspaces/csp-${s}/activity`, '/settings/billing', '/notifications']) {
    await page.goto(path);
    await check(path);
  }
});
