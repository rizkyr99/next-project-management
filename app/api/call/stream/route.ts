import { db } from '@/db/drizzle';
import { callParticipant, user, webrtcSignal } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq, gt, lt } from 'drizzle-orm';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return new Response('projectId required', { status: 400 });

  const userId = session.user.id;
  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      let lastSignalCheck = new Date();

      controller.enqueue(': keepalive\n\n');

      const tick = async () => {
        try {
          const now = new Date();

          // Heartbeat: update lastSeen so we know the user is still in the call
          await db
            .update(callParticipant)
            .set({ lastSeen: now })
            .where(and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, userId)));

          // Clean up stale participants (no heartbeat for > 8 seconds)
          const staleThreshold = new Date(now.getTime() - 8_000);
          await db
            .delete(callParticipant)
            .where(
              and(
                eq(callParticipant.projectId, projectId),
                lt(callParticipant.lastSeen, staleThreshold),
              ),
            );

          // Send current participants list
          const participants = await db
            .select({ userId: callParticipant.userId, name: user.name, image: user.image })
            .from(callParticipant)
            .innerJoin(user, eq(callParticipant.userId, user.id))
            .where(eq(callParticipant.projectId, projectId));

          const participantsPayload = JSON.stringify({ type: 'participants', data: participants });
          controller.enqueue(`data: ${participantsPayload}\n\n`);

          // Deliver signals addressed to this user
          const signals = await db
            .select()
            .from(webrtcSignal)
            .where(
              and(
                eq(webrtcSignal.projectId, projectId),
                eq(webrtcSignal.toUserId, userId),
                gt(webrtcSignal.createdAt, lastSignalCheck),
              ),
            );

          lastSignalCheck = now;

          for (const sig of signals) {
            const sigPayload = JSON.stringify({
              type: 'signal',
              data: { fromUserId: sig.fromUserId, signalType: sig.type, payload: sig.payload },
            });
            controller.enqueue(`data: ${sigPayload}\n\n`);
          }

          // Clean up old signals (older than 30s)
          const signalExpiry = new Date(now.getTime() - 30_000);
          await db.delete(webrtcSignal).where(lt(webrtcSignal.createdAt, signalExpiry));
        } catch (err) {
          console.error('[SSE call] tick error:', err);
        }
      };

      tick();
      intervalId = setInterval(tick, 2_000);
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
