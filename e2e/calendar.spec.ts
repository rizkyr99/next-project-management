import { test, expect, type Locator, type Page } from '@playwright/test';
import { registerAndLogin } from './helpers/auth';
import { addTask } from './helpers/tasks';
import { testDb } from './helpers/db';
import { endTrial } from './helpers/plan';

/**
 * B4: the calendar view. Tasks span their start to due day; dragging one to
 * another day moves both dates; undated tasks wait on the side and get a due
 * date when dropped. On Free the view offers the upgrade instead.
 */

/** Drags with the mouse the way a person would: press, move past the 5 px threshold, move, release. */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  // The drop target is worked out on the next animation frame: pause over it,
  // as a person does, so the release doesn't use one from along the way.
  await page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2 + 2);
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/**
 * Waits until a task's bar sits inside a day's cell. After a move the page
 * refreshes and rows can change height; measuring the next drop target
 * before that settles would aim at the wrong day.
 */
async function settledOn(bar: Locator, cell: Locator) {
  await expect
    .poll(
      async () => {
        const b = await bar.boundingBox();
        const c = await cell.boundingBox();
        if (!b || !c) return false;
        const x = b.x + 4;
        const y = b.y + b.height / 2;
        return x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height;
      },
      { timeout: 15000 },
    )
    .toBe(true);
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('tasks on the calendar: ranges, drag to reschedule, schedule the undated, Pro only (B4)', async ({ page }) => {
  test.setTimeout(120_000);
  // Tall enough that the whole month fits: near the window's edge a drag scrolls the page.
  await page.setViewportSize({ width: 1280, height: 1100 });
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `cal-${s}`;
  await registerAndLogin(page, `cal+${s}@example.com`, 'Cal Endar');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Calendar ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(page.url()).pathname;
  for (const title of ['Kickoff', 'Design', 'Copy']) await addTask(page, 'To Do', title);

  // Dates in this month: Kickoff due on the 10th, Design from the 12th to the 15th, Copy undated.
  const now = new Date();
  const on = (day: number) => new Date(now.getFullYear(), now.getMonth(), day);
  const sql = await testDb();
  const projectId = projectUrl.split('/').pop()!;
  await sql`update task set due_date = ${on(10)} where project_id = ${projectId} and title = 'Kickoff'`;
  await sql`update task set start_date = ${localDay(on(12))}, due_date = ${on(15)} where project_id = ${projectId} and title = 'Design'`;

  // The workspace is on its Pro trial: the calendar is there.
  await page.goto(`${projectUrl}?view=calendar`);
  const month = on(1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(page.getByRole('heading', { name: month })).toBeVisible({ timeout: 15000 });
  const chip = (title: string) => page.getByRole('button', { name: new RegExp(`^${title},`) });
  await expect(chip('Design')).toHaveAccessibleName(/^Design, .* to /);
  const undated = page.getByRole('complementary', { name: 'Without dates' });
  await expect(undated.getByRole('button', { name: /^Copy, no dates/ })).toBeVisible();

  const cell = (day: number) => page.locator(`[data-day="${localDay(on(day))}"]`);

  // Kickoff from the 10th to the 17th.
  await settledOn(chip('Kickoff'), cell(10));
  await drag(page, chip('Kickoff'), cell(17));
  await expect(page.getByText(/Moved “Kickoff”/)).toBeVisible();
  await expect
    .poll(async () => {
      const [row] = await sql`select due_date from task where project_id = ${projectId} and title = 'Kickoff'`;
      return localDay(new Date(row.due_date));
    })
    .toBe(localDay(on(17)));
  await settledOn(chip('Kickoff'), cell(17));

  // Design (12th–15th) dragged to start on the 19th: it keeps its four days.
  await drag(page, chip('Design'), cell(19));
  await expect
    .poll(async () => {
      const [row] = await sql`select start_date, due_date from task where project_id = ${projectId} and title = 'Design'`;
      // The test driver hands a `date` back as local midnight; the app reads it as the day string.
      return [localDay(new Date(row.start_date)), localDay(new Date(row.due_date))];
    })
    .toEqual([localDay(on(19)), localDay(on(22))]);
  await settledOn(chip('Design'), cell(19));

  // Copy, undated, dropped on the 24th: it gets that due date.
  await drag(page, undated.getByRole('button', { name: /^Copy,/ }), cell(24));
  await expect
    .poll(async () => {
      const [row] = await sql`select due_date from task where project_id = ${projectId} and title = 'Copy'`;
      return row.due_date ? localDay(new Date(row.due_date)) : null;
    })
    .toBe(localDay(on(24)));
  await expect(undated).toContainText('Every task here has a date.', { timeout: 15000 });

  // A click opens the task.
  await chip('Kickoff').click();
  await expect(page.getByRole('dialog', { name: 'Kickoff' })).toBeVisible();
  await page.keyboard.press('Escape');

  // On Free, the view is marked Pro and offers the upgrade instead.
  await endTrial(slug);
  await page.goto(`${projectUrl}?view=calendar`);
  await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar Pro' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Plan by date with the calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'See what Pro adds' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Plan by date with the calendar in Pro' })).toBeVisible();
});

