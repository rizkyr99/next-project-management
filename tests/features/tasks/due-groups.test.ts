import { describe, it, expect } from 'vitest';
import { dueGroup, groupByDue } from '@/features/tasks/due-groups';

// Wednesday 18 Nov 2026, 15:00 local time.
const now = new Date(2026, 10, 18, 15, 0);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour);

describe('dueGroup', () => {
  it('uses calendar days in local time', () => {
    expect(dueGroup(at(17, 23))).toBe('overdue');
    expect(dueGroup(at(18, 9), now)).toBe('today'); // earlier today is still "today", not overdue
    expect(dueGroup(at(18, 23), now)).toBe('today');
    expect(dueGroup(at(19, 0), now)).toBe('week');
    expect(dueGroup(at(24, 23), now)).toBe('week');
    expect(dueGroup(at(25, 0), now)).toBe('later');
    expect(dueGroup(null, now)).toBe('none');
  });

  it('accepts ISO strings (as they arrive from the server)', () => {
    expect(dueGroup(at(17).toISOString(), now)).toBe('overdue');
  });
});

describe('groupByDue', () => {
  it('returns non-empty groups in order, earliest first and then by priority', () => {
    const tasks = [
      { id: 'later', dueDate: at(30), priority: 'low' as const },
      { id: 'none', dueDate: null, priority: 'high' as const },
      { id: 'today-low', dueDate: at(18, 17), priority: 'low' as const },
      { id: 'today-high', dueDate: at(18, 17), priority: 'high' as const },
      { id: 'late', dueDate: at(10), priority: 'medium' as const },
    ];
    const groups = groupByDue(tasks, now);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'later', 'none']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['today-high', 'today-low']);
  });

  it('puts finished tasks in Done at the end, never in Overdue', () => {
    const groups = groupByDue(
      [
        { id: 'shipped', dueDate: at(10), priority: 'high' as const, done: true },
        { id: 'late', dueDate: at(12), priority: 'medium' as const },
      ],
      now,
    );
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ['overdue', ['late']],
      ['done', ['shipped']],
    ]);
  });
});
