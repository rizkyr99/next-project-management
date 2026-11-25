import { test, expect, type Locator } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';

test('checklist: add, paste a list, tick, rename, delete, reorder, and see progress on the card', async ({ page }) => {
  test.setTimeout(90_000);
  /** The next server action whose request carries `field` to finish. */
  const saved = (field: string) =>
    page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.request().headers()['next-action'] !== undefined &&
        (r.request().postData() ?? '').includes(`"${field}"`),
    );
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await registerAndLogin(page, `chk+${s}@example.com`, 'Cam Checklist');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Chk ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(`chk-${s}`);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/chk-${s}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Site build');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Site build' })).toBeVisible();
  await addTask(page, 'To Do', 'Homepage');

  await page.getByRole('button', { name: 'Open task Homepage' }).click();
  const sheet = page.getByRole('dialog', { name: 'Homepage' });
  const steps = sheet.getByRole('list', { name: 'Steps' });
  const stepNames = () => steps.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const box = sheet.getByRole('textbox', { name: 'Add a checklist step' });

  // Type a step and press Enter; the box stays ready for the next one.
  await box.fill('Wireframes');
  await Promise.all([saved('titles'), box.press('Enter')]);
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();

  // Paste a list: one step per line, bullets dropped.
  await Promise.all([
    saved('titles'),
    box.evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', '- Copy\n- Build\n- Launch');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }),
  ]);
  await expect.poll(stepNames).toEqual(['Wireframes', 'Copy', 'Build', 'Launch']);
  await expect(sheet.getByRole('heading', { name: /Checklist/ })).toContainText('0/4');

  // Tick one off.
  const check = (name: string): Locator => steps.getByRole('checkbox', { name, exact: true });
  await Promise.all([saved('done'), check('Wireframes').click()]);
  await expect(check('Wireframes')).toBeChecked();
  await expect(sheet.getByRole('heading', { name: /Checklist/ })).toContainText('1/4');

  // Rename one.
  await steps.getByRole('button', { name: 'Copy', exact: true }).click();
  await sheet.getByRole('textbox', { name: 'Edit step', exact: true }).fill('Homepage copy');
  await Promise.all([saved('title'), sheet.getByRole('textbox', { name: 'Edit step', exact: true }).press('Enter')]);
  await expect(check('Homepage copy')).toBeVisible();

  // Delete one.
  const launch = steps.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: 'Launch', exact: true }) });
  await launch.hover();
  await Promise.all([saved('itemId'), launch.getByRole('button', { name: 'Delete “Launch”' }).click()]);
  await expect(check('Launch')).toHaveCount(0);

  // Reorder with the keyboard: move "Build" up one.
  // dnd-kit ignores an arrow pressed straight after pickup (only a test is
  // that fast), so press again until the move is announced.
  const heard = (text: string) => page.locator('[id^="DndLiveRegion"]', { hasText: text });
  await steps.getByRole('button', { name: 'Reorder “Build”' }).focus();
  await page.keyboard.press('Space');
  await expect(heard('Picked up step Build.')).toHaveCount(1);
  await expect(async () => {
    if ((await heard('is over step Homepage copy').count()) === 0) await page.keyboard.press('ArrowUp');
    await expect(heard('Step Build is over step Homepage copy.')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 8000 });
  await Promise.all([saved('itemIds'), page.keyboard.press('Space')]);
  await expect.poll(stepNames).toEqual(['Wireframes', 'Build', 'Homepage copy']);

  // Progress on the card.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const card = page.getByRole('button', { name: 'Open task Homepage' });
  await expect(card.getByLabel('Checklist: 1 of 3 done')).toBeVisible({ timeout: 15000 });

  // Everything was saved.
  await page.reload();
  await page.getByRole('button', { name: 'Open task Homepage' }).click();
  await expect.poll(stepNames).toEqual(['Wireframes', 'Build', 'Homepage copy']);
  await expect(check('Wireframes')).toBeChecked();
  await expect(check('Build')).not.toBeChecked();
});
