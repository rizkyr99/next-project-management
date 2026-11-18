import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { callParticipant, member, project, user, webrtcSignal } from '@/db/schema';
import { callRoomSchema } from '@/features/call/schema';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { staleBefore } from '@/lib/call-presence';
import { pollingStream } from '@/lib/sse';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Two modes:
 * - Watching (anyone on the project page): who is in the call, every 5 s.
 * - In the call (`inCall=1`): also a heartbeat and signaling, every 1.5 s.
 *
 * The stream never adds anyone to the call; only /api/call/join does, and
 * that is where the size limit is enforced. So viewing a project doesn't put
 * you in its call, and leaving sticks.
 */
export async function GET(request: Request) {
  let projectId: string;
  let userId: string;
  let inCall: boolean;
  try {
    const { searchParams } = new URL(request.url);
    const input = callRoomSchema.parse({ projectId: searchParams.get('projectId') });
    const ctx = await requireProjectAccess(input.projectId);
    projectId = ctx.project.id;
    userId = ctx.session.user.id;
    inCall = searchParams.get('inCall') === '1';
  } catch (error) {
    return toErrorResponse(error);
  }

  const intervalMs = inCall ? 1_500 : 5_000;
  const recheckEvery = Math.round(30_000 / intervalMs);
  let ticks = 0;
  let lastParticipants = '';

  const stillMember = async () => {
    const [row] = await db
      .select({ id: member.id })
      .from(project)
      .innerJoin(member, and(eq(member.workspaceId, project.workspaceId), eq(member.userId, userId)))
      .where(eq(project.id, projectId))
      .limit(1);
    return Boolean(row);
  };

  return pollingStream({
    intervalMs,
    label: 'call',
    onOpen: async (send) => sendParticipants(send, true),
    onTick: async (send) => {
      // Access is checked when the stream opens. Re-check about every 30 s,
      // so someone removed from the workspace drops out of the call.
      if (++ticks % recheckEvery === 0 && !(await stillMember())) {
        await db
          .delete(callParticipant)
          .where(and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, userId)));
        send.event({ type: 'removed' });
        return;
      }

      if (inCall) {
        // Heartbeat. Never re-creates the row: if it's gone (left from another
        // tab, or timed out), the client sees itself missing and rejoins.
        await db
          .update(callParticipant)
          .set({ lastSeen: sql`now()` })
          .where(and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, userId)));

        // Taken off the queue as they're delivered, so each arrives once.
        const signals = await db
          .delete(webrtcSignal)
          .where(and(eq(webrtcSignal.projectId, projectId), eq(webrtcSignal.toUserId, userId)))
          .returning();
        signals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const sig of signals) {
          send.event({
            type: 'signal',
            data: { fromUserId: sig.fromUserId, signalType: sig.type, payload: sig.payload },
          });
        }

        await db.delete(callParticipant).where(
          and(eq(callParticipant.projectId, projectId), lt(callParticipant.lastSeen, staleBefore)),
        );
        await db.delete(webrtcSignal).where(lt(webrtcSignal.createdAt, sql`now() - interval '30 seconds'`));
      }

      await sendParticipants(send, false);
    },
  });

  async function sendParticipants(send: { event: (data: unknown) => void }, always: boolean) {
    const participants = await db
      .select({ userId: callParticipant.userId, name: user.name, image: user.image })
      .from(callParticipant)
      .innerJoin(user, eq(callParticipant.userId, user.id))
      .where(and(eq(callParticipant.projectId, projectId), gte(callParticipant.lastSeen, staleBefore)))
      .orderBy(asc(callParticipant.joinedAt));
    const json = JSON.stringify(participants);
    if (!always && json === lastParticipants) return;
    lastParticipants = json;
    send.event({ type: 'participants', data: participants });
  }
}
