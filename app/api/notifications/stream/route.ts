import { db } from '@/db/drizzle';
import { notification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, desc, eq, gt } from 'drizzle-orm';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;

  const initial = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(20);

  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      let lastCheckedAt = new Date();

      controller.enqueue(': keepalive\n\n');

      if (initial.length > 0) {
        const payload = JSON.stringify({
          type: 'notifications',
          data: initial.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        });
        controller.enqueue(`data: ${payload}\n\n`);
      }

      intervalId = setInterval(async () => {
        try {
          const now = new Date();

          const rows = await db
            .select()
            .from(notification)
            .where(
              and(
                eq(notification.userId, userId),
                gt(notification.createdAt, lastCheckedAt),
              ),
            )
            .orderBy(notification.createdAt);

          lastCheckedAt = now;

          if (rows.length > 0) {
            const payload = JSON.stringify({
              type: 'notifications',
              data: rows.map((r) => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
              })),
            });
            controller.enqueue(`data: ${payload}\n\n`);
          }
        } catch (err) {
          console.error('[SSE] poll error:', err);
        }
      }, 10_000);
    },

    cancel() {
      clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
