import { describe, it, expect } from 'vitest';
import { formatDeadline, isPastDeadline } from '@/features/projects/details';

describe('isPastDeadline', () => {
  const now = new Date(2026, 10, 25, 10); // 25 Nov, 10:00 local
  it('is not past on the deadline day itself', () => {
    expect(isPastDeadline('2026-11-25', 'on_track', now)).toBe(false);
  });
  it('is past from the next day', () => {
    expect(isPastDeadline('2026-11-24', 'at_risk', now)).toBe(true);
    expect(isPastDeadline('2026-11-24', null, now)).toBe(true);
  });
  it('is never past when done or unset', () => {
    expect(isPastDeadline('2026-01-01', 'done', now)).toBe(false);
    expect(isPastDeadline(null, 'at_risk', now)).toBe(false);
  });
});

describe('formatDeadline', () => {
  const now = new Date(2026, 10, 25);
  it('drops the year when it is this year', () => {
    expect(formatDeadline('2026-12-01', now)).toBe('Dec 1');
    expect(formatDeadline('2027-01-15', now)).toBe('Jan 15, 2027');
  });
});
