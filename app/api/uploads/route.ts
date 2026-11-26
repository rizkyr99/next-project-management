import { z } from 'zod';
import { db } from '@/db/drizzle';
import { attachment } from '@/db/schema';
import { requireTaskAccess, toErrorResponse } from '@/lib/authz';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { directUploadsAvailable, saveFile, storageAvailable } from '@/lib/storage';
import {
  cleanFileName,
  fileProblem,
  fileUrl,
  MAX_UPLOAD_BYTES,
  SERVER_UPLOAD_MAX_BYTES,
  sniffImageType,
} from '@/lib/uploads';
import { recordTaskFile, storageProblem } from '@/features/attachments/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

const fields = z.object({ taskId: z.uuid(), kind: z.enum(['image', 'file']).default('image') });

/**
 * Upload to a task: an image pasted or dropped into a description or
 * comment (returns the app URL to embed), or with `kind=file`, a file for
 * the task's Files list (B3). Large files skip this route when storage takes
 * direct uploads (features/attachments/actions.ts). The storage location
 * stays private either way.
 */
export async function POST(request: Request) {
  if (!storageAvailable()) {
    return Response.json({ error: 'Image uploads aren’t set up yet.' }, { status: 503 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Not a multipart/form-data body at all.
    return Response.json({ error: 'Send the image as form data.' }, { status: 400 });
  }
  try {
    const { taskId, kind } = fields.parse({ taskId: form.get('taskId'), kind: form.get('kind') ?? undefined });
    // Guests may paste screenshots into comments on shared projects.
    const ctx = await requireTaskAccess(taskId, { allowGuests: true });
    await enforceRateLimit('uploads', ctx.session.user.id);

    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'No file was sent.' }, { status: 400 });

    if (kind === 'file') {
      const name = cleanFileName(file.name);
      const problem =
        fileProblem(name, file.size) ??
        (directUploadsAvailable() && file.size > SERVER_UPLOAD_MAX_BYTES ? 'Files over 4 MB are uploaded another way. Reload the page and try again.' : null) ??
        (await storageProblem(ctx.workspace.id, file.size));
      if (problem) return Response.json({ error: problem }, { status: 400 });
      const id = crypto.randomUUID();
      const key = `attachments/${ctx.project.id}/${id}`;
      await saveFile(key, await file.arrayBuffer(), 'application/octet-stream');
      await recordTaskFile(ctx, { id, key, name, size: file.size });
      revalidatePath(`/workspaces/${ctx.workspace.slug}/projects/${ctx.project.id}`);
      return Response.json({ id, name });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: 'Images can be up to 5 MB.' }, { status: 413 });
    }
    const body = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(body.slice(0, 16)));
    if (!type) {
      return Response.json({ error: 'Only PNG, JPEG, GIF and WebP images can be added.' }, { status: 415 });
    }

    const full = await storageProblem(ctx.workspace.id, file.size);
    if (full) return Response.json({ error: full }, { status: 413 });

    const id = crypto.randomUUID();
    const key = `attachments/${ctx.project.id}/${id}`;
    await saveFile(key, body, type);
    await db.insert(attachment).values({
      id,
      projectId: ctx.project.id,
      taskId,
      uploadedById: ctx.session.user.id,
      storageKey: key,
      name: (file.name || 'image').slice(0, 255),
      contentType: type,
      size: file.size,
    });

    return Response.json({ id, url: fileUrl(id), name: file.name });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    return toErrorResponse(error);
  }
}
