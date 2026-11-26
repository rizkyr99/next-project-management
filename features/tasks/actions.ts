'use server';

import type { Priority } from './priority';

import { enforceRateLimit } from '@/lib/rate-limit';
import z from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { emailTaskNotification } from '@/lib/notification-emails';
import { db } from '@/db/drizzle';
import { comment, commentReaction, member, notification, task, taskAssignee, user as userTable } from '@/db/schema';
import { REACTIONS, type Reaction, type ReactionSummary } from './reaction-kinds';
import { insertActivity } from '@/lib/activity';
import { mentionedNames } from './mentions';
import { taskHref } from './task-link';
import { projectAudience } from '@/lib/project-audience';
import {
  type ActionResult,
  AuthzError,
  assertStatusInProject,
  assertTasksInProject,
  assertWorkspaceMembers,
  projectPath,
  requireCommentAccess,
  requireProjectAccess,
  requireTaskAccess,
  toActionError,
} from '@/lib/authz';
import {
  bulkDeleteTasksSchema,
  bulkUpdateStatusSchema,
  commentBodySchema,
  createTaskSchema,
  deleteTaskSchema,
  reorderTasksSchema,
  idSchema,
  updateTaskAssigneesSchema,
  updateTaskDescriptionSchema,
  updateTaskDueDateSchema,
  updateTaskPrioritySchema,
  updateTaskStatusSchema,
  updateTaskTitleSchema,
} from './schema';

type Task = typeof task.$inferSelect;

/** Notification columns that make a task notification open that task. */
function notificationLink(ctx: { workspace: { id: string; slug: string }; project: { id: string }; task: { id: string } }) {
  return {
    workspaceId: ctx.workspace.id,
    projectId: ctx.project.id,
    taskId: ctx.task.id,
    href: taskHref(ctx.workspace.slug, ctx.project.id, ctx.task.id),
  };
}

export type CommentWithAuthor = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date | null;
  /** Whether the project's guests (clients) can see it. */
  clientVisible: boolean;
  author: { id: string; name: string; image: string | null };
  /** Absent on a comment that was just posted (it has none yet). */
  reactions?: ReactionSummary[];
};

// Every action below:
//   1. validates its input with Zod,
//   2. resolves the target through the caller's workspace membership
//      (lib/authz.ts), and
//   3. scopes every write to the project/task it was authorized for.
// IDs and project context sent by the client are never trusted on their own.

export async function createTask(values: z.input<typeof createTaskSchema>): Promise<ActionResult<{ task: Task }>> {
  try {
    const input = createTaskSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);
    await enforceRateLimit('taskCreate', ctx.session.user.id);
    await assertStatusInProject(input.statusId, ctx.project.id);

    const [newTask] = await db
      .insert(task)
      .values({
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate,
        order: input.order,
        projectId: ctx.project.id,
        statusId: input.statusId,
      })
      .returning();

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.created',
      projectId: ctx.project.id,
      taskId: newTask.id,
      metadata: { taskTitle: newTask.title },
    });

    return { task: newTask };
  } catch (error) {
    return toActionError(error, 'Failed to create task.');
  }
}

export async function updateTaskStatus(values: z.infer<typeof updateTaskStatusSchema>): Promise<ActionResult> {
  try {
    const input = updateTaskStatusSchema.parse(values);
    const ctx = await requireTaskAccess(input.taskId);
    if (ctx.project.id !== input.projectId) throw new AuthzError();
    await assertStatusInProject(input.statusId, ctx.project.id);

    await db
      .update(task)
      .set({ statusId: input.statusId })
      .where(and(eq(task.id, ctx.task.id), eq(task.projectId, ctx.project.id)));

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.status_changed',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update task status.');
  }
}

