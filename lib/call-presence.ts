import 'server-only';
import { sql } from 'drizzle-orm';
import { CALL_STALE_SECONDS } from '@/features/call/schema';

/**
 * Call presence uses the database clock throughout (`now()`), so a clock
 * difference between the server and Neon can't drop people or signals.
 */
export const staleBefore = sql.raw(`now() - interval '${CALL_STALE_SECONDS} seconds'`);