test('the week view: one week, roomier, drag to another day, and back to the month (B4)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `calw-${s}`;
  await registerAndLogin(page, `calw+${s}@example.com`, 'Wren Week');
  await page.goto('/create-workspace');
  await page.getByPlaceholder('e.g. Tide Corp Design').fill(`Week ${s}`);
  await page.getByPlaceholder('e.g. tide-corp-design').fill(slug);
  await page.getByRole('button', { name: /create workspace/i }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${slug}$`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Name').fill('Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const projectUrl = new URL(page.url()).pathname;
  const projectId = projectUrl.split('/').pop()!;
  for (const title of ['Review', 'Launch']) await addTask(page, 'To Do', title);

  // A fixed week, Monday 7 to Sunday 13 June 2027: Review due Tuesday at 3 pm,
  // Launch the following week.
  const sql = await testDb();
  await sql`update task set due_date = ${new Date(2027, 5, 8, 15, 0)}, due_has_time = true
    where project_id = ${projectId} and title = 'Review'`;
  await sql`update task set due_date = ${new Date(2027, 5, 16)} where project_id = ${projectId} and title = 'Launch'`;

  // "Today" is pinned outside June 2027, so switching to the week opens the
  // month's first week whenever this runs (in June 2027 it would open this week).
  await page.clock.setFixedTime(new Date(2026, 10, 15, 12));
  await page.goto(`${projectUrl}?view=calendar&month=2027-06`);
  await expect(page.getByRole('heading', { name: 'June 2027' })).toBeVisible({ timeout: 15000 });
  const range = page.getByRole('group', { name: 'Calendar range' });
  await expect(range.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');

  // Week opens on the month's first week (June 2027 isn't this month).
  await range.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { name: 'May 31 – Jun 6, 2027' })).toBeVisible();
  await expect(range.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
  await expect(range.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByRole('heading', { name: 'Jun 7 – 13, 2027' })).toBeVisible();
  // Only this week's tasks, with their column and due time.
  const review = page.getByRole('button', { name: /^Review,/ });
  await expect(review).toContainText('3:00 PM · To Do');
  await expect(page.getByRole('button', { name: /^Launch,/ })).toHaveCount(0);
  await expect(page.locator('[data-day]')).toHaveCount(7);

  // It survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Jun 7 – 13, 2027' })).toBeVisible({ timeout: 15000 });

  // Drag Review from Tuesday to Thursday: the time of day stays.
  const cell = (day: string) => page.locator(`[data-day="${day}"]`);
  await settledOn(review, cell('2027-06-08'));
  await drag(page, review, cell('2027-06-10'));
  await expect(page.getByText(/Moved “Review”/)).toBeVisible();
  await expect
    .poll(async () => {
      const [row] = await sql`select due_date from task where project_id = ${projectId} and title = 'Review'`;
      const d = new Date(row.due_date);
      return [localDay(d), d.getHours()];
    })
    .toEqual(['2027-06-10', 15]);

  // Back to the month the week is in.
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByRole('button', { name: /^Launch,/ })).toBeVisible();
  await range.getByRole('button', { name: 'Month' }).click();
  await expect(page.getByRole('heading', { name: 'June 2027' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Review,/ })).toBeVisible();
});
