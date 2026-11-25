import { test, expect, type Browser, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';
import { testDb } from './helpers/db';

/**
 * C3 approvals: the team asks the client to approve a task; the client
 * requests changes or approves from their home list or the task; the team
 * sees it on the card, in the sheet and in notifications; a request can be
 * withdrawn.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** The task's card on the board (behind the open sheet, so not via roles). */
const card = (page: Page) => page.locator('[aria-label="Open task Homepage"]');

async function newUser(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  return { context, page };
}

test('the team asks for approval; the client requests changes, then approves', async ({ browser }) => {
  test.setTimeout(150_000);
  const s = stamp();
  const slug = `apr-${s}`;
  const ownerEmail = `apr-owner+${s}@example.com`;
  const guestEmail = `apr-client+${s}@example.com`;

  const owner = await newUser(browser, ownerEmail, 'Studio Owner');
  await owner.page.goto('/create-workspace');
  await owner.page.getByPlaceholder('e.g. Tide Corp Design').fill(`Studio ${s}`);
  await owner.page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.page.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await owner.page.getByRole('button', { name: 'Add project' }).click();
  await owner.page.getByLabel('Name').fill('Acme website');
  await owner.page.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(owner.page.url()).pathname;
  await addTask(owner.page, 'To Do', 'Homepage');

  // No client yet: nobody to ask.
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const sheet = owner.page.getByRole('dialog', { name: 'Homepage' });
  await expect(sheet.getByRole('region', { name: 'Approval' })).toHaveCount(0);

  // Share the project with a client.
  await owner.page.goto(`/workspaces/${slug}/settings`);
  await owner.page.getByRole('tab', { name: /Members/ }).click();
  const inviteCard = owner.page.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await inviteCard.getByPlaceholder('teammate@company.com').fill(guestEmail);
  await inviteCard.getByRole('combobox', { name: 'Role' }).click();
  await owner.page.getByRole('option', { name: 'Guest (client)' }).click();
  await inviteCard.getByRole('checkbox', { name: 'Acme website' }).check();
  await inviteCard.getByRole('button', { name: 'Send invite' }).click();
  const link = inviteCard.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  const guest = await newUser(browser, guestEmail, 'Cleo Client');
  await guest.page.goto(invitePath);
  await guest.page.getByRole('button', { name: 'Accept invite' }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // The team asks, with a message; the card shows it's waiting.
  await owner.page.goto(projectUrl);
  await owner.page.getByRole('button', { name: 'Open task Homepage' }).click();
  const approval = sheet.getByRole('region', { name: 'Approval' });
  await approval.getByRole('button', { name: 'Request approval' }).click();
  await approval.getByRole('textbox', { name: 'Message to the client' }).fill('Please check the hero section');
  await approval.getByRole('button', { name: 'Send to client' }).click();
  await expect(approval.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
  await expect(card(owner.page)).toContainText('Awaiting approval', {
    timeout: 15000,
  });

  // The client finds it on their home page and asks for changes.
  await guest.page.goto(`/workspaces/${slug}`);
  const waiting = guest.page.getByRole('list', { name: 'Waiting for your approval' });
  await waiting.getByRole('link', { name: /Homepage/ }).click();
  const guestSheet = guest.page.getByRole('dialog', { name: 'Homepage' });
  const guestApproval = guestSheet.getByRole('region', { name: 'Approval' });
  await expect(guestApproval).toContainText('Studio Owner asked for your approval');
  await expect(guestApproval).toContainText('Please check the hero section');
  await guestApproval.getByRole('button', { name: 'Request changes' }).click();
  await guestApproval.getByRole('textbox', { name: 'What should change?' }).fill('Make the logo bigger');
  await guestApproval.getByRole('button', { name: 'Send request' }).click();
  const guestHistory = guestApproval.getByRole('list', { name: 'Approval history' });
  await expect(guestHistory).toContainText('Changes requested', { timeout: 15000 });
  await expect(guestHistory).toContainText('Make the logo bigger');
  await expect(guestApproval.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // The team is notified and sees it on the card and in the sheet.
  const db = await testDb();
  await expect
    .poll(async () => {
      const rows = await db`
        select n.type from notification n join "user" u on u.id = n.user_id
        where lower(u.email) = ${ownerEmail} and n.type = 'changes_requested'`;
      return rows.length;
    })
    .toBe(1);
  await owner.page.reload();
  await expect(card(owner.page)).toContainText('Changes requested', {
    timeout: 15000,
  });
  const history = approval.getByRole('list', { name: 'Approval history' });
  await expect(history).toContainText('by Cleo Client');
  await expect(history).toContainText('Make the logo bigger');

  // A request can be withdrawn; the client then has nothing to answer.
  await approval.getByRole('button', { name: 'Request approval' }).click();
  await approval.getByRole('button', { name: 'Send to client' }).click();
  await expect(approval.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
  await approval.getByRole('button', { name: 'Withdraw request' }).click();
  await expect(history).toContainText('Request withdrawn', { timeout: 15000 });
  await guest.page.reload();
  await expect(guestApproval.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(guestApproval).not.toContainText('withdrawn');

  // Ask again; this time the client approves.
  await approval.getByRole('button', { name: 'Request approval' }).click();
  await approval.getByRole('button', { name: 'Send to client' }).click();
  await expect(approval.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
  await guest.page.reload();
  await guestApproval.getByRole('button', { name: 'Approve' }).click();
  await expect(guestHistory.getByText('Approved').first()).toBeVisible({ timeout: 15000 });
  await owner.page.reload();
  await expect(card(owner.page)).toContainText('Approved', {
    timeout: 15000,
  });
  await expect(sheet.getByText(/approved "Homepage"/)).toBeVisible();

  await owner.context.close();
  await guest.context.close();
});
