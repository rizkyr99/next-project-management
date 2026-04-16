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
import { comment, notification, task, taskAssignee, user as userTable } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray } from 'drizzle-orm';

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
    await db.delete(task).where(inArray(task.id, values.taskIds));
    revalidatePath(`/projects/${values.projectId}`, 'page');
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

  try {
    await db.update(task).set({ title }).where(eq(task.id, taskId));
    revalidatePath(`/projects/${projectId}`, 'page');
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
