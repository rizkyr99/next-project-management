import { db } from '@/db/drizzle';
import { task } from '@/db/schema';
import { and, count, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let projectId: string;
  try {
    const { searchParams } = new URL(request.url);
    const requested = z.uuid().parse(searchParams.get('projectId'));
    projectId = (await requireProjectAccess(requested)).project.id;
  } catch (error) {
    return toErrorResponse(error);
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