export async function bulkUpdateStatus(values: z.infer<typeof bulkUpdateStatusSchema>): Promise<ActionResult> {
  try {
    const input = bulkUpdateStatusSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);
    await assertStatusInProject(input.statusId, ctx.project.id);
    await assertTasksInProject(input.taskIds, ctx.project.id);

    await db
      .update(task)
      .set({ statusId: input.statusId })
      .where(and(inArray(task.id, input.taskIds), eq(task.projectId, ctx.project.id)));

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update status.');
  }
}

export async function bulkDeleteTasks(values: z.infer<typeof bulkDeleteTasksSchema>): Promise<ActionResult> {
  try {
    const input = bulkDeleteTasksSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);
    await assertTasksInProject(input.taskIds, ctx.project.id);

    const deletedTasks = await db
      .delete(task)
      .where(and(inArray(task.id, input.taskIds), eq(task.projectId, ctx.project.id)))
      .returning({ title: task.title });

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await Promise.all(
      deletedTasks.map((t) =>
        insertActivity({
          workspaceId: ctx.workspace.id,
          actorId: ctx.session.user.id,
          action: 'task.deleted',
          projectId: ctx.project.id,
          taskId: null,
          metadata: { taskTitle: t.title },
        }),
      ),
    );

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to delete tasks.');
  }
}

export async function reorderTasks(values: z.infer<typeof reorderTasksSchema>): Promise<ActionResult> {
  try {
    const input = reorderTasksSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);
    await assertStatusInProject(input.statusId, ctx.project.id);
    await assertTasksInProject(
      input.tasks.map((t) => t.id),
      ctx.project.id,
    );

    // One HTTP round-trip for all updates instead of one per task.
    const [first, ...rest] = input.tasks.map((t) =>
      db
        .update(task)
        .set({ order: t.order, statusId: input.statusId })
        .where(and(eq(task.id, t.id), eq(task.projectId, ctx.project.id))),
    );
    if (first) await db.batch([first, ...rest]);

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to reorder tasks.');
  }
}

export async function updateTaskTitle(taskId: string, title: string): Promise<ActionResult> {
  try {
    const input = updateTaskTitleSchema.parse({ taskId, title });
    const ctx = await requireTaskAccess(input.taskId);

    await db.update(task).set({ title: input.title }).where(eq(task.id, ctx.task.id));
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.title_changed',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: input.title },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update title.');
  }
}

export async function updateTaskDescription(
  values: z.input<typeof updateTaskDescriptionSchema>,
): Promise<ActionResult> {
  try {
    const input = updateTaskDescriptionSchema.parse(values);
    const ctx = await requireTaskAccess(input.taskId);

    await db
      .update(task)
      .set({ description: input.description })
      .where(and(eq(task.id, ctx.task.id), eq(task.projectId, ctx.project.id)));
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.description_changed',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update description.');
  }
}

/**
 * Deletes one task (comments and assignees cascade). Any member of the
 * workspace may delete, matching bulkDeleteTasks. The board's undo window
 * is client-side: this is only called once it has passed.
 */
export async function deleteTask(values: z.input<typeof deleteTaskSchema>): Promise<ActionResult> {
  try {
    const input = deleteTaskSchema.parse(values);
    const ctx = await requireTaskAccess(input.taskId);

    await db.delete(task).where(and(eq(task.id, ctx.task.id), eq(task.projectId, ctx.project.id)));
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.deleted',
      projectId: ctx.project.id,
      taskId: null,
      metadata: { taskTitle: ctx.task.title },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to delete task.');
  }
}

export async function updateTaskPriority(
  taskId: string,
  priority: Priority,
): Promise<ActionResult> {
  try {
    const input = updateTaskPrioritySchema.parse({ taskId, priority });
    const ctx = await requireTaskAccess(input.taskId);

    await db.update(task).set({ priority: input.priority }).where(eq(task.id, ctx.task.id));
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.priority_changed',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title, priority: input.priority },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update priority.');
  }
}

