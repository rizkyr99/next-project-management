import { db } from '@/db/drizzle';
import { member, project, task, taskAssignee, workspace } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

/*
 * Membership changes (leave, remove, role change, ownership transfer,
 * account deletion) each run as one db.batch (a transaction) that starts by
 * locking the workspace row FOR UPDATE, then re-checks its preconditions in
 * SQL. Concurrent changes to the same workspace therefore run one after the
 * other, and each later statement (READ COMMITTED: a fresh snapshot per
 * statement) sees what the earlier one committed. Inserting a member (invite
 * accept) takes a KEY SHARE lock on the workspace through its foreign key,
 * which also conflicts with FOR UPDATE.
 */

/** `SELECT … FOR UPDATE` on one workspace row; the first statement of a membership batch. */
export function lockWorkspace(workspaceId: string) {
  return db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for('update');
}

/**
 * Removes a user's assignments on every task in one workspace, but only once
 * they're no longer a member of it. Returned as a query (not awaited) so it
 * runs in the same batch as the membership delete; if that delete was
 * refused, this is a no-op.
 */
export function unassignFromWorkspaceTasks(userId: string, workspaceId: string) {
  const workspaceTaskIds = db
    .select({ id: task.id })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .where(eq(project.workspaceId, workspaceId));

  return db
    .delete(taskAssignee)
    .where(
      and(
        eq(taskAssignee.userId, userId),
        inArray(taskAssignee.taskId, workspaceTaskIds),
        sql`not exists (select 1 from ${member} where ${member.workspaceId} = ${workspaceId} and ${member.userId} = ${userId})`,
      ),
    );
}
