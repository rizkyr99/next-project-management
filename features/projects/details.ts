/**
 * Project details shown to the studio: who it's for, when it's due, and how
 * it's going. The one place that defines the statuses (the database enum in
 * db/schema.ts reads from here).
 */
export const PROJECT_STATUSES = ['on_track', 'at_risk', 'off_track', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectStatusConfig: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
  on_track: { label: 'On track', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  at_risk: { label: 'At risk', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  off_track: { label: 'Off track', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  done: { label: 'Done', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-400' },
};

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** A deadline is a calendar day ("2026-12-01"), not a moment. */
export function parseDeadline(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Past once the deadline day is over (in the viewer's time zone), unless the project is done. */
export function isPastDeadline(day: string | null, status: ProjectStatus | null, now = new Date()): boolean {
  if (!day || status === 'done') return false;
  const end = parseDeadline(day);
  end.setDate(end.getDate() + 1);
  return now >= end;
}

export function formatDeadline(day: string, now = new Date()): string {
  const date = parseDeadline(day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}
