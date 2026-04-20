import { db } from '@/db/drizzle';
import { task } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, count, eq, max } from 'drizzle-orm';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return new Response('projectId required', { status: 400 });
  }

  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      let lastSnapshot = '';

      const getSnapshot = async () => {
        const [row] = await db
          .select({ total: count(), latest: max(task.createdAt) })
          .from(task)
          .where(and(eq(task.projectId, projectId)));
        return `${row?.total ?? 0}:${row?.latest?.toISOString() ?? ''}`;
      };

      getSnapshot().then((snap) => {
        lastSnapshot = snap;
        controller.enqueue(': keepalive\n\n');
      });

      intervalId = setInterval(async () => {
        try {
          controller.enqueue(': keepalive\n\n');

          const snap = await getSnapshot();
          if (snap !== lastSnapshot) {
            lastSnapshot = snap;
            const payload = JSON.stringify({ type: 'tasks_changed', projectId });
            controller.enqueue(`data: ${payload}\n\n`);
          }
        } catch (err) {
          console.error('[SSE tasks] poll error:', err);
        }
      }, 5_000);
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
