'use server';

import { db } from '@/db/drizzle';
import { member, project, task, taskStatus, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import z from 'zod';
import { createProjectSchema } from './schema';
import { revalidatePath } from 'next/cache';

export async function createProject(
  values: z.infer<typeof createProjectSchema>,
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const { name, workspaceSlug } = values;
  const userId = session.user.id;

  try {
    const [membership] = await db
      .select({
        workspaceId: workspace.id,
      })
      .from(workspace)
      .innerJoin(member, eq(member.workspaceId, workspace.id))
      .where(and(eq(workspace.slug, workspaceSlug), eq(member.userId, userId)))
      .limit(1);

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

    const createdStatuses = await db
      .insert(taskStatus)
      .values([
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
      ])
      .returning({ id: taskStatus.id, name: taskStatus.name });

    const todoStatus = createdStatuses.find((s) => s.name === 'To Do');

    if (todoStatus) {
      await db.insert(task).values({
        title: 'Welcome to your new project!',
        description: 'This is a default task to help you get started.',
        projectId: newProject.id,
        statusId: todoStatus.id,
        order: 1,
      });
    }

    revalidatePath(
      `/workspaces/${workspaceSlug}/projects/${newProject.id}`,
      'layout',
    );

    return { project: newProject };
  } catch (error) {
    console.error('Project Creation Error:', error);
    return { error: 'Failed to create project.' };
  }
}
