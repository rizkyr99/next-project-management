import { db } from '@/db/drizzle';
import { callParticipant, webrtcSignal } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { projectId } = await request.json();
  if (!projectId) return new Response('projectId required', { status: 400 });

  await Promise.all([
    db
      .delete(callParticipant)
      .where(
        and(eq(callParticipant.projectId, projectId), eq(callParticipant.userId, session.user.id)),
      ),
    db
      .delete(webrtcSignal)
      .where(
        and(eq(webrtcSignal.projectId, projectId), eq(webrtcSignal.fromUserId, session.user.id)),
      ),
  ]);

  return Response.json({ ok: true });
}
