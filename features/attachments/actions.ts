'use server';

import { db } from '@/db/drizzle';
import { attachment, member, project, task, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { AuthzError, requireSession, requireTaskAccess, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { deleteFile, directUploadToken, directUploadsAvailable, storedSize } from '@/lib/storage';
import { cleanFileName, fileProblem } from '@/lib/uploads';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordTaskFile, storageProblem } from './server';

const projectPath = (slug: string, projectId: string) => `/workspaces/${slug}/projects/${projectId}`;
const keyFor = (projectId: string, id: string) => `attachments/${projectId}/${id}`;

const startSchema = z.object({
  taskId: z.uuid(),
  name: z.string().min(1).max(1000),
  size: z.number().int().positive(),
});

/**
 * Step 1 of a large upload (B3): checks the file and the workspace's
 * storage, then hands the browser a one-off token to upload it straight to
 * private storage. `mode: 'server'` means storage can't take direct
 * uploads (local development, CI): send the file to /api/uploads instead.
 */
export async function startFileUpload(
  input: z.input<typeof startSchema>,
): Promise<ActionResult<{ mode: 'direct'; id: string; key: string; token: string } | { mode: 'server' }>> {
  try {
    const { taskId, name, size } = startSchema.parse(input);
    // Clients may attach files to tasks in projects shared with them.
    const ctx = await requireTaskAccess(taskId, { allowGuests: true });
    await enforceRateLimit('uploads', ctx.session.user.id);
    const problem = fileProblem(cleanFileName(name), size) ?? (await storageProblem(ctx.workspace.id, size));
    if (problem) return { error: problem };
    if (!directUploadsAvailable()) return { mode: 'server' };

    const id = crypto.randomUUID();
    const key = keyFor(ctx.project.id, id);
    return { mode: 'direct', id, key, token: await directUploadToken(key, size) };
  } catch (error) {
    return toActionError(error, 'Could not start the upload.');
  }
}

const finishSchema = z.object({ taskId: z.uuid(), id: z.uuid(), name: z.string().min(1).max(1000) });

/**
 * Step 2: the browser has uploaded the file. Its size is read from storage,
 * never taken from the browser, and checked again against the limits.
 */
export async function finishFileUpload(input: z.input<typeof finishSchema>): Promise<ActionResult> {
  try {
    const { taskId, id, name: rawName } = finishSchema.parse(input);
    const ctx = await requireTaskAccess(taskId, { allowGuests: true });
    const key = keyFor(ctx.project.id, id);
    const size = await storedSize(key);
    if (size === null) return { error: 'The upload didn’t arrive. Try again.' };

    const name = cleanFileName(rawName);
    const problem = fileProblem(name, size) ?? (await storageProblem(ctx.workspace.id, size));
    if (problem) {
      await deleteFile(key).catch(() => {});
      return { error: problem };
    }
    const row = await recordTaskFile(ctx, { id, key, name, size });
    if (!row) return { error: 'This file was already added.' };
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not add the file.');
  }
}

/** A listed file with what the caller may do to it. */
async function requireFileAccess(fileId: string) {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: attachment.id,
      name: attachment.name,
      storageKey: attachment.storageKey,
      uploadedById: attachment.uploadedById,
      clientVisible: attachment.clientVisible,
      taskId: attachment.taskId,
      taskTitle: task.title,
      projectId: project.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role: member.role,
    })
    .from(attachment)
    .innerJoin(task, eq(task.id, attachment.taskId))
    .innerJoin(project, eq(project.id, attachment.projectId))
    .innerJoin(workspace, eq(workspace.id, project.workspaceId))
    .innerJoin(member, and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)))
    .where(and(eq(attachment.id, fileId), eq(attachment.listed, true)))
    .limit(1);
  if (!row) throw new AuthzError();
  const isUploader = row.uploadedById === session.user.id;
  // A client only ever reaches their own files here; anything else doesn't exist for them.
  if (row.role === 'guest' && !isUploader) throw new AuthzError();
  return { session, row, isUploader, isManager: row.role === 'owner' || row.role === 'admin' };
}

/** Share a file with the project's client, or make it internal again. Team only. */
export async function setFileVisibility(input: { fileId: string; clientVisible: boolean }): Promise<ActionResult> {
  try {
    const { fileId, clientVisible } = z.object({ fileId: z.uuid(), clientVisible: z.boolean() }).parse(input);
    const { row, isUploader, isManager } = await requireFileAccess(fileId);
    if (row.role === 'guest') throw new AuthzError();
    if (!isUploader && !isManager) {
      return { error: 'Only the person who added this file, or an admin, can change who sees it.' };
    }
    if (row.uploadedById) {
      const [uploader] = await db
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.workspaceId, row.workspaceId), eq(member.userId, row.uploadedById)))
        .limit(1);
      if (uploader?.role === 'guest') return { error: 'Files from the client are always visible to them.' };
    }
    await db.update(attachment).set({ clientVisible }).where(eq(attachment.id, fileId));
    revalidatePath(projectPath(row.workspaceSlug, row.projectId));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not change who sees the file.');
  }
}

/** Remove a file: the person who added it, or an owner or admin. */
export async function deleteTaskFile(fileId: string): Promise<ActionResult> {
  try {
    const { session, row, isUploader, isManager } = await requireFileAccess(z.uuid().parse(fileId));
    if (!isUploader && !isManager) {
      return { error: 'Only the person who added this file, or an admin, can remove it.' };
    }
    await db.delete(attachment).where(eq(attachment.id, row.id));
    // The row is what grants access; the bytes go after it, best effort.
    await deleteFile(row.storageKey).catch((err) => console.error('[files] storage delete failed:', err));
    await insertActivity({
      workspaceId: row.workspaceId,
      actorId: session.user.id,
      action: 'task.file_removed',
      projectId: row.projectId,
      taskId: row.taskId,
      metadata: { taskTitle: row.taskTitle, fileName: row.name },
    });
    revalidatePath(projectPath(row.workspaceSlug, row.projectId));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not remove the file.');
  }
}
