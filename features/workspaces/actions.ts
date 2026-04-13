'use server';

import { db } from '@/db/drizzle';
import {
  member,
  user as userTable,
  user,
  workspace,
  workspaceInvite,
} from '@/db/schema';
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

  revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');

  return { success: true, name: invitedUser.name || invitedUser.email };
}