export async function updateTaskDueDate(taskId: string, dueDate: Date | null, hasTime = false): Promise<ActionResult> {
  try {
    const input = updateTaskDueDateSchema.parse({ taskId, dueDate, hasTime });
    const ctx = await requireTaskAccess(input.taskId);

    await db
      .update(task)
      .set({ dueDate: input.dueDate, dueHasTime: input.dueDate !== null && input.hasTime })
      .where(eq(task.id, ctx.task.id));
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'task.due_date_changed',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: {
        taskTitle: ctx.task.title,
        dueDate: input.dueDate?.toISOString() ?? '',
      },
    });

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update due date.');
  }
}

export async function updateTaskAssignees(taskId: string, assigneeIds: string[]): Promise<ActionResult> {
  try {
    const input = updateTaskAssigneesSchema.parse({ taskId, assigneeIds });
    const ctx = await requireTaskAccess(input.taskId);
    // Before any write: assigning can email people, so toggling someone on
    // and off must not become a way to flood their inbox.
    await enforceRateLimit('assignees', ctx.session.user.id);
    const nextIds = [...new Set(input.assigneeIds)];
    await assertWorkspaceMembers(nextIds, ctx.workspace.id);
    const taskLink = notificationLink(ctx);

    const actorId = ctx.session.user.id;

    const existing = await db
      .select({ userId: taskAssignee.userId })
      .from(taskAssignee)
      .where(eq(taskAssignee.taskId, ctx.task.id));
    const existingIds = new Set(existing.map((r) => r.userId));

    const clear = db.delete(taskAssignee).where(eq(taskAssignee.taskId, ctx.task.id));
    if (nextIds.length > 0) {
      await db.batch([
        clear,
        db.insert(taskAssignee).values(nextIds.map((userId) => ({ taskId: ctx.task.id, userId }))),
      ]);
    } else {
      await clear;
    }

    const addedIds = nextIds.filter((uid) => !existingIds.has(uid));
    const removedIds = [...existingIds].filter((uid) => !nextIds.includes(uid));

    const notifyIds = addedIds.filter((uid) => uid !== actorId);
    if (notifyIds.length > 0) {
      await db.insert(notification).values(
        notifyIds.map((userId) => ({
          userId,
          type: 'task_assigned' as const,
          actorName: ctx.session.user.name,
          taskTitle: ctx.task.title,
          ...taskLink,
        })),
      );
    }
    after(() =>
      emailTaskNotification({
        projectId: ctx.project.id,
        kind: 'assigned',
        userIds: notifyIds,
        actorName: ctx.session.user.name,
        taskTitle: ctx.task.title,
        href: taskLink.href,
      }),
    );

    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));

    const involvedIds = [...addedIds, ...removedIds];
    if (involvedIds.length > 0) {
      const involvedUsers = await db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(inArray(userTable.id, involvedIds));
      const nameById = Object.fromEntries(involvedUsers.map((u) => [u.id, u.name]));

      const logChange = (uid: string, action: 'task.assigned' | 'task.unassigned') =>
        insertActivity({
          workspaceId: ctx.workspace.id,
          actorId,
          action,
          projectId: ctx.project.id,
          taskId: ctx.task.id,
          metadata: { taskTitle: ctx.task.title, assigneeName: nameById[uid] ?? uid },
        });

      await Promise.all([
        ...addedIds.map((uid) => logChange(uid, 'task.assigned')),
        ...removedIds.map((uid) => logChange(uid, 'task.unassigned')),
      ]);
    }

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update assignees.');
  }
}

const commentWithAuthor = {
  id: comment.id,
  body: comment.body,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  clientVisible: comment.clientVisible,
  author: {
    id: userTable.id,
    name: userTable.name,
    image: userTable.image,
  },
};

