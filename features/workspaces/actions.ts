'use server';

import { db } from '@/db/drizzle';
import { member, notification, user as userTable, workspace, workspaceInvite } from '@/db/schema';
import { auth } from '@/lib/auth';
import { sendWorkspaceInviteEmail } from '@/lib/email';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().min(1, 'URL is required'),
  description: z.string().nullable().optional(),
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

  const validated = createWorkspaceSchema.parse(values);

  try {
    const [newWorkspace] = await db
      .insert(workspace)
      .values({
        name: validated.name,
        slug: validated.url,
        description: validated.description,
        userId,
      })
      .returning({ id: workspace.id, slug: workspace.slug });

    await db.insert(member).values({
      workspaceId: newWorkspace.id,
      userId,
      role: 'owner',
    });

    revalidatePath(`/workspaces/${newWorkspace.slug}`, 'layout');

    return { slug: newWorkspace.slug };
  } catch (error) {
    console.error('Workspace Creation Error:', error);
    return { error: 'URL already taken or database error' };
  }
}

const inviteUserSchema = z.object({
  email: z.email('Invalid email address'),
  role: z.enum(['member', 'admin']),
});

export async function inviteUserToWorkspace(
  workspaceSlug: string,
  values: z.infer<typeof inviteUserSchema>,
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const inviterId = session.user.id;
  const validated = inviteUserSchema.parse(values);

  const [targetWorkspace] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.slug, workspaceSlug));

  if (!targetWorkspace) {
    return { error: 'Workspace not found' };
  }

  const [inviterMember] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.workspaceId, targetWorkspace.id),
        eq(member.userId, inviterId),
      ),
    );

  if (!inviterMember || !['owner', 'admin'].includes(inviterMember.role)) {
    return { error: 'You do not have permission to invite members' };
  }

  const [invitedUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, validated.email));

  if (!invitedUser) {
    return { error: 'No account found with that email address' };
  }

  if (invitedUser.id === inviterId) {
    return { error: 'You cannot invite yourself' };
  }

  const [alreadyMember] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.workspaceId, targetWorkspace.id),
        eq(member.userId, invitedUser.id),
      ),
    );

  if (alreadyMember) {
    return { error: 'User is already a member of this workspace' };
  }

  await db.insert(member).values({
    workspaceId: targetWorkspace.id,
    userId: invitedUser.id,
    role: validated.role,
  });

  await db.insert(notification).values({
    userId: invitedUser.id,
    type: 'workspace_invite',
    actorName: session.user.name,
    workspaceName: targetWorkspace.name,
  });

  await sendWorkspaceInviteEmail({
    to: invitedUser.email,
    inviterName: session.user.name,
    workspaceName: targetWorkspace.name,
    workspaceSlug: targetWorkspace.slug,
  });

  revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');

  return { success: true, name: invitedUser.name || invitedUser.email };
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

  await db.delete(member).where(eq(member.id, memberId));

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

  await db.update(member).set({ role: newRole }).where(eq(member.id, memberId));

  revalidatePath(`/workspaces/${workspaceSlug}/settings`);
  return { success: true };
}

export async function revokeInvite(workspaceSlug: string, inviteId: string) {
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
    return { error: 'You do not have permission to revoke invites' };
  }

  await db
    .update(workspaceInvite)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(workspaceInvite.id, inviteId),
        eq(workspaceInvite.workspaceId, targetWorkspace.id),
      ),
    );

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
