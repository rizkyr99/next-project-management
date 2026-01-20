'use server';

import { db } from '@/db/drizzle';
import { member, project, taskStatus, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import z from 'zod';
import { createProjectSchema } from './schema';
import { revalidatePath } from 'next/cache';

export async function createProject(
  values: z.infer<typeof createProjectSchema>
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const { name, workspaceSlug } = values;
  const userId = session.user.id;

  try {
    const result = await db
      .select({
        workspaceId: workspace.id,
      })
      .from(workspace)
      .innerJoin(member, eq(member.workspaceId, workspace.id))
      .where(and(eq(workspace.slug, workspaceSlug), eq(member.userId, userId)))
      .limit(1);

    const membership = result[0];

    if (!membership) {
      throw new Error('Workspace not found or access denied');
    }

    const [newProject] = await db
      .insert(project)
      .values({
        name,
        workspaceId: membership.workspaceId,
      })
      .returning();

    try {
      await db.insert(taskStatus).values([
        {
          name: 'To Do',
          order: 1,
          projectId: newProject.id,
          isDefault: true,
        },
        {
          name: 'In Progress',
          order: 2,
          projectId: newProject.id,
        },
        {
          name: 'Done',
          order: 3,
          projectId: newProject.id,
        },
      ]);
    } catch (statusError) {
      console.error('Failed to create default statuses:', statusError);
    }

    revalidatePath(
      `/workspaces/${workspaceSlug}/projects/${newProject.id}`,
      'layout'
    );

    return { project: newProject };
  } catch (error) {
    console.error('Project Creation Error:', error);
    return { error: 'Failed to create project.' };
  }
}