export async function getComments(taskId: string): Promise<ActionResult<{ comments: CommentWithAuthor[] }>> {
  try {
    const ctx = await requireTaskAccess(idSchema.parse(taskId), { allowGuests: true });

    const rows = await db
      .select(commentWithAuthor)
      .from(comment)
      .innerJoin(userTable, eq(comment.authorId, userTable.id))
      .where(
        and(
          eq(comment.taskId, ctx.task.id),
          // Guests (clients) see only what was shared with them.
          ctx.role === 'guest' ? eq(comment.clientVisible, true) : undefined,
        ),
      )
      .orderBy(asc(comment.createdAt));

    // Reactions on these comments, summarised per comment and kind.
    const reactionRows =
      rows.length > 0
        ? await db
            .select({
              commentId: commentReaction.commentId,
              reaction: commentReaction.reaction,
              userId: commentReaction.userId,
              name: userTable.name,
            })
            .from(commentReaction)
            .innerJoin(userTable, eq(userTable.id, commentReaction.userId))
            .where(inArray(commentReaction.commentId, rows.map((r) => r.id)))
            .orderBy(asc(commentReaction.createdAt))
        : [];
    const me = ctx.session.user.id;
    const comments = rows.map((row) => ({
      ...row,
      reactions: REACTIONS.flatMap((reaction): ReactionSummary[] => {
        const who = reactionRows.filter((r) => r.commentId === row.id && r.reaction === reaction);
        return who.length === 0
          ? []
          : [{ reaction, count: who.length, mine: who.some((r) => r.userId === me), names: who.map((r) => r.name) }];
      }),
    }));

    return { comments };
  } catch (error) {
    return toActionError(error, 'Failed to load comments.');
  }
}

/**
 * Posts a comment. A team comment is internal unless `clientVisible` is set;
 * a guest's (client's) comment is always visible to the client side.
 */
export async function addComment(
  taskId: string,
  body: string,
  options: { clientVisible?: boolean } = {},
): Promise<ActionResult<{ comment: CommentWithAuthor }>> {
  try {
    // Clients (guests) can comment on projects shared with them.
    const ctx = await requireTaskAccess(idSchema.parse(taskId), { allowGuests: true });
    const text = commentBodySchema.parse(body);
    const clientVisible = ctx.role === 'guest' || z.boolean().optional().parse(options.clientVisible) === true;
    const actorId = ctx.session.user.id;
    await enforceRateLimit('comments', actorId);
    const taskLink = notificationLink(ctx);

    const [newComment] = await db
      .insert(comment)
      // updated_at's $onUpdate would also fire on insert; a new comment isn't edited.
      .values({ taskId: ctx.task.id, authorId: actorId, body: text, clientVisible, updatedAt: null })
      .returning({ id: comment.id });

    // Resolve @Name mentions against the workspace's real members, never
    // against a list supplied by the client. The comment is already saved, so
    // a notification failure must not turn into an error (a retry would post
    // a duplicate comment).
    if (text.includes('@')) {
      try {
        // Only people who can see this project: a client can't be pinged
        // about (or learn the title of) another client's task.
        // An internal comment reaches the team only.
        const audience = await projectAudience(ctx.workspace.id, ctx.project.id);
        const members = clientVisible ? audience : audience.filter((m) => m.role !== 'guest');

        // Longest name wins at each "@" (features/tasks/mentions.ts), the same
        // rule the comment view uses to highlight.
        const mentionedSet = new Set(mentionedNames(text, members.map((m) => m.name)));
        const mentioned = members.filter(
          (m) => m.id !== actorId && mentionedSet.has(m.name),
        );

        if (mentioned.length > 0) {
          await db.insert(notification).values(
            mentioned.map((u) => ({
              userId: u.id,
              type: 'comment_mention' as const,
              actorName: ctx.session.user.name,
              taskTitle: ctx.task.title,
              ...taskLink,
            })),
          );
          after(() =>
            emailTaskNotification({
              projectId: ctx.project.id,
              kind: 'mentioned',
              userIds: mentioned.map((u) => u.id),
              actorName: ctx.session.user.name,
              taskTitle: ctx.task.title,
              href: taskLink.href,
              excerpt: text,
            }),
          );
        }
      } catch (notifyError) {
        console.error('[comments] mention notifications failed:', notifyError);
      }
    }

    const [withAuthor] = await db
      .select(commentWithAuthor)
      .from(comment)
      .innerJoin(userTable, eq(comment.authorId, userTable.id))
      .where(eq(comment.id, newComment.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId,
      action: 'task.comment_added',
      projectId: ctx.project.id,
      taskId: ctx.task.id,
      metadata: { taskTitle: ctx.task.title },
    });

    return { comment: withAuthor };
  } catch (error) {
    return toActionError(error, 'Failed to add comment.');
  }
}

