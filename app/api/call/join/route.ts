import { and, eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { callParticipant } from '@/db/schema';
import { callRoomSchema } from '@/features/call/schema';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';

export async function POST(request: Request) {
  try {
    const { projectId } = callRoomSchema.parse(await request.json());
    const { session, project } = await requireProjectAccess(projectId);
    const userId = session.user.id;

    const [existing] = await db
      .select({ id: callParticipant.id })
      .from(callParticipant)
      .where(and(eq(callParticipant.projectId, project.id), eq(callParticipant.userId, userId)))
      .limit(1);

    if (existing) {
      await db
        .update(callParticipant)
        .set({ lastSeen: new Date() })
        .where(eq(callParticipant.id, existing.id));
    } else {
      await db.insert(callParticipant).values({ projectId: project.id, userId });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
