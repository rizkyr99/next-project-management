import { test, expect, type Browser } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { makePro } from './helpers/plan';

/**
 * D1 studio overview on the workspace home: due soon in the viewer's time
 * zone, projects needing attention, approvals waiting on clients and recent
 * client feedback, plus progress on each project card.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

/** "YYYY-MM-DD", `offset` days from today in this machine's time zone (the browser's too). */
function localDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('the workspace home shows what is late, due, at risk and waiting on clients (D1)', async ({ browser }) => {
  test.setTimeout(150_000);
  const s = stamp();
  const slug = `ovw-${s}`;
  const guestEmail = `ovw-client+${s}@example.com`;
  const owner = await newUser(browser, `ovw-owner+${s}@example.com`, 'Studio Owner');
  const page = owner.page;

  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Overview ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await makePro(slug);

  // A website build that started ten days ago: Kickoff (day 0) and Sitemap
  // (day 5) are overdue, Wireframes (day 10) is due today.
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create new project' });
  await dialog.getByLabel('Name').fill('Acme website');
  await dialog.getByRole('combobox', { name: 'Start from' }).click();
  await page.getByRole('option', { name: 'Website build' }).click();
  await dialog.getByLabel('Start date').fill(localDay(-10));
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(page.url()).pathname;

  await page.goto(`/workspaces/${slug}`);
  await expect(page.getByRole('link', { name: /^Overdue/ })).toContainText('2');
  const due = page.getByRole('region', { name: 'Due soon' });
  await expect(due.getByRole('list', { name: 'Overdue' }).getByRole('link')).toHaveCount(2);
  await expect(due.getByRole('list', { name: 'Overdue' })).toContainText('Kickoff call');
  await expect(due.getByRole('list', { name: 'Today' })).toContainText('Wireframes');
  const attention = page.getByRole('list', { name: 'Projects needing attention' });
  await expect(attention.getByRole('link', { name: /Acme website/ })).toContainText('2 overdue tasks');
  // The seeded Getting started project is on schedule.
  await expect(attention.getByRole('link')).toHaveCount(1);
  const cards = page.getByRole('list', { name: 'Active projects' });
  await expect(cards.getByRole('link', { name: /Acme website/ })).toContainText('0 of 10 tasks done');
  await expect(page.getByRole('region', { name: 'Waiting on clients' })).toContainText('No approvals are waiting');

  // Bring the client in, ask for two approvals; the client answers one and comments.
  await page.goto(`/workspaces/${slug}/settings`);
  await page.getByRole('tab', { name: /Members/ }).click();
  const invite = page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await invite.getByPlaceholder('teammate@company.com').fill(guestEmail);
  await invite.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: 'Guest (client)' }).click();
  await invite.getByRole('checkbox', { name: 'Acme website' }).check();
  await invite.getByRole('button', { name: 'Send invite' }).click();
  const link = invite.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  const guest = await newUser(browser, guestEmail, 'Cleo Client');
  await guest.page.goto(invitePath);
  await guest.page.getByRole('button', { name: 'Accept invite' }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // Each task by its link. Before moving on, wait for the card to show the
  // request: then the page's refresh is done, and the next navigation can't
  // cancel it (or be cancelled by it) on a slow machine.
  await page.goto(projectUrl);
  const ids: Record<string, string> = {};
  for (const title of ['Kickoff call', 'Wireframes']) {
    const testId = await page.locator(`[aria-label="Open task ${title}"]`).getAttribute('data-testid');
    ids[title] = testId!.replace(/^task-/, '');
  }
  for (const title of ['Kickoff call', 'Wireframes']) {
    await page.goto(`${projectUrl}?task=${ids[title]}`);
    const approval = page.getByRole('dialog', { name: title }).getByRole('region', { name: 'Approval' });
    await approval.getByRole('button', { name: 'Request approval' }).click();
    await approval.getByRole('button', { name: 'Send to client' }).click();
    await expect(approval.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`[aria-label="Open task ${title}"]`)).toContainText('Awaiting approval', {
      timeout: 30000,
    });
  }

  await guest.page.goto(projectUrl);
  await guest.page.getByRole('button', { name: 'Open task Kickoff call' }).click();
  const guestSheet = guest.page.getByRole('dialog', { name: 'Kickoff call' });
  await guestSheet.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Approve' }).click();
  await expect(guestSheet.getByRole('list', { name: 'Approval history' })).toContainText('Approved', { timeout: 15000 });
  await guestSheet.getByPlaceholder(/Add (a|an internal) comment/).fill('**Love** the direction');
  await guestSheet.getByRole('button', { name: 'Send comment' }).click();
  const posted = guestSheet.getByRole('list', { name: 'Comments' }).getByRole('listitem').filter({ hasText: 'the direction' });
  await expect(posted).not.toHaveAttribute('aria-busy', 'true', { timeout: 15000 });

  await page.goto(`/workspaces/${slug}`);
  await expect(page.getByRole('link', { name: /^Waiting on clients/ })).toContainText('1');
  await expect(page.getByRole('list', { name: 'Waiting on clients' }).getByRole('link')).toHaveText(
    /Wireframes.*Acme website.*Asked/,
  );
  const feedback = page.getByRole('list', { name: 'Client feedback' });
  await expect(feedback.getByRole('link')).toHaveCount(2);
  await expect(feedback.getByRole('link').first()).toContainText('Cleo Client commented on Kickoff call');
  await expect(feedback.getByRole('link').first()).toContainText('“Love the direction”');
  await expect(feedback.getByRole('link').nth(1)).toContainText('Cleo Client approved Kickoff call');
  await feedback.getByRole('link').first().click();
  await expect(page.getByRole('dialog', { name: 'Kickoff call' })).toBeVisible({ timeout: 15000 });

  // The client's home is unchanged: no overview of the studio's work.
  await guest.page.goto(`/workspaces/${slug}`);
  await expect(guest.page.getByRole('region', { name: 'Due soon' })).toHaveCount(0);
  await expect(guest.page.getByRole('list', { name: 'Waiting for your approval' })).toContainText('Wireframes');

  await owner.context.close();
  await guest.context.close();
});
