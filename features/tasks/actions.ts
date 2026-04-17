'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import z from 'zod';
import {
  bulkDeleteTasksSchema,
  bulkUpdateStatusSchema,
  createTaskSchema,
  reorderTasksSchema,
  updateTaskStatusSchema,
} from './schema';
import { db } from '@/db/drizzle';
import { comment, notification, project as projectTable, task, taskAssignee, user as userTable } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray } from 'drizzle-orm';

async function getTaskContext(taskId: string) {
  const [row] = await db
    .select({ taskTitle: task.title, workspaceId: projectTable.workspaceId, projectId: task.projectId })
    .from(task)
    .innerJoin(projectTable, eq(task.projectId, projectTable.id))
    .where(eq(task.id, taskId));
  return row ?? null;
}

async function getWorkspaceId(projectId: string) {
  const [p] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId));
  return p?.workspaceId ?? null;
}

export async function createTask(values: z.infer<typeof createTaskSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    const [newTask] = await db
      .insert(task)
      .values({
        title: values.title,
        dueDate: values.dueDate,
        order: values.order,
        projectId: values.projectId,
        statusId: values.statusId,
      })
      .returning();

    revalidatePath(`/projects/${values.projectId}`);

    const workspaceId = await getWorkspaceId(values.projectId);
    if (workspaceId) {
      await insertActivity({
        workspaceId,
        actorId: session.user.id,
        action: 'task.created',
        projectId: values.projectId,
        taskId: newTask.id,
        metadata: { taskTitle: newTask.title },
      });
    }

    return { task: newTask };
  } catch (error) {
    console.error('Error creating task:', error);
    return { error: 'Failed to create task.' };
  }
}

