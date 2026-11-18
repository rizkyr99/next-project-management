/**
 * Group tasks by when they're due, for "My tasks": what's late, what's for
 * today, the rest of this week, later, and undated. Calendar days in the
 * viewer's time zone (the same rules as the board's due-date filter), so a
 * DST change doesn't shift a task between groups.
 */
export const DUE_GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
] as const;

export type DueGroupKey = (typeof DUE_GROUPS)[number]['key'];

type Dated = { dueDate: Date | string | null; priority: 'low' | 'medium' | 'high' };

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function dueGroup(dueDate: Date | string | null, now = new Date()): DueGroupKey {
  if (!dueDate) return 'none';
  const due = new Date(dueDate);
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  if (due < day(0)) return 'overdue';
  if (due < day(1)) return 'today';
  if (due < day(7)) return 'week';
  return 'later';
}

/** Non-empty groups in order; within each, earliest first, then highest priority. */
export function groupByDue<T extends Dated>(tasks: T[], now = new Date()) {
  const byKey = new Map<DueGroupKey, T[]>();
  for (const task of tasks) {
    const key = dueGroup(task.dueDate, now);
    byKey.set(key, [...(byKey.get(key) ?? []), task]);
  }
  return DUE_GROUPS.filter((g) => byKey.has(g.key)).map((g) => ({
    ...g,
    tasks: byKey.get(g.key)!.sort(
      (a, b) =>
        (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    ),
  }));
}
