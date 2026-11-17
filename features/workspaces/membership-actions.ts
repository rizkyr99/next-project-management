'use server';

import { db } from '@/db/drizzle';
import { member, user as userTable, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { type ActionResult, requireWorkspaceMember, toActionError } from '@/lib/authz';
import { unassignFromWorkspaceTasks } from '@/lib/membership';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// A workspace has exactly one owner (member.role = 'owner', mirrored in
// workspace.userId, which billing limits count). These actions keep that
// invariant: the owner can't leave, and ownership only moves by transfer.

const leaveSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * Leave a workspace. Any member except the owner, who must transfer
 * ownership (or delete the workspace) first. Also drops their task
 * assignments in this workspace.
 */
export async function leaveWorkspace(values: z.input<typeof leaveSchema>): Promise<ActionResult | void> {
  try {
    const input = leaveSchema.parse(values);
    const ctx = await requireWorkspaceMember(input.workspaceId);
    if (ctx.role === 'owner') {
      return { error: 'Transfer ownership to another member before leaving this workspace.' };
    }
    const userId = ctx.session.user.id;

    await db.batch([
      unassignFromWorkspaceTasks(userId, ctx.workspace.id),
      // ne(owner) repeats the guard in SQL, in case the role changed meanwhile.
      db
        .delete(member)
        .where(
          and(
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.userId, userId),
            ne(member.role, 'owner'),
          ),
        ),
    ]);

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: userId,
      action: 'member.left',
      metadata: { memberName: ctx.session.user.name },
    });
  } catch (error) {
    return toActionError(error, 'Failed to leave the workspace.');
  }

  revalidatePath('/', 'layout');
  // The dashboard root sends them to another workspace, or onboarding.
  redirect('/');
}

const transferSchema = z.object({
  workspaceId: z.string().min(1),
  toMemberId: z.string().min(1),
});

/**
 * Hand the workspace to another member. Owner only. In one batch: the new
 * owner becomes `owner`, the old owner becomes `admin`, and workspace.userId
 * moves so billing limits follow the new owner.
 */
export async function transferOwnership(values: z.input<typeof transferSchema>): Promise<ActionResult> {
  try {
    const input = transferSchema.parse(values);
    const ctx = await requireWorkspaceMember(input.workspaceId, { roles: ['owner'] });
    const fromUserId = ctx.session.user.id;

    const [target] = await db
      .select({ id: member.id, userId: member.userId, name: userTable.name })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(and(eq(member.id, input.toMemberId), eq(member.workspaceId, ctx.workspace.id)))
      .limit(1);

    if (!target) return { error: 'Not found.' };
    if (target.userId === fromUserId) return { error: 'You already own this workspace.' };

    // The new owner's plan has to have room for one more owned workspace.
    const limit = await checkWorkspaceLimit(target.userId);
    if (!limit.allowed) {
      return {
        error: `${target.name} has reached their plan's workspace limit (${limit.current}/${limit.limit}), so they can't take ownership.`,
      };
    }

    await db.batch([
      db
        .update(member)
        .set({ role: 'owner' })
        .where(and(eq(member.id, target.id), eq(member.workspaceId, ctx.workspace.id))),
      db
        .update(member)
        .set({ role: 'admin' })
        .where(
          and(
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.userId, fromUserId),
            eq(member.role, 'owner'),
          ),
        ),
      db
        .update(workspace)
        .set({ userId: target.userId })
        .where(and(eq(workspace.id, ctx.workspace.id), eq(workspace.userId, fromUserId))),
    ]);

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: fromUserId,
      action: 'member.ownership_transferred',
      metadata: { memberName: target.name },
    });

    revalidatePath(`/workspaces/${ctx.workspace.slug}`, 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Failed to transfer ownership.');
  }
}
