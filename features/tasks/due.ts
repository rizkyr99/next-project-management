/**
 * Due dates. A task is due either on a day (`hasTime` false: the stored
 * instant is just the day) or at a time on that day. One set of rules for
 * every place a due date is shown or judged.
 */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Overdue: past the time, if there is one; otherwise from the next day on.
 * (A task due today isn't overdue during today.)
 */
export function isOverdue(due: Date | string | null | undefined, hasTime = false, now = new Date()): boolean {
  if (!due) return false;
  const d = new Date(due);
  return hasTime ? d < now : d < startOfDay(now);
}

/** "Nov 18", "Nov 18, 3:00 PM", or with the year when it isn't this year. */
export function formatDue(due: Date | string, hasTime = false, now = new Date()): string {
  const d = new Date(due);
  const day = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  if (!hasTime) return day;
  return `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** The "HH:MM" an <input type=time> shows for a date. */
export function timeInputValue(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `day` at the time in an <input type=time> value ("HH:MM"), local time. */
export function withTime(day: Date, time: string) {
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}
