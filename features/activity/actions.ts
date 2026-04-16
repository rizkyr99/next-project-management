'use server';

import { db } from '@/db/drizzle';
import { activityLog, user as userTable } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, desc, eq, lt } from 'drizzle-orm';
import { headers } from 'next/headers';

const PAGE_SIZE = 30;

export async function getWorkspaceActivity(workspaceId: string, cursor?: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      taskId: activityLog.taskId,
      projectId: activityLog.projectId,
      actor: { id: userTable.id, name: userTable.name, image: userTable.image },
    })
    .from(activityLog)
    .innerJoin(userTable, eq(activityLog.actorId, userTable.id))
    .where(
      cursor
        ? and(eq(activityLog.workspaceId, workspaceId), lt(activityLog.createdAt, new Date(cursor)))
        : eq(activityLog.workspaceId, workspaceId),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return { items, nextCursor };
}

export async function getTaskActivity(taskId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      actor: { id: userTable.id, name: userTable.name, image: userTable.image },
    })
    .from(activityLog)
    .innerJoin(userTable, eq(activityLog.actorId, userTable.id))
    .where(eq(activityLog.taskId, taskId))
    .orderBy(desc(activityLog.createdAt))
    .limit(20);

  return { items: rows };
}
