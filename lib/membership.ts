import { db } from '@/db/drizzle';
import { project, task, taskAssignee } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Removes a user's assignments on every task in one workspace. Returned as a
 * query (not awaited) so callers can run it in the same db.batch as the
 * membership change: someone who leaves or is removed never lingers as an
 * assignee on tasks they can no longer see.
 */
export function unassignFromWorkspaceTasks(userId: string, workspaceId: string) {
  const workspaceTaskIds = db
    .select({ id: task.id })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .where(eq(project.workspaceId, workspaceId));

  return db
    .delete(taskAssignee)
    .where(and(eq(taskAssignee.userId, userId), inArray(taskAssignee.taskId, workspaceTaskIds)));
}
