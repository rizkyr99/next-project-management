/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * True when `error` (or any error in its `cause` chain) is a Postgres unique
 * constraint violation. Drizzle wraps driver errors in `DrizzleQueryError`, so
 * the SQLSTATE code may sit one or more levels down.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'object' && 'code' in current && current.code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
