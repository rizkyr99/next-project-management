import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { registerAndLogin } from './helpers/auth';
import { testDb } from './helpers/db';
import { makePro } from './helpers/plan';

/**
 * E4: makes the landing page's product screenshots from the real app, with
 * a believable studio (Northwind) and client (Acme). Not part of the normal
 * suite: run it on purpose against a production build,
 *
 *   MARKETING_SHOTS=1 E2E_SERVER=start npx playwright test marketing-shots
 *
 * and it writes public/marketing/*.webp.
 */
test.skip(!process.env.MARKETING_SHOTS, 'Set MARKETING_SHOTS=1 to regenerate the landing page screenshots.');

const OUT = path.join(__dirname, '..', 'public', 'marketing');
const stamp = `${Date.now()}`;

/** "YYYY-MM-DD", `offset` days from today on this machine. */
function day(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function person(browser: Browser, email: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await registerAndLogin(page, email, name);
  const sql = await testDb();
  // A real account would have confirmed its address: no "verify your email" banner in the shots.
  await sql`update "user" set email_verified = true where email = ${email}`;
  return page;
}

/** Saves a PNG screenshot as a compact WebP next to the other marketing images. */
async function save(png: Buffer, name: string) {
  await mkdir(OUT, { recursive: true });
  await sharp(png).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
}

async function fromTemplate(page: Page, name: string, template: string, start: string) {
  const from = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create new project' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('combobox', { name: 'Start from' }).click();
  await page.getByRole('option', { name: template }).click();
  await dialog.getByLabel('Start date').fill(start);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL((u) => u.pathname !== from && /\/projects\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 });
  return new URL(page.url()).pathname;
}

async function openTask(page: Page, projectUrl: string, title: string) {
  const id = (await page.locator(`[aria-label="Open task ${title}"]`).getAttribute('data-testid'))!.replace(/^task-/, '');
  await page.goto(`${projectUrl}?task=${id}`);
  return page.getByRole('dialog', { name: title });
}

async function comment(page: Page, sheet: ReturnType<Page['getByRole']>, text: string, forClient = false) {
  const choice = sheet.getByRole('radiogroup', { name: 'Who sees this comment' });
  if (forClient) await choice.getByRole('radio', { name: 'Client can see' }).click();
  await sheet.getByPlaceholder(/Add (a|an internal) comment/).fill(text);
  await sheet.getByRole('button', { name: 'Send comment' }).click();
  const item = sheet.getByRole('list', { name: 'Comments' }).getByRole('listitem').filter({ hasText: text.slice(0, 24) });
  await expect(item).not.toHaveAttribute('aria-busy', 'true', { timeout: 15000 });
}

