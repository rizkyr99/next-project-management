import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';

export interface OwnedWorkspace {
  id: string;
  name: string;
  slug: string;
  otherMembers: number;
}

/**
 * Workspaces the user owns (workspace.userId, which cascades on user delete),
 * with how many other people are in each. Those with other members block
 * account deletion; the rest are deleted along with the account.
 */
export async function getOwnedWorkspaces(userId: string): Promise<OwnedWorkspace[]> {
  return db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      otherMembers: sql<number>`count(${member.id})::int`,
    })
    .from(workspace)
    .leftJoin(member, and(eq(member.workspaceId, workspace.id), ne(member.userId, userId)))
    .where(eq(workspace.userId, userId))
    .groupBy(workspace.id, workspace.name, workspace.slug)
    .orderBy(workspace.name);
}
