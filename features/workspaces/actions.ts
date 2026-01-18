'use server';

import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

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
