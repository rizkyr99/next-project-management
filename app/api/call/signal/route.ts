import { db } from '@/db/drizzle';
import { webrtcSignal } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { projectId, toUserId, type, payload } = await request.json();
  if (!projectId || !toUserId || !type || !payload) {
    return new Response('Missing fields', { status: 400 });
  }

  await db.insert(webrtcSignal).values({
    projectId,
    fromUserId: session.user.id,
    toUserId,
    type,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

  return Response.json({ ok: true });
}
