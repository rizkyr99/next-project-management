'use server';

import { db } from '@/db/drizzle';
import { member, project, task, taskStatus, workspace } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
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

  const parsed = createProjectSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid project details.' };
  }
  const { name, description, workspaceSlug } = parsed.data;
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
      return { error: 'Workspace not found.' };
    }

    // IDs are generated up front so the project, its default columns and the
    // welcome task can be written in one batch (a single transaction). A
    // failure can never leave a project without columns.
    const projectId = crypto.randomUUID();
    const todoId = crypto.randomUUID();

    const [[newProject]] = await db.batch([
      db
        .insert(project)
        .values({
          id: projectId,
          name,
          description: description?.trim() || null,
          workspaceId: membership.workspaceId,
        })
        .returning(),
      db.insert(taskStatus).values([
        { id: todoId, name: 'To Do', order: 1, projectId, isDefault: true },
        { name: 'In Progress', order: 2, projectId },
        { name: 'Done', order: 3, projectId },
      ]),
      db.insert(task).values({
        title: 'Welcome to your new project!',
        description: 'This is a default task to help you get started.',
        projectId,
        statusId: todoId,
        order: 1,
      }),
    ]);

    await insertActivity({
      workspaceId: membership.workspaceId,
      actorId: userId,
      action: 'project.created',
      projectId,
      metadata: { projectName: name },
    });

    revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');

    return { project: newProject };
  } catch (error) {
    console.error('Project Creation Error:', error);
    return { error: 'Failed to create project.' };
  }
}
