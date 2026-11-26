import { describe, it, expect } from 'vitest';
import { loadLevel, upcomingWeeks, workload, type WorkloadTask } from '@/features/workload/compute';

// Thursday 26 Nov 2026, 10:00 local.
const NOW = new Date(2026, 10, 26, 10);
const at = (m: number, d: number, h = 0) => new Date(2026, m - 1, d, h);

const task = (id: string, over: Partial<WorkloadTask> = {}): WorkloadTask => ({
  id,
  title: id,
  projectId: 'p',
  projectName: 'Site',
  startDate: null,
  dueDate: null,
  dueHasTime: false,
  assigneeIds: ['ada'],
  ...over,
});

describe('upcomingWeeks', () => {
  it('starts on the Monday of this week', () => {
    expect(upcomingWeeks(2, NOW)).toEqual([
      { start: '2026-11-23', end: '2026-11-29' },
      { start: '2026-11-30', end: '2026-12-06' },
    ]);
  });
});

describe('workload', () => {
  const weeks = upcomingWeeks(3, NOW); // 23 Nov – 13 Dec

  it('counts each task in every week it touches, per assignee', () => {
    const [ada, bo, none] = workload(
      [
        task('this-week', { dueDate: at(11, 27) }),
        task('spans', { startDate: '2026-11-28', dueDate: at(12, 2), assigneeIds: ['ada', 'bo'] }),
        task('third-week', { dueDate: at(12, 9), assigneeIds: ['bo'] }),
        task('nobody', { dueDate: at(11, 30), assigneeIds: [] }),
      ],
      ['ada', 'bo'],
      weeks,
      NOW,
    );
    expect(ada.weeks.map((w) => w.map((t) => t.id))).toEqual([['this-week', 'spans'], ['spans'], []]);
    expect(bo.weeks.map((w) => w.length)).toEqual([1, 1, 1]);
    expect(none.personId).toBeNull();
    expect(none.weeks[1].map((t) => t.id)).toEqual(['nobody']);
  });

  it('keeps overdue, undated and later work out of the weeks', () => {
    const [ada] = workload(
      [
        task('late', { dueDate: at(11, 20) }),
        task('today', { dueDate: at(11, 26) }),
        task('undated'),
        task('next-year', { dueDate: at(12, 30) }),
      ],
      ['ada'],
      weeks,
      NOW,
    );
    expect(ada.overdue.map((t) => t.id)).toEqual(['late']);
    expect(ada.weeks[0].map((t) => t.id)).toEqual(['today']);
    expect(ada.noDate.map((t) => t.id)).toEqual(['undated']);
    expect(ada.later).toBe(1);
  });

  it('treats people who left (not in the list) as unassigned', () => {
    const rows = workload([task('orphan', { dueDate: at(11, 27), assigneeIds: ['gone'] })], ['ada'], weeks, NOW);
    expect(rows.find((r) => r.personId === null)!.weeks[0].map((t) => t.id)).toEqual(['orphan']);
  });
});

describe('loadLevel', () => {
  it('shades by how many tasks are in the week', () => {
    expect([0, 1, 3, 4, 6, 7].map(loadLevel)).toEqual([0, 1, 1, 2, 2, 3]);
  });
});
