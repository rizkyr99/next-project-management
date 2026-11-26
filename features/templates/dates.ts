/**
 * Calendar-day arithmetic for templates. Day-only due dates are stored as
 * local midnight in the browser that set them (features/tasks/due.ts), so
 * the server needs the creator's time zone to turn "5 days after the
 * start" back into an instant, and to turn a due date into a day offset.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A valid IANA zone name, or UTC. Never throws on what a browser sends. */
export function safeTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in `timeZone`. */
export function dayInZone(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Minutes after midnight ("HH:MM") an instant shows in `timeZone`. */
export function timeInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

function parseDay(day: string): [number, number, number] {
  const m = ISO_DAY.exec(day);
  if (!m) throw new Error(`Not a calendar day: ${day}`);
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parseDay(from);
  const [y2, m2, d2] = parseDay(to);
  return Math.round((Date.UTC(y2, m2, d2) - Date.UTC(y1, m1, d1)) / DAY_MS);
}

/** `day` plus `n` calendar days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - (instant - (instant % 1000));
}

/**
 * The instant a wall-clock time ("HH:MM", default midnight) on `day` happens
 * in `timeZone`. Re-checks the offset once so days that start or end a
 * daylight-saving change still land on the right wall-clock time.
 */
export function zonedInstant(day: string, timeZone: string, time = '00:00'): Date {
  const [y, m, d] = parseDay(day);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m, d, hh || 0, mm || 0);
  let guess = wall - zoneOffset(wall, timeZone);
  const second = wall - zoneOffset(guess, timeZone);
  if (second !== guess) guess = second;
  return new Date(guess);
}
