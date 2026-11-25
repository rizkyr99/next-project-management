'use server';

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { member, project, projectGuest, user } from '@/db/schema';
import { AuthzError, requireWorkspaceMember, toActionError, type ActionResult } from '@/lib/authz';
import { lockWorkspace } from '@/lib/membership';

const setGuestProjectsSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
  projectIds: z
    .array(z.uuid())
    .min(1, 'Share at least one project, or remove the guest instead.')
    .max(50),
});

/**
 * Choose which projects a guest (client) can see. Owners and admins only.
 * The target must be a guest of this workspace, and every project must be in
 * it; projects left out stop being shared at once.
 */
export async function setGuestProjects(values: z.input<typeof setGuestProjectsSchema>): Promise<ActionResult> {
  try {
    const input = setGuestProjectsSchema.parse(values);
    const ctx = await requireWorkspaceMember(input.workspaceId, { roles: ['owner', 'admin'] });
    const ids = [...new Set(input.projectIds)];

    const [target] = await db
      .select({ userId: member.userId, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.id, input.memberId), eq(member.workspaceId, ctx.workspace.id), eq(member.role, 'guest')))
      .limit(1);
    if (!target) throw new AuthzError();

    const found = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.workspaceId, ctx.workspace.id), inArray(project.id, ids)));
    if (found.length !== ids.length) throw new AuthzError();

    const workspaceProjectIds = db.select({ id: project.id }).from(project).where(eq(project.workspaceId, ctx.workspace.id));
    await db.batch([
      lockWorkspace(ctx.workspace.id),
      db
        .delete(projectGuest)
        .where(
          and(
            eq(projectGuest.userId, target.userId),
            inArray(projectGuest.projectId, workspaceProjectIds),
            notInArray(projectGuest.projectId, ids),
          ),
        ),
      // Only while they're still a guest here (they may have just been
      // removed): stale rows would come back if they were re-invited.
      db
        .insert(projectGuest)
        .select(
          db
            .select({ projectId: project.id, userId: member.userId, createdAt: sql<Date>`now()`.as('created_at') })
            .from(project)
            .innerJoin(
              member,
              and(
                eq(member.workspaceId, project.workspaceId),
                eq(member.id, input.memberId),
                eq(member.role, 'guest'),
              ),
            )
            .where(and(eq(project.workspaceId, ctx.workspace.id), inArray(project.id, ids))),
        )
        .onConflictDoNothing(),
    ]);

    revalidatePath(`/workspaces/${ctx.workspace.slug}`, 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not update the guest’s projects.');
  }
}
