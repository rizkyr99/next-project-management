import { describe, it, expect } from 'vitest';
import { groupTasks, parseGroup, type GroupableTask } from '@/features/tasks/grouping';

const statuses = [
  { id: 'todo', name: 'To Do' },
  { id: 'doing', name: 'In Progress' },
  { id: 'done', name: 'Done' },
];
const now = new Date(2026, 10, 27, 10);
const me = { id: 'me', name: 'Dana' };
const ari = { id: 'ari', name: 'ari' };
const bo = { id: 'bo', name: 'Bo' };

const task = (id: string, over: Partial<GroupableTask> = {}): GroupableTask => ({
  id,
  statusId: 'todo',
  priority: 'medium',
  dueDate: null,
  assignees: [],
  ...over,
});

const shape = (groups: { label: string; tasks: { id: string }[] }[]) =>
  groups.map((g) => [g.label, g.tasks.map((t) => t.id)]);

describe('parseGroup', () => {
  it('reads the known groupings only', () => {
    expect(parseGroup(new URLSearchParams('group=assignee'))).toBe('assignee');
    expect(parseGroup(new URLSearchParams('group=project'))).toBeNull();
    expect(parseGroup(new URLSearchParams(''))).toBeNull();
  });
});

describe('groupTasks', () => {
  const ctx = { statuses, currentUserId: 'me', now };

  it('by column: board order, empty columns left out, task order kept', () => {
    const tasks = [task('a', { statusId: 'done' }), task('b'), task('c', { statusId: 'done' })];
    expect(shape(groupTasks(tasks, 'status', ctx))).toEqual([
      ['To Do', ['b']],
      ['Done', ['a', 'c']],
    ]);
  });

  it('by assignee: you first, then A–Z, then unassigned; shared tasks under each person', () => {
    const tasks = [
      task('a', { assignees: [{ user: bo }, { user: me }] }),
      task('b'),
      task('c', { assignees: [{ user: ari }] }),
    ];
    expect(shape(groupTasks(tasks, 'assignee', ctx))).toEqual([
      ['Dana (you)', ['a']],
      ['ari', ['c']],
      ['Bo', ['a']],
      ['Unassigned', ['b']],
    ]);
  });

  it('by priority: urgent to no priority', () => {
    const tasks = [task('a', { priority: 'none' }), task('b', { priority: 'urgent' }), task('c', { priority: 'low' })];
    expect(shape(groupTasks(tasks, 'priority', ctx))).toEqual([
      ['Urgent', ['b']],
      ['Low', ['c']],
      ['No priority', ['a']],
    ]);
  });

  it('by due date: overdue first, undated near the end, finished work last whatever its date', () => {
    const day = (offset: number) => new Date(2026, 10, 27 + offset, 9);
    const tasks = [
      task('none'),
      task('late', { dueDate: day(-2) }),
      task('doneLate', { dueDate: day(-5), statusId: 'done' }),
      task('later', { dueDate: day(30) }),
      task('today', { dueDate: day(0) }),
      task('week', { dueDate: day(3) }),
    ];
    expect(shape(groupTasks(tasks, 'due', ctx))).toEqual([
      ['Overdue', ['late']],
      ['Today', ['today']],
      ['Next 7 days', ['week']],
      ['Later', ['later']],
      ['No due date', ['none']],
      ['Done', ['doneLate']],
    ]);
  });
});
