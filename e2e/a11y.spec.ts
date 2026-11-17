import AxeBuilder from '@axe-core/playwright';
import { appendFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';

/**
 * P4.5: automated WCAG 2.1 A/AA checks (axe-core) on the main screens, in
 * light and dark mode. Each page's violations are collected and reported
 * together, so one run shows everything that needs fixing.
 */

type Finding = { page: string; id: string; impact: string | null | undefined; help: string; targets: string[] };

// Set A11Y_OUT=/path/file.jsonl to dump every failing node (HTML + summary) while fixing.
function dump(label: string, violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  const out = process.env.A11Y_OUT;
  if (!out) return;
  for (const v of violations)
    for (const n of v.nodes)
      appendFileSync(out, JSON.stringify({ page: label, id: v.id, html: n.html.slice(0, 220), why: n.failureSummary?.slice(0, 260) }) + '\n');
}

async function scan(page: Page, label: string, findings: Finding[]) {
  // Let entrance animations settle so contrast is measured on final colours.
  await page.waitForTimeout(400);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  dump(label, result.violations);
  for (const v of result.violations) {
    findings.push({
      page: label,
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
    });
  }
}

function report(findings: Finding[]) {
  return findings
    .map((f) => `[${f.page}] ${f.id} (${f.impact}): ${f.help}\n    ${f.targets.join('\n    ')}`)
    .join('\n');
}

test('public pages have no WCAG 2.1 A/AA violations', async ({ page }) => {
  const findings: Finding[] = [];
  for (const [path, label] of [
    ['/', 'landing'],
    ['/pricing', 'pricing'],
    ['/privacy', 'privacy'],
    ['/login', 'login'],
    ['/register', 'register'],
    ['/forgot-password', 'forgot-password'],
  ] as const) {
    await page.goto(path);
    await scan(page, label, findings);
  }
  expect(findings, report(findings)).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`app screens have no WCAG 2.1 A/AA violations (${scheme})`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    const findings: Finding[] = [];
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await registerAndLogin(page, `a11y-${scheme}+${s}@example.com`, 'Ari Access');
    await page.evaluate((t) => localStorage.setItem('theme', t), scheme);

    const slug = `a11y-${scheme}-${s}`;
    await page.goto('/create-workspace');
    await scan(page, 'create-workspace', findings);
    await page.getByPlaceholder('e.g. Tide Corp Design').fill(`A11y ${s}`);
    await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
    await scan(page, 'workspace home', findings);

    // The Getting started board has tasks of every priority.
    await page.locator('[data-sidebar="sidebar"]').first().getByRole('link', { name: 'Getting started' }).click();
    await expect(page.getByTestId('column-Done')).toBeVisible();
    await scan(page, 'board', findings);

    await page.getByRole('button', { name: 'Open task Open a task to see its details' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByText('Description').first().waitFor();
    await scan(page, 'task panel', findings);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page).toHaveURL(/view=list/);
    await scan(page, 'list view', findings);
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page).toHaveURL(/view=table/);
    await scan(page, 'table view', findings);

    for (const [path, label] of [
      [`/workspaces/${slug}/my-tasks`, 'my tasks'],
      [`/workspaces/${slug}/activity`, 'activity'],
      [`/workspaces/${slug}/settings`, 'settings'],
      [`/workspaces/${slug}/settings?tab=members`, 'settings members'],
      [`/workspaces/${slug}/account`, 'account'],
      ['/notifications', 'notifications'],
      ['/settings/notifications', 'email preferences'],
    ] as const) {
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await scan(page, label, findings);
    }

    await context.close();
    expect(findings, report(findings)).toEqual([]);
  });
}
