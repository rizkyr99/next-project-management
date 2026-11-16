import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from '@/lib/db-errors';

describe('isUniqueViolation', () => {
  it('detects a top-level SQLSTATE 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects a violation wrapped by Drizzle', () => {
    const wrapped = new Error('Failed query', { cause: { code: '23505' } });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
