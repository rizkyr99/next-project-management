'use server';

import { db } from '@/db/drizzle';
import { member, user, workspace, workspaceInvite } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { inviteMemberSchema } from './schema';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().min(1, 'URL is required'),
  description: z.string().nullable().optional(),
});

export async function createWorkspace(
  values: z.infer<typeof createWorkspaceSchema>
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

export async function inviteWorkspaceMember(
  values: z.infer<typeof inviteMemberSchema>
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const validated = inviteMemberSchema.parse(values);
  const email = validated.email.trim().toLowerCase();

  const [membership] = await db
    .select({
      workspaceId: workspace.id,
      role: member.role,
    })
    .from(workspace)
    .innerJoin(member, eq(member.workspaceId, workspace.id))
    .where(
      and(
        eq(workspace.slug, validated.workspaceSlug),
        eq(member.userId, session.user.id),
      ),
    );

  if (!membership) {
    return { error: 'Workspace not found or access denied' };
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { error: 'Only admins or owners can invite members' };
  }

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));

  if (existingUser) {
    const [existingMember] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.workspaceId, membership.workspaceId),
          eq(member.userId, existingUser.id),
        ),
      );

    if (existingMember) {
      return { error: 'That user is already a member' };
    }

    await db.insert(member).values({
      workspaceId: membership.workspaceId,
      userId: existingUser.id,
      role: validated.role,
    });

    revalidatePath(`/workspaces/${validated.workspaceSlug}/settings`);
    revalidatePath(`/workspaces/${validated.workspaceSlug}`, 'layout');

    return { status: 'added' as const };
  }

  const now = new Date();
  const [existingInvite] = await db
    .select({
      id: workspaceInvite.id,
      expiresAt: workspaceInvite.expiresAt,
    })
    .from(workspaceInvite)
    .where(
      and(
        eq(workspaceInvite.workspaceId, membership.workspaceId),
        eq(workspaceInvite.email, email),
        eq(workspaceInvite.status, 'pending'),
      ),
    );

  if (existingInvite && existingInvite.expiresAt > now) {
    return { error: 'An invite is already pending for this email' };
  }

  await db.insert(workspaceInvite).values({
    workspaceId: membership.workspaceId,
    email,
    role: validated.role,
    status: 'pending',
    token: crypto.randomUUID(),
    invitedByUserId: session.user.id,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
  });

  revalidatePath(`/workspaces/${validated.workspaceSlug}/settings`);

  return { status: 'invited' as const };
}
