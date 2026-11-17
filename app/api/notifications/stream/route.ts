import { db } from '@/db/drizzle';
import { notification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { pollingStream } from '@/lib/sse';
import { and, desc, eq, gt } from 'drizzle-orm';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
// Must be a literal (Next reads it statically); see lib/sse.ts.
export const maxDuration = 300;

type Row = typeof notification.$inferSelect;
const toPayload = (rows: Row[]) => ({
  type: 'notifications',
  data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
});

/**
 * New notifications for the signed-in user. Each connection starts with the
 * latest 20 (the client merges by id, so a reconnect repeats nothing), then
 * polls for newer ones.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;
  let lastCheckedAt = new Date();

  return pollingStream({
    intervalMs: 10_000,
    label: 'notifications',
    onOpen: async (send) => {
      const initial = await db
        .select()
        .from(notification)
        .where(eq(notification.userId, userId))
        .orderBy(desc(notification.createdAt))
        .limit(20);
      if (initial.length > 0) send.event(toPayload(initial));
    },
    onTick: async (send) => {
      const now = new Date();
      const rows = await db
        .select()
        .from(notification)
        .where(and(eq(notification.userId, userId), gt(notification.createdAt, lastCheckedAt)))
        .orderBy(notification.createdAt);
      lastCheckedAt = now;
      if (rows.length > 0) send.event(toPayload(rows));
    },
  });
}
