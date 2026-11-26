import { taskSpan } from '@/features/calendar/layout';
import { dayKey, isOverdue } from '@/features/tasks/due';

/**
 * D2: open tasks per person per week, in the viewer's time zone. A task
 * counts in every week its start-to-due span touches; an overdue task counts
 * as Overdue instead; a task with no dates counts as No date. Only open
 * work is given (the server leaves out tasks in a project's last column).
 */

export interface WorkloadTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  startDate: string | null;
  dueDate: Date | string | null;
  dueHasTime: boolean;
  assigneeIds: string[];
}

export interface Week {
  /** Monday, "YYYY-MM-DD". */
  start: string;
  /** Sunday, "YYYY-MM-DD". */
  end: string;
}

/** `count` weeks from the Monday of the week `now` falls in. */
export function upcomingWeeks(count: number, now = new Date()): Week[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: dayKey(start), end: dayKey(end) };
  });
}

export interface WorkloadRow {
  /** A member's id, or null for unassigned work. */
  personId: string | null;
  overdue: WorkloadTask[];
  /** One list per week, in order. */
  weeks: WorkloadTask[][];
  noDate: WorkloadTask[];
  /** Beyond the weeks shown. */
  later: number;
}

export function workload(
  tasks: WorkloadTask[],
  personIds: string[],
  weeks: Week[],
  now = new Date(),
): WorkloadRow[] {
  const rows = new Map<string | null, WorkloadRow>(
    [...personIds, null].map((id) => [id, { personId: id, overdue: [], weeks: weeks.map(() => []), noDate: [], later: 0 }]),
  );
  const lastDay = weeks.at(-1)?.end ?? '';

  for (const task of tasks) {
    const owners = task.assigneeIds.filter((id) => rows.has(id));
    const targets = owners.length > 0 ? owners : [null];
    const span = taskSpan(task);
    for (const owner of targets) {
      const row = rows.get(owner)!;
      if (!span) {
        row.noDate.push(task);
      } else if (task.dueDate && isOverdue(task.dueDate, task.dueHasTime, now)) {
        row.overdue.push(task);
      } else {
        let placed = false;
        weeks.forEach((w, i) => {
          if (span.start <= w.end && span.end >= w.start) {
            row.weeks[i].push(task);
            placed = true;
          }
        });
        if (!placed && span.start > lastDay) row.later += 1;
      }
    }
  }
  return [...rows.values()];
}

/** How busy a week is, for shading: none, light, busy, heavy. */
export function loadLevel(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  return 3;
}
