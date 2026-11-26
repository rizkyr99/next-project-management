import { describe, expect, it } from 'vitest';
import { addDays, dayInZone, daysBetween, safeTimeZone, timeInZone, zonedInstant } from '@/features/templates/dates';

describe('template dates', () => {
  it('counts and adds calendar days across months and leap years', () => {
    expect(daysBetween('2026-01-30', '2026-03-01')).toBe(30);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('finds the day and time an instant shows in a zone', () => {
    const instant = new Date('2026-11-26T20:30:00Z');
    expect(dayInZone(instant, 'Asia/Jakarta')).toBe('2026-11-27');
    expect(dayInZone(instant, 'America/New_York')).toBe('2026-11-26');
    expect(timeInZone(instant, 'Asia/Jakarta')).toBe('03:30');
  });

  it('turns a day back into local midnight, or a wall-clock time', () => {
    expect(zonedInstant('2026-11-27', 'Asia/Jakarta').toISOString()).toBe('2026-11-26T17:00:00.000Z');
    expect(zonedInstant('2026-11-27', 'UTC', '09:15').toISOString()).toBe('2026-11-27T09:15:00.000Z');
  });

  it('lands on the right wall-clock time on daylight-saving days', () => {
    // US clocks go forward on 2026-03-08 and back on 2026-11-01.
    expect(zonedInstant('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(zonedInstant('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(zonedInstant('2026-11-01', 'America/New_York', '12:00').toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(dayInZone(zonedInstant('2026-03-08', 'America/New_York'), 'America/New_York')).toBe('2026-03-08');
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone('Europe/Paris')).toBe('Europe/Paris');
  });
});
