import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

// The production Neon branch. E2E writes test data, so it must never run there.
const PRODUCTION_BRANCH_ID = 'br-small-wildflower-a14679rq';

let checked = false;

/** A SQL client for E2E assertions, guarded against ever pointing at production. */
export async function testDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set for E2E');
  const sql = neon(url);
  if (!checked) {
    const [row] = await sql`select current_setting('neon.branch_id', true) as branch`;
    const branch: unknown = row?.branch;
    // Fail closed: an unidentifiable database is treated like production.
    if (typeof branch !== 'string' || branch === '') {
      throw new Error('Refusing to run E2E: cannot identify the Neon branch behind DATABASE_URL.');
    }
    if (branch === PRODUCTION_BRANCH_ID) {
      throw new Error('Refusing to run E2E against the production database. Point .env at a dev branch.');
    }
    checked = true;
  }
  return sql;
}
