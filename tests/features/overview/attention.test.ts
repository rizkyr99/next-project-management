import { describe, expect, it } from 'vitest';
import { projectsNeedingAttention, type OverviewProject, type OverviewTask } from '@/features/overview/attention';

// Local time, like the browser that runs this.
const NOW = new Date(2026, 10, 26, 10, 0); // Thu Nov 26, 10:00

const project = (over: Partial<OverviewProject> = {}): OverviewProject => ({
  id: 'p',
  name: 'Site',
  clientName: null,
  deadline: null,
  status: null,
  totalTasks: 5,
  doneTasks: 2,
  ...over,
});
const task = (projectId: string, due: Date, hasTime = false): OverviewTask => ({
  id: `${projectId}-${due.getTime()}`,
  title: 't',
  projectId,
  dueDate: due,
  dueHasTime: hasTime,
});

describe('projectsNeedingAttention', () => {
  it('leaves healthy and finished projects out', () => {
    expect(
      projectsNeedingAttention(
        [project({ status: 'on_track', deadline: '2026-12-20' }), project({ id: 'q', status: 'done', deadline: '2026-11-01' })],
        [],
        NOW,
      ),
    ).toEqual([]);
  });

  it('flags the team’s own status, a passed deadline, a close deadline and overdue tasks', () => {
    const out = projectsNeedingAttention(
      [
        project({ id: 'a', name: 'Alpha', status: 'at_risk' }),
        project({ id: 'b', name: 'Beta', deadline: '2026-11-20' }),
        project({ id: 'c', name: 'Gamma', deadline: '2026-11-29' }),
        project({ id: 'd', name: 'Delta' }),
      ],
      [
        task('d', new Date(2026, 10, 24)),
        task('d', new Date(2026, 10, 25)),
        // Due today (no time) isn't overdue yet; due earlier today at a time is.
        task('d', new Date(2026, 10, 26)),
        task('d', new Date(2026, 10, 26, 9, 0), true),
      ],
      NOW,
    );
    expect(out.map((a) => [a.project.name, a.reasons])).toEqual([
      ['Beta', ['Deadline passed on Nov 20, 3 tasks open']],
      ['Alpha', ['Marked at risk']],
      ['Gamma', ['Due in 3 days, 3 tasks open']],
      ['Delta', ['3 overdue tasks']],
    ]);
  });

  it('says today and tomorrow, and ignores a close deadline with nothing left to do', () => {
    const out = projectsNeedingAttention(
      [
        project({ id: 'a', name: 'A', deadline: '2026-11-26', totalTasks: 1, doneTasks: 0 }),
        project({ id: 'b', name: 'B', deadline: '2026-11-27' }),
        project({ id: 'c', name: 'C', deadline: '2026-11-27', totalTasks: 4, doneTasks: 4 }),
      ],
      [],
      NOW,
    );
    expect(out.map((a) => a.reasons[0])).toEqual(['Due today, 1 task open', 'Due tomorrow, 3 tasks open']);
  });

  it('lists every reason for one project, most serious first', () => {
    const [only] = projectsNeedingAttention(
      [project({ status: 'off_track', deadline: '2026-11-25' })],
      [task('p', new Date(2026, 10, 20))],
      NOW,
    );
    expect(only.reasons).toEqual(['Marked off track', 'Deadline passed on Nov 25, 3 tasks open', '1 overdue task']);
  });
});
