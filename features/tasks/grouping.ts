/**
 * I6: grouping the list and table views by column, assignee, priority or due
 * date. `?group=` in the URL, like the filters and sort, so a saved view
 * keeps it. Pure, so it's unit-tested; the order inside each group is the
 * order the tasks come in (the board's, or the chosen sort).
 */

import { DUE_GROUPS, dueGroup } from './due-groups';
import { PRIORITIES, priorityConfig, type Priority } from './priority';

export const GROUP_OPTIONS = [
  { key: 'status', label: 'Column' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority' },
  { key: 'due', label: 'Due date' },
] as const;

export type GroupBy = (typeof GROUP_OPTIONS)[number]['key'];

/** `?group=assignee`; null means one flat list. */
export function parseGroup(params: Pick<URLSearchParams, 'get'>): GroupBy | null {
  const value = params.get('group');
  return GROUP_OPTIONS.some((o) => o.key === value) ? (value as GroupBy) : null;
}

export interface GroupableTask {
  id: string;
  statusId: string;
  priority: Priority;
  dueDate?: Date | string | null;
  assignees: { user: { id: string; name: string } }[];
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

interface GroupContext {
  /** The project's columns, in board order; the last one is "done". */
  statuses: { id: string; name: string }[];
  currentUserId: string;
  now?: Date;
}

/**
 * Non-empty groups, in a fixed order: columns as on the board; you, then
 * teammates A–Z, then "Unassigned"; urgent to no priority; overdue to no due
 * date, with finished work last. A task with two assignees shows under both.
 */
export function groupTasks<T extends GroupableTask>(tasks: T[], by: GroupBy, ctx: GroupContext): TaskGroup<T>[] {
  const groups = new Map<string, TaskGroup<T>>();
  const add = (key: string, label: string, task: T) => {
    const group = groups.get(key) ?? { key, label, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  };
  const doneId = ctx.statuses.at(-1)?.id;

  for (const task of tasks) {
    if (by === 'status') {
      add(task.statusId, ctx.statuses.find((s) => s.id === task.statusId)?.name ?? 'Other', task);
    } else if (by === 'priority') {
      add(task.priority, priorityConfig[task.priority].label, task);
    } else if (by === 'due') {
      const key = task.statusId === doneId ? 'done' : dueGroup(task.dueDate ?? null, ctx.now);
      add(key, DUE_GROUPS.find((g) => g.key === key)!.label, task);
    } else if (task.assignees.length === 0) {
      add('unassigned', 'Unassigned', task);
    } else {
      for (const { user } of task.assignees) {
        add(user.id, user.id === ctx.currentUserId ? `${user.name} (you)` : user.name, task);
      }
    }
  }

  const list = [...groups.values()];
  const rank = (keys: readonly string[]) => (g: TaskGroup<T>) => {
    const i = keys.indexOf(g.key);
    return i === -1 ? keys.length : i;
  };
  if (by === 'status') return sortBy(list, rank(ctx.statuses.map((s) => s.id)));
  if (by === 'priority') return sortBy(list, rank(PRIORITIES));
  if (by === 'due') return sortBy(list, rank(DUE_GROUPS.map((g) => g.key)));
  return list.sort((a, b) => {
    const weight = (g: TaskGroup<T>) => (g.key === ctx.currentUserId ? 0 : g.key === 'unassigned' ? 2 : 1);
    return weight(a) - weight(b) || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
}

const sortBy = <G>(list: G[], rank: (g: G) => number) => list.sort((a, b) => rank(a) - rank(b));
