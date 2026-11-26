import 'server-only';
import { db } from '@/db/drizzle';
import { projectTemplate, user } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

/**
 * Saved templates with who made them, for the settings tab. Callers must have
 * checked the viewer is on the workspace's team.
 */
export async function savedTemplatesForSettings(workspaceId: string) {
  return db
    .select({
      id: projectTemplate.id,
      name: projectTemplate.name,
      description: projectTemplate.description,
      taskCount: projectTemplate.taskCount,
      createdById: projectTemplate.createdById,
      createdByName: user.name,
      createdAt: projectTemplate.createdAt,
    })
    .from(projectTemplate)
    .leftJoin(user, eq(user.id, projectTemplate.createdById))
    .where(eq(projectTemplate.workspaceId, workspaceId))
    .orderBy(desc(projectTemplate.createdAt));
}
