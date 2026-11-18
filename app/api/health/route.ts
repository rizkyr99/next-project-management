import { sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';

export const dynamic = 'force-dynamic';

/**
 * For uptime monitors: 200 when the app can reach its database, 503 when it
 * can't. Public and cheap (one `select 1`); it reveals only the deployed
 * commit, which is already public in the source maps' release.
 */
export async function GET() {
  const started = performance.now();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: 'ok', database: 'ok', latencyMs: Math.round(performance.now() - started), commit },
      { headers },
    );
  } catch (error) {
    console.error('[health] database check failed:', error);
    return Response.json({ status: 'error', database: 'unreachable', commit }, { status: 503, headers });
  }
}
