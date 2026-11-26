'use server';

import { and, asc, eq, isNull, max, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import {
  activityLog,
  attachment,
  checklistItem,
  notification,
  project,
  task,
  taskAssignee,
  taskLabel,
  taskStatus,
} from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { projectPath, requireTaskAccess, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { taskHref } from './task-link';

/**
 * I2: duplicating a task, and moving one to another project in the same
 * workspace. Team members only (requireTaskAccess leaves guests out).
 */

const taskIdSchema = z.object({ taskId: z.string().min(1).max(64) });
const moveSchema = taskIdSchema.extend({ projectId: z.string().min(1).max(64) });

const nextOrder = async (statusId: string) => {
  const [{ top }] = await db.select({ top: max(task.order) }).from(task).where(eq(task.statusId, statusId));
  return (top ?? 0) + 1;
};

/**
 * A copy at the end of the same column, with the description, priority,
 * dates, assignees, labels and checklist (unticked). Comments, files and
 * approvals stay with the original.
 */
export async function duplicateTask(input: { taskId: string }): Promise<ActionResult<{ taskId: string }>> {
  try {
    const { taskId } = taskIdSchema.parse(input);
    const ctx = await requireTaskAccess(taskId);
    await enforceRateLimit('taskCreate', ctx.session.user.id);

    const [[source], assignees, labels, checklist] = await Promise.all([
      db.select().from(task).where(eq(task.id, ctx.task.id)).limit(1),
      db.select({ userId: taskAssignee.userId }).from(taskAssignee).where(eq(taskAssignee.taskId, ctx.task.id)),
      db.select({ labelId: taskLabel.labelId }).from(taskLabel).where(eq(taskLabel.taskId, ctx.task.id)),
      db
        .select({ title: checklistItem.title, position: checklistItem.position })
        .from(checklistItem)
        .where(eq(checklistItem.taskId, ctx.task.id))
        .orderBy(asc(checklistItem.position), asc(checklistItem.createdAt)),
    ]);
    if (!source) return { error: 'That task no longer exists.' };

    const id = crypto.randomUUID();
    const title = `${source.title} (copy)`.slice(0, 255);
    await db.batch([
      db.insert(task).values({
        id,
        title,
        description: source.description,
        priority: source.priority,
        dueDate: source.dueDate,
        dueHasTime: source.dueHasTime,
        startDate: source.startDate,
        order: await nextOrder(source.statusId),
        projectId: ctx.project.id,
        statusId: source.statusId,
      }),
      ...(assignees.length ? [db.insert(taskAssignee).values(assignees.map((a) => ({ taskId: id, userId: a.userId })))] : []),
      ...(labels.length ? [db.insert(taskLabel).values(labels.map((l) => ({ taskId: id, labelId: l.labelId })))] : []),
      ...(checklist.length
        ? [db.insert(checklistItem).values(checklist.map((c, i) => ({ taskId: id, title: c.title, done: false, position: i })))]
        : []),
    ]);

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.created',
      projectId: ctx.project.id,
      taskId: id,
      metadata: { taskTitle: title, duplicatedFrom: source.title },
    });
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    return { taskId: id };
  } catch (error) {
    return toActionError(error, 'Could not duplicate the task.');
  }
}

/** The active projects a task can move to: the rest of its workspace. */
export async function listMoveTargets(input: {
  taskId: string;
}): Promise<ActionResult<{ projects: { id: string; name: string }[] }>> {
  try {
    const { taskId } = taskIdSchema.parse(input);
    const ctx = await requireTaskAccess(taskId);
    const projects = await db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(and(eq(project.workspaceId, ctx.workspace.id), ne(project.id, ctx.project.id), isNull(project.archivedAt)))
      .orderBy(asc(project.name));
    return { projects };
  } catch (error) {
    return toActionError(error, 'Could not load the projects.');
  }
}

/**
 * Move a task, with its comments, checklist, files, approvals and history, to
 * another active project in the workspace. It lands at the end of the column
 * with the same name there, or else the default column.
 */
export async function moveTask(input: {
  taskId: string;
  projectId: string;
}): Promise<ActionResult<{ projectId: string; projectName: string; column: string }>> {
  try {
    const parsed = moveSchema.parse(input);
    const ctx = await requireTaskAccess(parsed.taskId);
    if (parsed.projectId === ctx.project.id) return { error: 'The task is already in that project.' };

    const [[target], [from]] = await Promise.all([
      db
        .select({ id: project.id, name: project.name })
        .from(project)
        .where(and(eq(project.id, parsed.projectId), eq(project.workspaceId, ctx.workspace.id), isNull(project.archivedAt)))
        .limit(1),
      db
        .select({ name: project.name, column: taskStatus.name })
        .from(project)
        .innerJoin(taskStatus, eq(taskStatus.id, ctx.task.statusId))
        .where(eq(project.id, ctx.project.id))
        .limit(1),
    ]);
    if (!target) return { error: 'That project isn’t available. Pick another one.' };

    const columns = await db
      .select({ id: taskStatus.id, name: taskStatus.name, isDefault: taskStatus.isDefault })
      .from(taskStatus)
      .where(eq(taskStatus.projectId, target.id))
      .orderBy(asc(taskStatus.order));
    const column =
      columns.find((c) => c.name.trim().toLowerCase() === from?.column.trim().toLowerCase()) ??
      columns.find((c) => c.isDefault) ??
      columns[0];
    if (!column) return { error: 'That project has no columns yet.' };

    const href = taskHref(ctx.workspace.slug, target.id, ctx.task.id);
    await db.batch([
      db
        .update(task)
        .set({ projectId: target.id, statusId: column.id, order: await nextOrder(column.id) })
        .where(and(eq(task.id, ctx.task.id), eq(task.projectId, ctx.project.id))),
      // Files, notifications and history follow, so their links keep working.
      db.update(attachment).set({ projectId: target.id }).where(eq(attachment.taskId, ctx.task.id)),
      db.update(notification).set({ projectId: target.id, href }).where(eq(notification.taskId, ctx.task.id)),
      db.update(activityLog).set({ projectId: target.id }).where(eq(activityLog.taskId, ctx.task.id)),
    ]);

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.moved',
      projectId: target.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title, fromProject: from?.name ?? '', toProject: target.name },
    });
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    revalidatePath(projectPath(ctx.workspace.slug, target.id));
    return { projectId: target.id, projectName: target.name, column: column.name };
  } catch (error) {
    return toActionError(error, 'Could not move the task.');
  }
}
