import { describe, it, expect } from 'vitest';
import { addDays, layoutWeek, monthWeeks, moveSchedule, taskSpan, weekLabel, weekOf } from '@/features/calendar/layout';
import { dayKey } from '@/features/tasks/due';

// Local times, like the browser that runs this.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('taskSpan', () => {
  it('covers start to due, one day when there is only one, nothing without dates', () => {
    expect(taskSpan({ id: 'a', startDate: '2026-12-01', dueDate: at(2026, 12, 4) })).toEqual({ start: '2026-12-01', end: '2026-12-04' });
    expect(taskSpan({ id: 'b', dueDate: at(2026, 12, 4, 15) })).toEqual({ start: '2026-12-04', end: '2026-12-04' });
    expect(taskSpan({ id: 'c', startDate: '2026-12-01' })).toEqual({ start: '2026-12-01', end: '2026-12-01' });
    expect(taskSpan({ id: 'd' })).toBeNull();
    // A start after the due day (older data) collapses to the due day.
    expect(taskSpan({ id: 'e', startDate: '2026-12-09', dueDate: at(2026, 12, 4) })).toEqual({ start: '2026-12-04', end: '2026-12-04' });
  });
});

describe('monthWeeks', () => {
  it('gives whole Monday-to-Sunday weeks covering the month', () => {
    // December 2026 starts on a Tuesday and ends on a Thursday.
    const weeks = monthWeeks(2026, 11);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe('2026-11-30');
    expect(weeks[0][1]).toBe('2026-12-01');
    expect(weeks.at(-1)!.at(-1)).toBe('2027-01-03');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('starts on the 1st when the month starts on a Monday', () => {
    expect(monthWeeks(2027, 1)[0][0]).toBe('2027-02-01'); // 1 Feb 2027 is a Monday
  });
});

describe('layoutWeek', () => {
  const week = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13'];

  it('places bars by column, longest first, in the first lane they fit', () => {
    const bars = layoutWeek(week, [
      { id: 'short', dueDate: at(2026, 12, 8) },
      { id: 'long', startDate: '2026-12-07', dueDate: at(2026, 12, 10) },
      { id: 'later', dueDate: at(2026, 12, 12) },
      { id: 'elsewhere', dueDate: at(2026, 12, 20) },
    ]);
    expect(bars.map((b) => [b.task.id, b.from, b.to, b.lane])).toEqual([
      ['long', 0, 3, 0],
      ['short', 1, 1, 1],
      ['later', 5, 5, 0],
    ]);
  });

  it('marks bars that run in from last week or on into next', () => {
    const [bar] = layoutWeek(week, [{ id: 'x', startDate: '2026-12-03', dueDate: at(2026, 12, 15) }]);
    expect(bar).toMatchObject({ from: 0, to: 6, continuesBefore: true, continuesAfter: true });
  });
});

describe('moveSchedule', () => {
  it('moves a range by whole days, keeping its length and the due time', () => {
    const moved = moveSchedule(
      { id: 't', startDate: '2026-12-01', dueDate: at(2026, 12, 4, 15, 30), dueHasTime: true },
      '2026-12-04',
      '2026-12-11',
    );
    expect(moved.startDate).toBe('2026-12-08');
    expect(moved.dueDate).toEqual(at(2026, 12, 11, 15, 30));
    expect(moved.dueHasTime).toBe(true);
  });

  it('moves a start-only task, and schedules an undated one on the day it’s dropped', () => {
    expect(moveSchedule({ id: 's', startDate: '2026-12-01' }, '2026-12-01', '2026-12-03')).toEqual({
      startDate: '2026-12-03',
      dueDate: null,
      dueHasTime: false,
    });
    const fresh = moveSchedule({ id: 'n' }, null, '2026-12-09');
    expect(fresh.startDate).toBeNull();
    expect(dayKey(fresh.dueDate!)).toBe('2026-12-09');
    expect(fresh.dueHasTime).toBe(false);
  });
});

describe('week view (B4)', () => {
  it('finds the Monday-to-Sunday week a day falls in, across months and years', () => {
    expect(weekOf('2026-11-27')).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ]);
    expect(weekOf('2026-11-23')[0]).toBe('2026-11-23'); // a Monday is its own week's start
    expect(weekOf('2026-11-29')[0]).toBe('2026-11-23'); // a Sunday ends it
    expect(weekOf('2027-01-01')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('steps by days across a DST change', () => {
    expect(addDays('2026-03-07', 7)).toBe('2026-03-14');
    expect(addDays('2026-11-02', -7)).toBe('2026-10-26');
  });

  it('labels a week compactly', () => {
    expect(weekLabel(weekOf('2026-11-25'))).toBe('Nov 23 – 29, 2026');
    expect(weekLabel(weekOf('2026-12-02'))).toBe('Nov 30 – Dec 6, 2026');
    expect(weekLabel(weekOf('2027-01-01'))).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});
