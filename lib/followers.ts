import 'server-only';
import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { member, notification, task, taskFollower, taskStatus } from '@/db/schema';
import { taskHref } from '@/features/tasks/task-link';

/**
 * I4: following tasks. Following is for the team: guests never follow, and a
 * follower who has since become a guest (or left) is skipped when notifying.
 */

/** Follows a task for these users; following twice is a no-op. */
export async function follow(taskId: string, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db
    .insert(taskFollower)
    .values(ids.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing();
}

type FollowerEvent = {
  workspace: { id: string; slug: string };
  projectId: string;
  actor: { id: string; name: string };
  /** People already notified about this event another way (e.g. @mentioned). */
  skip?: string[];
} & (
  | { type: 'task_comment'; tasks: { id: string; title: string }[] }
  | { type: 'task_status_changed'; tasks: { id: string; title: string }[]; statusId: string }
);

/**
 * In-app notifications for a task's followers, never for the person who did
 * it. A column change replaces that follower's unread column-change
 * notification for the same task, so dragging a card around sends one.
 * Errors are logged, not thrown: the change itself has already been saved.
 */
export async function notifyFollowers(event: FollowerEvent) {
  try {
    const taskIds = event.tasks.map((t) => t.id);
    if (taskIds.length === 0) return;
    const excluded = [event.actor.id, ...(event.skip ?? [])];

    const followers = await db
      .select({ taskId: taskFollower.taskId, userId: taskFollower.userId })
      .from(taskFollower)
      .innerJoin(
        member,
        and(
          eq(member.userId, taskFollower.userId),
          eq(member.workspaceId, event.workspace.id),
          ne(member.role, 'guest'),
        ),
      )
      .where(and(inArray(taskFollower.taskId, taskIds), notInArray(taskFollower.userId, excluded)));
    if (followers.length === 0) return;

    let detail: string | null = null;
    if (event.type === 'task_status_changed') {
      const [column] = await db
        .select({ name: taskStatus.name })
        .from(taskStatus)
        .where(and(eq(taskStatus.id, event.statusId), eq(taskStatus.projectId, event.projectId)))
        .limit(1);
      if (!column) return;
      detail = column.name;
    }

    const titles = new Map(event.tasks.map((t) => [t.id, t.title]));
    const rows = followers.map((f) => ({
      userId: f.userId,
      type: event.type,
      actorName: event.actor.name,
      taskTitle: titles.get(f.taskId) ?? null,
      detail,
      workspaceId: event.workspace.id,
      projectId: event.projectId,
      taskId: f.taskId,
      href: taskHref(event.workspace.slug, event.projectId, f.taskId),
    }));

    if (event.type === 'task_status_changed') {
      await db.batch([
        db
          .delete(notification)
          .where(
            and(
              eq(notification.type, 'task_status_changed'),
              eq(notification.read, false),
              inArray(notification.taskId, taskIds),
              inArray(
                notification.userId,
                followers.map((f) => f.userId),
              ),
            ),
          ),
        db.insert(notification).values(rows),
      ]);
    } else {
      await db.insert(notification).values(rows);
    }
  } catch (error) {
    console.error('[followers] notifications failed:', error);
  }
}

/** The tasks (of these) that aren't in this column yet: the ones a move changes. */
export async function tasksLeavingColumn(taskIds: string[], statusId: string, projectId: string) {
  if (taskIds.length === 0) return [];
  return db
    .select({ id: task.id, title: task.title })
    .from(task)
    .where(and(inArray(task.id, taskIds), eq(task.projectId, projectId), ne(task.statusId, statusId)));
}

/** follow(), for after(): a failure is logged, since the change is saved. */
export function followQuietly(taskId: string, userIds: string[]) {
  return follow(taskId, userIds).catch((error) => console.error('[followers] follow failed:', error));
}