test('landing page screenshots (E4)', async ({ browser }) => {
  test.setTimeout(240_000);
  const slug = `northwind-${stamp}`;
  const owner = await person(browser, `maya+${stamp}@example.com`, 'Maya Chen');
  await owner.goto('/create-workspace');
  await owner.getByPlaceholder('e.g. Tide Corp Design').fill('Northwind Studio');
  await owner.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await owner.getByRole('button', { name: /create workspace/i }).click();
  await expect(owner).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await makePro(slug);

  const acme = await fromTemplate(owner, 'Acme website', 'Website build', day(-12));
  const globex = await fromTemplate(owner, 'Globex rebrand', 'Brand identity', day(-4));
  await fromTemplate(owner, 'Initech content', 'Content calendar', day(-1));
  const sql = await testDb();
  await sql`update project set client_name = 'Acme Co', deadline = ${day(34)}, status = 'on_track'
    where workspace_id = (select id from workspace where slug = ${slug}) and name = 'Acme website'`;
  await sql`update project set client_name = 'Globex', deadline = ${day(3)}, status = 'at_risk'
    where workspace_id = (select id from workspace where slug = ${slug}) and name = 'Globex rebrand'`;
  await sql`update project set client_name = 'Initech'
    where workspace_id = (select id from workspace where slug = ${slug}) and name = 'Initech content'`;
  // The getting-started tour isn't part of a studio's real week.
  await sql`delete from project where workspace_id = (select id from workspace where slug = ${slug}) and name = 'Getting started'`;

  // Sam from Acme joins as a client on the Acme project only.
  await owner.goto(`/workspaces/${slug}/settings?tab=members`);
  const card = owner.locator('[data-slot="card"]', { hasText: 'Invite members' });
  await card.getByPlaceholder('teammate@company.com').fill(`sam+${stamp}@example.com`);
  await card.getByRole('combobox', { name: 'Role' }).click();
  await owner.getByRole('option', { name: 'Guest (client)' }).click();
  await card.getByRole('checkbox', { name: 'Acme website' }).check();
  await card.getByRole('button', { name: 'Send invite' }).click();
  const link = card.getByRole('textbox', { name: 'Invite link', exact: true });
  await expect(link).toBeVisible({ timeout: 15000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  const client = await person(browser, `sam+${stamp}@example.com`, 'Sam Rivera');
  await client.goto(invitePath);
  await client.getByRole('button', { name: 'Accept invite' }).click();
  await expect(client).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });

  // The studio's side of the conversation on Visual design, then a request for sign-off.
  await owner.goto(acme);
  let sheet = await openTask(owner, acme, 'Visual design');
  await comment(owner, sheet, 'Both directions are in the Figma file. I’d lead with the darker blue.');
  await comment(owner, sheet, 'Here’s the homepage and two inner pages for your review, Sam.', true);
  const approval = sheet.getByRole('region', { name: 'Approval' });
  await approval.getByRole('button', { name: 'Request approval' }).click();
  await approval
    .getByRole('textbox', { name: 'Message to the client' })
    .fill('Homepage, About and Services are ready. Approve, or tell us what to change.');
  await approval.getByRole('button', { name: 'Send to client' }).click();
  await expect(approval.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
  await expect(owner.locator('[aria-label="Open task Visual design"]')).toContainText('Awaiting approval', {
    timeout: 30000,
  });
  sheet = await openTask(owner, acme, 'Wireframes');
  await sheet.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Request approval' }).click();
  await sheet.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Send to client' }).click();
  await expect(sheet.getByText('Waiting for the client')).toBeVisible({ timeout: 15000 });
  await expect(owner.locator('[aria-label="Open task Wireframes"]')).toContainText('Awaiting approval', {
    timeout: 30000,
  });

  // Sam approves the wireframes and comments on the sitemap.
  await client.goto(acme);
  let clientSheet = await openTask(client, acme, 'Wireframes');
  await clientSheet.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Approve' }).click();
  await expect(clientSheet.getByRole('list', { name: 'Approval history' })).toContainText('Approved', { timeout: 15000 });
  clientSheet = await openTask(client, acme, 'Sitemap and content plan');
  await comment(client, clientSheet, 'Can we add a Careers page? We’re hiring in spring.');

  // A studio mid-project, not one created a minute ago: a teammate, finished
  // work in Done, people on tasks, and a conversation that happened yesterday.
  const ws = (await sql`select id from workspace where slug = ${slug}`)[0].id as string;
  const jonas = `jonas-${stamp}`;
  await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${jonas}, 'Jonas Weber', ${`jonas+${stamp}@example.com`}, true, now(), now())`;
  await sql`insert into member (id, workspace_id, user_id, role) values (${`m-${jonas}`}, ${ws}, ${jonas}, 'member')`;
  const maya = (await sql`select id from "user" where email = ${`maya+${stamp}@example.com`}`)[0].id as string;
  const move = async (project: string, titles: string[], column: string) => {
    await sql`update task set status_id = (
        select s.id from task_status s join project p on p.id = s.project_id
        where p.workspace_id = ${ws} and p.name = ${project} and s.name = ${column})
      where title = any(${titles}) and project_id = (select id from project where workspace_id = ${ws} and name = ${project})`;
  };
  await move('Acme website', ['Kickoff call', 'Sitemap and content plan', 'Wireframes'], 'Done');
  await move('Acme website', ['Visual design'], 'Client review');
  await move('Acme website', ['Copywriting'], 'In Progress');
  await move('Globex rebrand', ['Discovery workshop'], 'Done');
  await move('Globex rebrand', ['Competitor and market review', 'Moodboards'], 'In Progress');
  await move('Initech content', ['Plan the month'], 'Published');
  // Cards don't yet know a task in the last column is finished, so a past
  // due date there would show as overdue. Finished work keeps no due date here.
  await sql`update task set due_date = null where title = any(${[
    'Kickoff call',
    'Sitemap and content plan',
    'Wireframes',
    'Discovery workshop',
    'Plan the month',
  ]}) and project_id in (select id from project where workspace_id = ${ws})`;
  await move('Initech content', ['Social posts, week 1'], 'Writing');
  await sql`insert into task_assignee (task_id, user_id)
    select t.id, case when t.title in ('Visual design', 'Wireframes', 'Moodboards', 'Logo concepts', 'Build', 'Social posts, week 1')
      then ${jonas} else ${maya} end
    from task t join project p on p.id = t.project_id where p.workspace_id = ${ws}
    on conflict do nothing`;
  await sql`update comment set created_at = created_at - interval '19 hours', updated_at = null
    where task_id in (select t.id from task t join project p on p.id = t.project_id where p.workspace_id = ${ws})`;
  await sql`update task_approval set created_at = created_at - interval '20 hours',
      responded_at = responded_at - interval '17 hours'
    where task_id in (select t.id from task t join project p on p.id = t.project_id where p.workspace_id = ${ws})`;

  // 1. The client's view: the request waiting for them, and the conversation.
  clientSheet = await openTask(client, acme, 'Visual design');
  const clientApproval = clientSheet.getByRole('region', { name: 'Approval' });
  await expect(clientApproval.getByRole('button', { name: 'Approve' })).toBeVisible();
  await clientApproval.scrollIntoViewIfNeeded();
  await client.waitForTimeout(500);
  const sheetBox = (await clientSheet.boundingBox())!;
  const fromBox = (await clientApproval.boundingBox())!;
  const toBox = (await clientSheet.getByRole('list', { name: 'Comments' }).boundingBox())!;
  await save(
    await client.screenshot({
      clip: { x: sheetBox.x, y: fromBox.y - 20, width: sheetBox.width, height: toBox.y + toBox.height - fromBox.y + 36 },
    }),
    'client-approval',
  );
  await client.keyboard.press('Escape');
  await expect(clientSheet).toBeHidden();
  await client.waitForTimeout(500);
  // The sidebar (only Acme, under "Shared with you") and the board, legible at half the page's width.
  await save(await client.screenshot({ clip: { x: 0, y: 0, width: 960, height: 500 } }), 'client-board');

  // 2. The studio overview the next morning.
  await owner.goto(`/workspaces/${slug}`);
  await expect(owner.getByRole('list', { name: 'Client feedback' }).getByRole('link')).toHaveCount(2, { timeout: 15000 });
  await owner.waitForTimeout(800);
  const top = await owner.getByRole('list', { name: 'At a glance' }).boundingBox();
  const left = await owner.getByRole('region', { name: 'Due soon' }).boundingBox();
  const right = await owner.getByRole('region', { name: 'Client feedback' }).boundingBox();
  const pad = 24;
  const clip = {
    x: top!.x - pad,
    y: top!.y - pad,
    width: top!.width + pad * 2,
    height: Math.max(left!.y + left!.height, right!.y + right!.height) - top!.y + pad * 2,
  };
  await save(await owner.screenshot({ clip, fullPage: true }), 'overview');

  void globex;
});
