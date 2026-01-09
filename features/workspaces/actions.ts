'use server';

import { db } from '@/db/drizzle';
import { workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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
    await db.insert(workspace).values({
      name: validated.name,
      slug: validated.url,
      description: validated.description,
      userId,
    });
  } catch (error) {
    return { error: 'URL already taken or database error' };
  }

  redirect(`/${validated.url}`);
}
