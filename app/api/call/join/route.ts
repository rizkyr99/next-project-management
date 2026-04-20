import { db } from '@/db/drizzle';
import { callParticipant } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { projectId } = await request.json();
  if (!projectId) return new Response('projectId required', { status: 400 });

  const existing = await db
    .select({ id: callParticipant.id })
    .from(callParticipant)
    .where(and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, session.user.id)));

  if (existing.length > 0) {
    await db
      .update(callParticipant)
      .set({ lastSeen: new Date() })
      .where(eq(callParticipant.id, existing[0].id));
  } else {
    await db.insert(callParticipant).values({
      projectId,
      userId: session.user.id,
    });
  }

  return Response.json({ ok: true });
}
