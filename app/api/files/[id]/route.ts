import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { attachment } from '@/db/schema';
import { AuthzError, requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { readFileStream } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Serve an uploaded file to someone who can see its project. Anyone else,
 * signed in or not, gets the same 404 as for a file that doesn't exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const [file] = await db
      .select({
        projectId: attachment.projectId,
        storageKey: attachment.storageKey,
        name: attachment.name,
        contentType: attachment.contentType,
      })
      .from(attachment)
      .where(eq(attachment.id, id))
      .limit(1);
    if (!file) throw new AuthzError();
    await requireProjectAccess(file.projectId);

    const stream = await readFileStream(file.storageKey);
    if (!stream) throw new AuthzError();

    return new Response(stream, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        // Files never change once uploaded; keep them in this browser only.
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        // Opened on its own, the file can't run anything.
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return new Response('Not found', { status: 404 });
    return toErrorResponse(error);
  }
}
