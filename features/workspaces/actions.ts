'use server';

import { requireSession, runAction } from '@/lib/authz';

import { db } from '@/db/drizzle';
import { member, user as userTable, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isUniqueViolation } from '@/lib/db-errors';
import { lockWorkspace, unassignFromWorkspaceTasks } from '@/lib/membership';
import { workspaceFormSchema } from './schema';

// Same rules as the client form, enforced again on the server.
const createWorkspaceSchema = workspaceFormSchema.extend({
  description: workspaceFormSchema.shape.description.nullable(),
});

export async function createWorkspace(
  values: z.infer<typeof createWorkspaceSchema>,
) {
  return runAction('Failed to create workspace. Please try again.', async () => {
    const session = await requireSession();

    const userId = session.user.id;

    const parsed = createWorkspaceSchema.safeParse(values);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid workspace details' };
    }
    const validated = parsed.data;

    const limitCheck = await checkWorkspaceLimit(userId);
    if (!limitCheck.allowed) {
      return {
        error: `Workspace limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more workspaces.`,
      };
    }

    // The workspace and its owner membership are written in one batch (a single
    // transaction), so a failure can never leave a workspace without an owner.
    const workspaceId = crypto.randomUUID();

    try {
      await db.batch([
        db.insert(workspace).values({
          id: workspaceId,
          name: validated.name,
          slug: validated.url,
          description: validated.description,
          userId,
        }),
        db.insert(member).values({ workspaceId, userId, role: 'owner' }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { error: 'That workspace URL is already taken' };
      }
      console.error('Workspace Creation Error:', error);
      return { error: 'Failed to create workspace. Please try again.' };
    }

    revalidatePath(`/workspaces/${validated.url}`, 'layout');
    return { slug: validated.url };
  });
}

const updateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

export async function updateWorkspace(
  workspaceSlug: string,
  values: z.infer<typeof updateWorkspaceSchema>,
) {
  return runAction('Failed to update workspace.', async () => {
    const session = await requireSession();

    const validated = updateWorkspaceSchema.parse(values);

    const [targetWorkspace] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug));

    if (!targetWorkspace) return { error: 'Workspace not found' };

    const [membership] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.workspaceId, targetWorkspace.id),
          eq(member.userId, session.user.id),
        ),
      );

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { error: 'You do not have permission to update this workspace' };
    }

    await db
      .update(workspace)
      .set({ name: validated.name, description: validated.description ?? null })
      .where(eq(workspace.id, targetWorkspace.id));

    revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');
    return { success: true };
  });
}

export async function removeMember(workspaceSlug: string, memberId: string) {
  return runAction('Failed to remove member.', async () => {
    const session = await requireSession();

    const [targetWorkspace] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug));

    if (!targetWorkspace) return { error: 'Workspace not found' };

    const [actorMembership] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.workspaceId, targetWorkspace.id),
          eq(member.userId, session.user.id),
        ),
      );

    if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
      return { error: 'You do not have permission to remove members' };
    }

    const [targetMember] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.workspaceId, targetWorkspace.id)));

    if (!targetMember) return { error: 'Member not found' };
    if (targetMember.role === 'owner') return { error: 'Cannot remove the workspace owner' };
    if (actorMembership.role === 'admin' && targetMember.role === 'admin') {
      return { error: 'Admins cannot remove other admins' };
    }

    const [removedUser] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, targetMember.userId));

    // Under the workspace lock, re-check what was read above: the target is
    // still not the owner (ownership may have just moved to them), admins can
    // still only remove plain members, and the actor still has the authority.
    // Assignments are only dropped if the removal went through.
    const actorRole = (roles: string) =>
      sql`exists (select 1 from ${member} where ${member.workspaceId} = ${targetWorkspace.id} and ${member.userId} = ${session.user.id} and ${member.role} in (${sql.raw(roles)}))`;
    const [, removed] = await db.batch([
      lockWorkspace(targetWorkspace.id),
      db
        .delete(member)
        .where(
          and(
            eq(member.id, memberId),
            eq(member.workspaceId, targetWorkspace.id),
            ne(member.role, 'owner'),
            or(actorRole("'owner'"), and(eq(member.role, 'member'), actorRole("'admin'"))),
          ),
        )
        .returning({ id: member.id }),
      unassignFromWorkspaceTasks(targetMember.userId, targetWorkspace.id),
    ]);
    if (removed.length === 0) {
      return { error: 'Roles changed while you were doing this. Refresh and try again.' };
    }

    await insertActivity({
      workspaceId: targetWorkspace.id,
      actorId: session.user.id,
      action: 'member.removed',
      metadata: { memberName: removedUser?.name ?? 'Unknown' },
    });

    revalidatePath(`/workspaces/${workspaceSlug}/settings`);
    return { success: true };
  });
}

export async function changeMemberRole(
  workspaceSlug: string,
  memberId: string,
  newRole: 'admin' | 'member',
) {
  return runAction('Failed to change role.', async () => {
    const session = await requireSession();

    const [targetWorkspace] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug));

    if (!targetWorkspace) return { error: 'Workspace not found' };

    const [actorMembership] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.workspaceId, targetWorkspace.id),
          eq(member.userId, session.user.id),
        ),
      );

    if (!actorMembership || actorMembership.role !== 'owner') {
      return { error: 'Only the workspace owner can change roles' };
    }

    const [targetMember] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.workspaceId, targetWorkspace.id)));

    if (!targetMember) return { error: 'Member not found' };
    if (targetMember.role === 'owner') return { error: 'Cannot change the owner\'s role' };

    const [changedUser] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, targetMember.userId));

    // Under the workspace lock: never touch whoever is owner now (ownership may
    // have just moved to the target), and only while the actor still owns it.
    const [, changed] = await db.batch([
      lockWorkspace(targetWorkspace.id),
      db
        .update(member)
        .set({ role: newRole })
        .where(
          and(
            eq(member.id, memberId),
            eq(member.workspaceId, targetWorkspace.id),
            ne(member.role, 'owner'),
            sql`exists (select 1 from ${workspace} where ${workspace.id} = ${targetWorkspace.id} and ${workspace.userId} = ${session.user.id})`,
          ),
        )
        .returning({ id: member.id }),
    ]);
    if (changed.length === 0) {
      return { error: 'Roles changed while you were doing this. Refresh and try again.' };
    }

    await insertActivity({
      workspaceId: targetWorkspace.id,
      actorId: session.user.id,
      action: 'member.role_changed',
      metadata: { memberName: changedUser?.name ?? 'Unknown', from: targetMember.role, to: newRole },
    });

    revalidatePath(`/workspaces/${workspaceSlug}/settings`);
    return { success: true };
  });
}

export async function deleteWorkspace(workspaceSlug: string) {
  return runAction('Failed to delete workspace.', async () => {
    const session = await requireSession();

    const [targetWorkspace] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug));

    if (!targetWorkspace) return { error: 'Workspace not found' };

    const [actorMembership] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.workspaceId, targetWorkspace.id),
          eq(member.userId, session.user.id),
        ),
      );

    if (!actorMembership || actorMembership.role !== 'owner') {
      return { error: 'Only the workspace owner can delete this workspace' };
    }

    // workspace.userId re-checks ownership at write time (it may have just been transferred).
    await db
      .delete(workspace)
      .where(and(eq(workspace.id, targetWorkspace.id), eq(workspace.userId, session.user.id)));

    redirect('/create-workspace');
  });
}
