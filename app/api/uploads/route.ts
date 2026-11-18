import { z } from 'zod';
import { db } from '@/db/drizzle';
import { attachment } from '@/db/schema';
import { requireTaskAccess, toErrorResponse } from '@/lib/authz';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { saveFile, storageAvailable } from '@/lib/storage';
import { fileUrl, MAX_UPLOAD_BYTES, sniffImageType } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const fields = z.object({ taskId: z.uuid() });

/**
 * Upload an image to a task (pasted or dropped into a description or
 * comment). Returns the app URL to embed; the storage location stays private.
 */
export async function POST(request: Request) {
  if (!storageAvailable()) {
    return Response.json({ error: 'Image uploads aren’t set up yet.' }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const { taskId } = fields.parse({ taskId: form.get('taskId') });
    const ctx = await requireTaskAccess(taskId);
    await enforceRateLimit('uploads', ctx.session.user.id);

    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'No file was sent.' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: 'Images can be up to 5 MB.' }, { status: 413 });
    }
    const body = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(body.slice(0, 16)));
    if (!type) {
      return Response.json({ error: 'Only PNG, JPEG, GIF and WebP images can be added.' }, { status: 415 });
    }

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
