import 'server-only';
import { and, eq, ne, or, isNotNull } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { member, projectGuest, user } from '@/db/schema';

/**
 * Everyone who can see a project: the workspace's team (owners, admins,
 * members) plus the guests it's shared with. Guests of *other* projects (other
 * clients) are never included, so their names and emails can't leak through
 * the member list, @mentions or notifications.
 */
export async function projectAudience(workspaceId: string, projectId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(projectGuest, and(eq(projectGuest.userId, member.userId), eq(projectGuest.projectId, projectId)))
    .where(and(eq(member.workspaceId, workspaceId), or(ne(member.role, 'guest'), isNotNull(projectGuest.projectId))));
}
