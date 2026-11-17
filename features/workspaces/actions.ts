'use server';

import { db } from '@/db/drizzle';
import { member, user as userTable, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { auth } from '@/lib/auth';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isUniqueViolation } from '@/lib/db-errors';
import { unassignFromWorkspaceTasks } from '@/lib/membership';
import { workspaceFormSchema } from './schema';

// Same rules as the client form, enforced again on the server.
const createWorkspaceSchema = workspaceFormSchema.extend({
  description: workspaceFormSchema.shape.description.nullable(),
});

export async function createWorkspace(
  values: z.infer<typeof createWorkspaceSchema>,
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

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
}

const updateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

export async function updateWorkspace(
  workspaceSlug: string,
  values: z.infer<typeof updateWorkspaceSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

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
}

export async function removeMember(workspaceSlug: string, memberId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

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

  // Drop their task assignments with the membership, atomically.
  await db.batch([
    unassignFromWorkspaceTasks(targetMember.userId, targetWorkspace.id),
    db
      .delete(member)
      .where(and(eq(member.id, memberId), eq(member.workspaceId, targetWorkspace.id))),
  ]);

  await insertActivity({
    workspaceId: targetWorkspace.id,
    actorId: session.user.id,
    action: 'member.removed',
    metadata: { memberName: removedUser?.name ?? 'Unknown' },
  });

  revalidatePath(`/workspaces/${workspaceSlug}/settings`);
  return { success: true };
}

export async function changeMemberRole(
  workspaceSlug: string,
  memberId: string,
  newRole: 'admin' | 'member',
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

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

  await db.update(member).set({ role: newRole }).where(eq(member.id, memberId));

  await insertActivity({
    workspaceId: targetWorkspace.id,
    actorId: session.user.id,
    action: 'member.role_changed',
    metadata: { memberName: changedUser?.name ?? 'Unknown', from: targetMember.role, to: newRole },
  });

  revalidatePath(`/workspaces/${workspaceSlug}/settings`);
  return { success: true };
}

export async function deleteWorkspace(workspaceSlug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');

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

  await db.delete(workspace).where(eq(workspace.id, targetWorkspace.id));

  redirect('/create-workspace');
}
