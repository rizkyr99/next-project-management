'use server';

import { z } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activityLog, user as userTable } from '@/db/schema';
import {
  AuthzError,
  UnauthenticatedError,
  requireTaskAccess,
  requireWorkspaceMember,
} from '@/lib/authz';

const PAGE_SIZE = 30;

const workspaceActivitySchema = z.object({
  workspaceId: z.uuid(),
  cursor: z.iso.datetime().optional(),
  projectId: z.uuid().optional(),
  // Better Auth user IDs aren't UUIDs.
  actorId: z.string().min(1).max(64).optional(),
});

export type ActivityFilters = { projectId?: string; actorId?: string };

const actorColumns = {
  id: userTable.id,
  name: userTable.name,
  image: userTable.image,
};

/**
 * Read-only feeds: an inaccessible or invalid target yields an empty feed
 * rather than an error, so nothing about other tenants is revealed and the
 * client components need no extra error handling.
 */
function isDenied(error: unknown) {
  return error instanceof AuthzError || error instanceof z.ZodError;
}

export async function getWorkspaceActivity(workspaceId: string, cursor?: string, filters: ActivityFilters = {}) {
  try {
    const input = workspaceActivitySchema.parse({ workspaceId, cursor, ...filters });
    const ctx = await requireWorkspaceMember(input.workspaceId);

    const rows = await db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
        taskId: activityLog.taskId,
        projectId: activityLog.projectId,
        actor: actorColumns,
      })
      .from(activityLog)
      .innerJoin(userTable, eq(activityLog.actorId, userTable.id))
      .where(
        // Always within this workspace: a project or person from elsewhere
        // simply matches nothing.
        and(
          eq(activityLog.workspaceId, ctx.workspace.id),
          input.cursor ? lt(activityLog.createdAt, new Date(input.cursor)) : undefined,
          input.projectId ? eq(activityLog.projectId, input.projectId) : undefined,
          input.actorId ? eq(activityLog.actorId, input.actorId) : undefined,
        ),
      )
      .orderBy(desc(activityLog.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor };
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    if (isDenied(error)) return { items: [], nextCursor: null };
    throw error;
  }
}

export async function getTaskActivity(taskId: string) {
  try {
    const ctx = await requireTaskAccess(z.uuid().parse(taskId), { allowGuests: true });

    const rows = await db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
        actor: actorColumns,
      })
      .from(activityLog)
      .innerJoin(userTable, eq(activityLog.actorId, userTable.id))
      .where(eq(activityLog.taskId, ctx.task.id))
      .orderBy(desc(activityLog.createdAt))
      .limit(20);

    return { items: rows };
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    if (isDenied(error)) return { items: [] };
    throw error;
  }
}