export async function updateTaskStatus(
  values: z.infer<typeof updateTaskStatusSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    await db
      .update(task)
      .set({ statusId: values.statusId })
      .where(eq(task.id, values.taskId));

    revalidatePath(`/projects/${values.projectId}`, 'page');

    const ctx = await getTaskContext(values.taskId);
    if (ctx) {
      await insertActivity({
        workspaceId: ctx.workspaceId,
        actorId: session.user.id,
        action: 'task.status_changed',
        projectId: ctx.projectId,
        taskId: values.taskId,
        metadata: { taskTitle: ctx.taskTitle },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating task status:', error);
    return { error: 'Failed to update task status.' };
  }
}

export async function bulkUpdateStatus(
  values: z.infer<typeof bulkUpdateStatusSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    await db
      .update(task)
      .set({ statusId: values.statusId })
      .where(inArray(task.id, values.taskIds));

    revalidatePath(`/projects/${values.projectId}`, 'page');
    return { success: true };
  } catch (error) {
    console.error('Error bulk updating status:', error);
    return { error: 'Failed to update status.' };
  }
}

export async function bulkDeleteTasks(
  values: z.infer<typeof bulkDeleteTasksSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    const deletedTasks = await db
      .select({ id: task.id, title: task.title, projectId: task.projectId })
      .from(task)
      .where(inArray(task.id, values.taskIds));

    await db.delete(task).where(inArray(task.id, values.taskIds));
    revalidatePath(`/projects/${values.projectId}`, 'page');

    const workspaceId = await getWorkspaceId(values.projectId);
    if (workspaceId) {
      for (const t of deletedTasks) {
        await insertActivity({
          workspaceId,
          actorId: session.user.id,
          action: 'task.deleted',
          projectId: values.projectId,
          taskId: null,
          metadata: { taskTitle: t.title },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error bulk deleting tasks:', error);
    return { error: 'Failed to delete tasks.' };
  }
}

export async function reorderTasks(values: z.infer<typeof reorderTasksSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const { projectId, statusId, tasks } = values;

  try {
    for (const t of tasks) {
      await db
        .update(task)
        .set({ order: t.order, statusId })
        .where(eq(task.id, t.id));
    }

    revalidatePath(`/projects/${projectId}`, 'page');

    return { success: true };
  } catch (error) {
    console.error('Error reordering tasks:', error);
    return { error: 'Failed to reorder tasks.' };
  }
}

export async function updateTaskTitle(
  taskId: string,
  title: string,
  projectId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 255) {
    return { error: 'Title must be between 1 and 255 characters.' };
  }

  try {
    await db.update(task).set({ title: trimmed }).where(eq(task.id, taskId));
    revalidatePath(`/projects/${projectId}`, 'page');

    const workspaceId = await getWorkspaceId(projectId);
    if (workspaceId) {
      await insertActivity({
        workspaceId,
        actorId: session.user.id,
        action: 'task.title_changed',
        projectId,
        taskId,
        metadata: { taskTitle: title },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating task title:', error);
    return { error: 'Failed to update title.' };
  }
}

export async function updateTaskPriority(
  taskId: string,
  priority: 'low' | 'medium' | 'high',
  projectId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    await db.update(task).set({ priority }).where(eq(task.id, taskId));
    revalidatePath(`/projects/${projectId}`, 'page');

    const ctx = await getTaskContext(taskId);
    if (ctx) {
      await insertActivity({
        workspaceId: ctx.workspaceId,
        actorId: session.user.id,
        action: 'task.priority_changed',
        projectId,
        taskId,
        metadata: { taskTitle: ctx.taskTitle, priority },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating task priority:', error);
    return { error: 'Failed to update priority.' };
  }
}

export async function updateTaskDueDate(
  taskId: string,
  dueDate: Date | null,
  projectId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    await db.update(task).set({ dueDate }).where(eq(task.id, taskId));
    revalidatePath(`/projects/${projectId}`, 'page');

    const ctx = await getTaskContext(taskId);
    if (ctx) {
      await insertActivity({
        workspaceId: ctx.workspaceId,
        actorId: session.user.id,
        action: 'task.due_date_changed',
        projectId,
        taskId,
        metadata: { taskTitle: ctx.taskTitle, dueDate: dueDate?.toISOString() ?? '' },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating task due date:', error);
    return { error: 'Failed to update due date.' };
  }
}

export async function updateTaskAssignees(
  taskId: string,
  assigneeIds: string[],
  projectId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    const existing = await db
      .select({ userId: taskAssignee.userId })
      .from(taskAssignee)
      .where(eq(taskAssignee.taskId, taskId));
    const existingIds = new Set(existing.map((r) => r.userId));

    await db.delete(taskAssignee).where(eq(taskAssignee.taskId, taskId));

    if (assigneeIds.length > 0) {
      await db.insert(taskAssignee).values(
        assigneeIds.map((userId) => ({ taskId, userId })),
      );

      const newlyAddedIds = assigneeIds.filter(
        (uid) => !existingIds.has(uid) && uid !== session.user.id,
      );

      if (newlyAddedIds.length > 0) {
        const [assignedTask] = await db
          .select({ title: task.title })
          .from(task)
          .where(eq(task.id, taskId));

        const [actor] = await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, session.user.id));

        if (assignedTask && actor) {
          await db.insert(notification).values(
            newlyAddedIds.map((userId) => ({
              userId,
              type: 'task_assigned' as const,
              actorName: actor.name,
              taskTitle: assignedTask.title,
            })),
          );
        }
      }
    }

    revalidatePath(`/projects/${projectId}`, 'page');

    const ctx = await getTaskContext(taskId);
    if (ctx) {
      const addedIds = assigneeIds.filter((uid) => !existingIds.has(uid));
      const removedIds = [...existingIds].filter((uid) => !assigneeIds.includes(uid));

      const involvedUserIds = [...addedIds, ...removedIds];
      const involvedUsers = involvedUserIds.length > 0
        ? await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, involvedUserIds))
        : [];
      const userNameMap = Object.fromEntries(involvedUsers.map((u) => [u.id, u.name]));

      for (const uid of addedIds) {
        await insertActivity({
          workspaceId: ctx.workspaceId,
          actorId: session.user.id,
          action: 'task.assigned',
          projectId,
          taskId,
          metadata: { taskTitle: ctx.taskTitle, assigneeName: userNameMap[uid] ?? uid },
        });
      }
      for (const uid of removedIds) {
        await insertActivity({
          workspaceId: ctx.workspaceId,
          actorId: session.user.id,
          action: 'task.unassigned',
          projectId,
          taskId,
          metadata: { taskTitle: ctx.taskTitle, assigneeName: userNameMap[uid] ?? uid },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating task assignees:', error);
    return { error: 'Failed to update assignees.' };
  }
}

export async function getComments(taskId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    const rows = await db
      .select({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: {
          id: userTable.id,
          name: userTable.name,
          image: userTable.image,
        },
      })
      .from(comment)
      .innerJoin(userTable, eq(comment.authorId, userTable.id))
      .where(eq(comment.taskId, taskId))
      .orderBy(asc(comment.createdAt));

    return { comments: rows };
  } catch (error) {
    console.error('Error fetching comments:', error);
    return { error: 'Failed to load comments.' };
  }
}

export async function addComment(
  taskId: string,
  body: string,
  workspaceMembers: { id: string; name: string }[],
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { error: 'Comment must be between 1 and 2000 characters.' };
  }

  try {
    const [newComment] = await db
      .insert(comment)
      .values({ taskId, authorId: session.user.id, body: trimmed })
      .returning();

    // Parse @Name mentions and notify matched members (excluding self)
    const mentionPattern = /@(\w[\w\s]*)/g;
    const matches = [...trimmed.matchAll(mentionPattern)].map((m) =>
      m[1].trim().toLowerCase(),
    );

    if (matches.length > 0) {
      const mentionedUsers = workspaceMembers.filter(
        (m) =>
          matches.includes(m.name.toLowerCase()) &&
          m.id !== session.user.id,
      );

      if (mentionedUsers.length > 0) {
        const [mentionedTask] = await db
          .select({ title: task.title })
          .from(task)
          .where(eq(task.id, taskId));

        if (mentionedTask) {
          await db.insert(notification).values(
            mentionedUsers.map((u) => ({
              userId: u.id,
              type: 'comment_mention' as const,
              actorName: session.user.name,
              taskTitle: mentionedTask.title,
            })),
          );
        }
      }
    }

    // Return with author info
    const [withAuthor] = await db
      .select({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: {
          id: userTable.id,
          name: userTable.name,
          image: userTable.image,
        },
      })
      .from(comment)
      .innerJoin(userTable, eq(comment.authorId, userTable.id))
      .where(eq(comment.id, newComment.id));

    const ctx = await getTaskContext(taskId);
    if (ctx) {
      await insertActivity({
        workspaceId: ctx.workspaceId,
        actorId: session.user.id,
        action: 'task.comment_added',
        projectId: ctx.projectId,
        taskId,
        metadata: { taskTitle: ctx.taskTitle },
      });
    }

    return { comment: withAuthor };
  } catch (error) {
    console.error('Error adding comment:', error);
    return { error: 'Failed to add comment.' };
  }
}

export async function updateComment(commentId: string, body: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { error: 'Comment must be between 1 and 2000 characters.' };
  }

  try {
    const [existing] = await db
      .select({ authorId: comment.authorId })
      .from(comment)
      .where(eq(comment.id, commentId));

    if (existing?.authorId !== session.user.id) {
      return { error: 'Not authorized to edit this comment.' };
    }

    await db
      .update(comment)
      .set({ body: trimmed })
      .where(and(eq(comment.id, commentId), eq(comment.authorId, session.user.id)));

    return { success: true };
  } catch (error) {
    console.error('Error updating comment:', error);
    return { error: 'Failed to update comment.' };
  }
}

export async function deleteComment(commentId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  try {
    const [existing] = await db
      .select({ authorId: comment.authorId })
      .from(comment)
      .where(eq(comment.id, commentId));

    if (existing?.authorId !== session.user.id) {
      return { error: 'Not authorized to delete this comment.' };
    }

    await db
      .delete(comment)
      .where(and(eq(comment.id, commentId), eq(comment.authorId, session.user.id)));

    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { error: 'Failed to delete comment.' };
  }
}
