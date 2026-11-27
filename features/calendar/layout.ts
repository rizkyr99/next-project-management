import { dayKey, parseDay } from '@/features/tasks/due';

/**
 * B4: the calendar's month layout, as pure functions over calendar days
 * ("YYYY-MM-DD", the viewer's local days). Weeks start on Monday.
 */

export interface Scheduled {
  id: string;
  startDate?: string | null;
  dueDate?: Date | string | null;
}

export interface Span {
  /** First and last day it covers (inclusive). */
  start: string;
  end: string;
}

/**
 * The days a task covers: from its start day to its due day. A task with
 * only one of them covers that one day; with neither, it isn't on the
 * calendar. A start after the due day (data from before the pickers kept
 * them in order) collapses to the due day.
 */
export function taskSpan(task: Scheduled): Span | null {
  const due = task.dueDate ? dayKey(new Date(task.dueDate)) : null;
  const start = task.startDate ?? null;
  if (!due && !start) return null;
  if (!due) return { start: start!, end: start! };
  if (!start || start > due) return { start: due, end: due };
  return { start, end: due };
}

/** The weeks (Monday to Sunday) a month's grid shows: always whole weeks, 4 to 6 of them. */
export function monthWeeks(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // days back to Monday
  const cursor = new Date(year, month, 1 - offset);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return weeks;
}

/** The day `n` days after (or before, if negative) a day. */
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** The week (Monday to Sunday) a day falls in. */
export function weekOf(day: string): string[] {
  const offset = (parseDay(day).getDay() + 6) % 7; // days back to Monday
  return Array.from({ length: 7 }, (_, i) => addDays(day, i - offset));
}

/** "Nov 23 – 29, 2026", "Nov 30 – Dec 6, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function weekLabel(week: string[]): string {
  const a = parseDay(week[0]);
  const b = parseDay(week[6]);
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (a.getFullYear() !== b.getFullYear()) return `${md(a)}, ${a.getFullYear()} – ${md(b)}, ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${md(a)} – ${md(b)}, ${b.getFullYear()}`;
  return `${md(a)} – ${b.getDate()}, ${b.getFullYear()}`;
}

export interface Bar<T> {
  task: T;
  /** Columns 0–6 within the week. */
  from: number;
  to: number;
  /** The task carries on from the previous week / into the next. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Row within the week, from 0. */
  lane: number;
}

/**
 * Lays out the tasks that touch a week as bars in lanes: longest first, each
 * in the first lane where it fits, so ranges stay readable.
 */
export function layoutWeek<T extends Scheduled>(week: string[], tasks: T[]): Bar<T>[] {
  const first = week[0];
  const last = week[6];
  const placed = tasks
    .map((task) => ({ task, span: taskSpan(task) }))
    .filter((x): x is { task: T; span: Span } => x.span !== null && x.span.start <= last && x.span.end >= first)
    .map(({ task, span }) => {
      const from = span.start < first ? 0 : week.indexOf(span.start);
      const to = span.end > last ? 6 : week.indexOf(span.end);
      return { task, from, to, continuesBefore: span.start < first, continuesAfter: span.end > last };
    })
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));

  const lanes: number[] = []; // per lane, the last column taken
  return placed.map((bar) => {
    let lane = lanes.findIndex((end) => end < bar.from);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(bar.to);
    } else {
      lanes[lane] = bar.to;
    }
    return { ...bar, lane };
  });
}

/**
 * Where a task's dates go when it's dragged from one day to another: both
 * move by the same number of days, so a range keeps its length and a due
 * time keeps its time of day. A task without dates, dropped on a day, gets
 * that day as its due date.
 */
export function moveSchedule(
  task: Scheduled & { dueHasTime?: boolean },
  fromDay: string | null,
  toDay: string,
): { startDate: string | null; dueDate: Date | null; dueHasTime: boolean } {
  const delta = fromDay ? Math.round((parseDay(toDay).getTime() - parseDay(fromDay).getTime()) / 86_400_000) : 0;
  const shift = (day: string) => {
    const d = parseDay(day);
    d.setDate(d.getDate() + delta);
    return dayKey(d);
  };
  if (!task.dueDate && !task.startDate) return { startDate: null, dueDate: parseDay(toDay), dueHasTime: false };

  let dueDate: Date | null = null;
  if (task.dueDate) {
    const due = new Date(task.dueDate);
    dueDate = new Date(due);
    // Calendar days, not 24-hour steps: the time of day stays put across DST.
    dueDate.setDate(due.getDate() + delta);
  }
  return {
    startDate: task.startDate ? shift(task.startDate) : null,
    dueDate,
    dueHasTime: Boolean(task.dueDate && task.dueHasTime),
  };
}
