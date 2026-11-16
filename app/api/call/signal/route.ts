import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { callParticipant, webrtcSignal } from '@/db/schema';
import { signalSchema } from '@/features/call/schema';
import { AuthzError, requireProjectAccess, toErrorResponse } from '@/lib/authz';

export async function POST(request: Request) {
  try {
    const input = signalSchema.parse(await request.json());
    const { session, project } = await requireProjectAccess(input.projectId);
    const fromUserId = session.user.id;

    // Both ends must currently be in this project's call. Otherwise anyone
    // could push signaling messages at arbitrary users.
    const participants = await db
      .select({ userId: callParticipant.userId })
      .from(callParticipant)
      .where(
        and(
          eq(callParticipant.projectId, project.id),
          inArray(callParticipant.userId, [fromUserId, input.toUserId]),
        ),
      );
    const present = new Set(participants.map((p) => p.userId));
    if (!present.has(fromUserId) || !present.has(input.toUserId)) {
      throw new AuthzError();
    }

    await db.insert(webrtcSignal).values({
      projectId: project.id,
      fromUserId,
      toUserId: input.toUserId,
      type: input.type,
      payload: input.payload,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
