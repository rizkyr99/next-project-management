import { describe, it, expect } from 'vitest';
import { formatDue, isOverdue, timeInputValue, withTime } from '@/features/tasks/due';

const now = new Date(2026, 10, 18, 15, 0); // Wed 18 Nov 2026, 15:00 local

describe('isOverdue', () => {
  it('a day-only task is overdue from the next day, not during its day', () => {
    expect(isOverdue(new Date(2026, 10, 18), false, now)).toBe(false);
    expect(isOverdue(new Date(2026, 10, 17), false, now)).toBe(true);
  });
  it('a timed task is overdue once the time passes', () => {
    expect(isOverdue(new Date(2026, 10, 18, 14, 59), true, now)).toBe(true);
    expect(isOverdue(new Date(2026, 10, 18, 15, 1), true, now)).toBe(false);
  });
  it('no date is never overdue', () => {
    expect(isOverdue(null, false, now)).toBe(false);
  });
});

describe('formatDue', () => {
  it('shows the time only when there is one, and the year only when it differs', () => {
    expect(formatDue(new Date(2026, 10, 18, 15, 0), false, now)).toBe('Nov 18');
    expect(formatDue(new Date(2026, 10, 18, 15, 0), true, now)).toBe('Nov 18, 3:00 PM');
    expect(formatDue(new Date(2027, 0, 5), false, now)).toBe('Jan 5, 2027');
  });
});

describe('time input helpers', () => {
  it('round-trips a time of day in local time', () => {
    const at = withTime(new Date(2026, 10, 18), '09:30');
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(30);
    expect(timeInputValue(at)).toBe('09:30');
  });
});
