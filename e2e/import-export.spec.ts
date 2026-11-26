import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { registerAndLogin } from './helpers/auth';

/** A small Trello board export: two open lists, one archived; one archived card. */
const trelloBoard = {
  name: 'Client site (Trello)',
  lists: [
    { id: 'l1', name: 'Backlog', pos: 1 },
    { id: 'l2', name: 'Doing', pos: 2 },
    { id: 'l3', name: 'Old', pos: 3, closed: true },
  ],
  labels: [],
  cards: [
    {
      id: 'c1',
      name: 'Write homepage copy',
      desc: 'Tone: **friendly**',
      idList: 'l1',
      pos: 1,
      // Noon in the browser's zone: Trello's "no time" date.
      due: '2027-03-10T05:00:00.000Z',
      labels: [{ name: 'Copy', color: 'green' }],
    },
    { id: 'c2', name: 'Build header', idList: 'l2', pos: 1, labels: [{ name: '', color: 'red' }] },
    { id: 'c3', name: 'Archived card', idList: 'l1', pos: 2, closed: true },
  ],
  checklists: [
    {
      idCard: 'c1',
      pos: 1,
      checkItems: [
        { name: 'Hero', state: 'complete', pos: 1 },
        { name: 'About', state: 'incomplete', pos: 2 },
      ],
    },
  ],
};

// Trello dates are read in the browser's zone; pin it so noon is noon.
test.use({ timezoneId: 'Asia/Jakarta' });

async function importFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, summary: RegExp) {
  const from = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create new project' });
  await dialog.getByRole('combobox', { name: 'Start from' }).click();
  await page.getByRole('option', { name: 'Import from Trello or CSV…' }).click();
  await dialog.getByLabel('File').setInputFiles(file);
  await expect(dialog.getByTestId('import-summary')).toHaveText(summary);
  return {
    dialog,
    submit: async () => {
      await dialog.getByRole('button', { name: 'Import project' }).click();
      await page.waitForURL((u) => u.pathname !== from && /\/projects\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 15000,
      });
    },
  };
}

test('import a Trello board and a CSV, export a project and import it back (D4)', async ({ page }) => {
  test.setTimeout(120_000);
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `imp+${s}@example.com`, 'Ivy Import');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Imp ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`imp-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/imp-${s}$`), { timeout: 15000 });

  // Trello, on Free: the board name fills in, archived lists and cards stay out.
  const trello = await importFile(
    page,
    { name: 'board.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(trelloBoard)) },
    /^2 tasks, 2 columns, 2 labels, 2 checklist items\. 2 archived or untitled items are left out\.$/,
  );
  await expect(trello.dialog.getByLabel('Name')).toHaveValue('Client site (Trello)');
  await trello.submit();
  await expect(page.getByRole('heading', { level: 1, name: 'Client site (Trello)' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Column Backlog options' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Column Doing options' })).toBeVisible();
  const copy = page.getByRole('button', { name: 'Open task Write homepage copy' });
  await expect(copy).toContainText('Mar 10, 2027');
  await expect(copy).toContainText('Copy');
  await expect(copy.getByLabel('Checklist: 1 of 2 done')).toBeVisible();
  // A colour-only label is named by its colour.
  await expect(page.getByRole('button', { name: 'Open task Build header' })).toContainText('red');
  await expect(page.getByRole('button', { name: 'Open task Archived card' })).toHaveCount(0);

  // CSV with quoted commas and line breaks.
  const csv = [
    'Title,Status,Priority,Due date,Labels,Checklist',
    '"Plan launch, phase 1",Ready,high,2027-04-02,"Ops; Copy","[x] Budget\n[ ] Venue"',
    'Send invites,Ready,,,,',
    ',Ready,,,,',
  ].join('\n');
  const fromCsv = await importFile(
    page,
    { name: 'tasks.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
    /^2 tasks, 1 column, 2 labels, 2 checklist items\. 1 archived or untitled item is left out\.$/,
  );
  await fromCsv.dialog.getByLabel('Name').fill('Launch plan');
  await fromCsv.submit();
  await expect(page.getByRole('heading', { level: 1, name: 'Launch plan' })).toBeVisible({ timeout: 15000 });
  const plan = page.getByRole('button', { name: 'Open task Plan launch, phase 1' });
  await expect(plan).toContainText('Apr 2, 2027');
  await expect(plan.getByLabel('Checklist: 1 of 2 done')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open task Send invites' })).toBeVisible();

  // Export it, then import the file back as a new project.
  await page.getByRole('button', { name: 'Project options' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export to CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('launch-plan.csv');
  const exported = await readFile(await download.path());
  const text = exported.toString('utf8');
  expect(text).toContain('Title,Column,Priority,Start date,Due date,Due time,Assignees,Labels,Checklist,Description');
  expect(text).toContain('"Plan launch, phase 1",Ready,high,,2027-04-02,,,"Copy, Ops","[x] Budget\n[ ] Venue"');

  const again = await importFile(
    page,
    { name: 'launch-plan.csv', mimeType: 'text/csv', buffer: exported },
    /^2 tasks, 1 column, 2 labels, 2 checklist items\.$/,
  );
  await again.dialog.getByLabel('Name').fill('Launch plan copy');
  await again.submit();
  await expect(page.getByRole('heading', { level: 1, name: 'Launch plan copy' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Open task Plan launch, phase 1' }).getByLabel('Checklist: 1 of 2 done')).toBeVisible();

  // Something that isn't an export says so and can't be submitted.
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create new project' });
  await dialog.getByRole('combobox', { name: 'Start from' }).click();
  await page.getByRole('option', { name: 'Import from Trello or CSV…' }).click();
  await dialog.getByLabel('File').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(dialog.getByRole('alert')).toContainText('isn’t a Trello board export');
  await expect(dialog.getByRole('button', { name: 'Import project' })).toBeDisabled();
});
