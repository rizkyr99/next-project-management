import { and, eq, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { attachment, comment, task } from '@/db/schema';
import { AuthzError, requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { readFileStream } from '@/lib/storage';
import { IMAGE_TYPES } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** Whether the file is referenced by the task's description or a client-visible comment. */
async function sharedInTask(taskId: string, fileId: string) {
  // fileId is a validated UUID, so it has no LIKE wildcards.
  const ref = `%/api/files/${fileId}%`;
  const [row] = await db
    .select({ id: task.id })
    .from(task)
    .where(
      and(
        eq(task.id, taskId),
        or(
          like(task.description, ref),
          sql`exists (${db
            .select({ one: sql`1` })
            .from(comment)
            .where(and(eq(comment.taskId, taskId), eq(comment.clientVisible, true), like(comment.body, ref)))})`,
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Serve an uploaded file to someone who can see its project. Anyone else,
 * signed in or not, gets the same 404 as for a file that doesn't exist.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const [file] = await db
      .select({
        projectId: attachment.projectId,
        taskId: attachment.taskId,
        uploadedById: attachment.uploadedById,
        storageKey: attachment.storageKey,
        name: attachment.name,
        contentType: attachment.contentType,
        listed: attachment.listed,
        clientVisible: attachment.clientVisible,
        taskInternal: task.internal,
      })
      .from(attachment)
      .innerJoin(task, eq(task.id, attachment.taskId))
      .where(eq(attachment.id, id))
      .limit(1);
    if (!file) throw new AuthzError();
    const access = await requireProjectAccess(file.projectId, { allowGuests: true });
    // C2: nothing on an internal task reaches a client, their own uploads included.
    if (access.role === 'guest' && file.taskInternal) throw new AuthzError();
    // A client sees only what was shared with them: files shared from the
    // Files list, images in the task's description or client-visible
    // comments, and their own uploads. Anything internal stays internal.
    if (access.role === 'guest' && file.uploadedById !== access.session.user.id) {
      const sharedFile = file.listed && file.clientVisible;
      if (!sharedFile && !(await sharedInTask(file.taskId, id))) throw new AuthzError();
    }

    const stream = await readFileStream(file.storageKey);
    if (!stream) throw new AuthzError();

    // Only images whose bytes were checked open in the browser. Everything
    // else (PDFs, SVGs, documents…) downloads, typed as plain bytes, so a
    // file can't run anything on this origin. ?download forces a download.
    const inline =
      (IMAGE_TYPES as readonly string[]).includes(file.contentType) && !new URL(request.url).searchParams.has('download');
    return new Response(stream, {
      headers: {
        'Content-Type': inline ? file.contentType : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
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
