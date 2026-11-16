import { and, eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { callParticipant, webrtcSignal } from '@/db/schema';
import { callRoomSchema } from '@/features/call/schema';
import { requireSession, toErrorResponse } from '@/lib/authz';

// Leaving only ever deletes the caller's own rows, so it needs a session but
// not project access. That way a user removed from a workspace mid-call can
// still clean up after themselves.
export async function POST(request: Request) {
  try {
    const { projectId } = callRoomSchema.parse(await request.json());
    const session = await requireSession();
    const userId = session.user.id;

    await Promise.all([
      db
        .delete(callParticipant)
        .where(and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, userId))),
      db
        .delete(webrtcSignal)
        .where(and(eq(webrtcSignal.projectId, projectId), eq(webrtcSignal.fromUserId, userId))),
    ]);

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