export async function updateComment(commentId: string, body: string): Promise<ActionResult> {
  try {
    const ctx = await requireCommentAccess(idSchema.parse(commentId), { allowGuests: true });
    const text = commentBodySchema.parse(body);

    if (ctx.comment.authorId !== ctx.session.user.id) {
      return { error: 'Not authorized to edit this comment.' };
    }

    await db
      .update(comment)
      .set({ body: text })
      .where(and(eq(comment.id, ctx.comment.id), eq(comment.authorId, ctx.session.user.id)));

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to update comment.');
  }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCommentAccess(idSchema.parse(commentId), { allowGuests: true });

    if (ctx.comment.authorId !== ctx.session.user.id) {
      return { error: 'Not authorized to delete this comment.' };
    }

    await db
      .delete(comment)
      .where(and(eq(comment.id, ctx.comment.id), eq(comment.authorId, ctx.session.user.id)));

    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to delete comment.');
  }
}

const visibilitySchema = z.object({ commentId: z.uuid(), clientVisible: z.boolean() });

/**
 * Shares a team comment with the project's guests (clients), or makes it
 * internal again. Only its author or a workspace owner/admin can, and a
 * guest's own comments always stay visible to them.
 */
export async function setCommentVisibility(commentId: string, clientVisible: boolean): Promise<ActionResult> {
  try {
    const input = visibilitySchema.parse({ commentId, clientVisible });
    const ctx = await requireCommentAccess(input.commentId);
    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    if (ctx.comment.authorId !== ctx.session.user.id && !isAdmin) {
      return { error: 'Only its author or an admin can change who sees this comment.' };
    }
    const [author] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, ctx.comment.authorId), eq(member.workspaceId, ctx.workspace.id)));
    if (author?.role === 'guest') {
      return { error: 'A client’s own comments are always visible to them.' };
    }

    await db
      .update(comment)
      // Keep updated_at: sharing isn't an edit (it would show "edited").
      .set({ clientVisible: input.clientVisible, updatedAt: sql`${comment.updatedAt}` })
      .where(eq(comment.id, ctx.comment.id));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not change who sees this comment.');
  }
}

const reactionSchema = z.object({ commentId: z.uuid(), reaction: z.enum(REACTIONS) });

/**
 * Add the reaction if I haven't, remove it if I have. Anyone who can see the
 * task can react to its comments.
 */
export async function toggleReaction(commentId: string, reaction: Reaction): Promise<ActionResult<{ reacted: boolean }>> {
  try {
    const input = reactionSchema.parse({ commentId, reaction });
    const ctx = await requireCommentAccess(input.commentId, { allowGuests: true });
    await enforceRateLimit('reactions', ctx.session.user.id);
    const mine = and(
      eq(commentReaction.commentId, ctx.comment.id),
      eq(commentReaction.userId, ctx.session.user.id),
      eq(commentReaction.reaction, input.reaction),
    );

    const removed = await db.delete(commentReaction).where(mine).returning({ commentId: commentReaction.commentId });
    if (removed.length > 0) return { reacted: false };

    await db
      .insert(commentReaction)
      .values({ commentId: ctx.comment.id, userId: ctx.session.user.id, reaction: input.reaction })
      .onConflictDoNothing();
    return { reacted: true };
  } catch (error) {
    return toActionError(error, 'Could not update the reaction.');
  }
}
