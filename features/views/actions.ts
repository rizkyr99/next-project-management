'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/drizzle';
import { project, savedView, workspace } from '@/db/schema';
import { requireProjectAccess, requireSession, toActionError, type ActionResult } from '@/lib/authz';
import { isUniqueViolation } from '@/lib/db-errors';
import { createSavedViewSchema, deleteSavedViewSchema, MAX_SAVED_VIEWS_PER_PROJECT } from './schema';
import { viewQuery } from './query';

const projectPath = (workspaceSlug: string, projectId: string) => `/workspaces/${workspaceSlug}/projects/${projectId}`;

/** Save the current layout, filters and sort under a name. Your own views; team only. */
export async function createSavedView(input: { projectId: string; name: string; query: string }): Promise<
  ActionResult<{ view: { id: string; name: string; query: string } }>
> {
  let parsed;
  try {
    parsed = createSavedViewSchema.parse(input);
    const ctx = await requireProjectAccess(parsed.projectId);
    // Only the view's own params are kept, in a fixed order.
    const query = viewQuery(parsed.query);
    if (!query) return { error: 'Set a filter, sort or layout to save first.' };
    const userId = ctx.session.user.id;
    const [{ n }] = await db
      .select({ n: count() })
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.projectId, ctx.project.id)));
    if (n >= MAX_SAVED_VIEWS_PER_PROJECT) {
      return { error: `You can save up to ${MAX_SAVED_VIEWS_PER_PROJECT} views per project. Delete one you no longer use.` };
    }
    const [view] = await db
      .insert(savedView)
      .values({ userId, projectId: ctx.project.id, name: parsed.name, query })
      .returning({ id: savedView.id, name: savedView.name, query: savedView.query });
    revalidatePath(projectPath(ctx.workspace.slug, ctx.project.id));
    return { view };
  } catch (error) {
    if (parsed && isUniqueViolation(error)) return { error: `You already have a view called “${parsed.name}”.` };
    return toActionError(error, 'Could not save the view.');
  }
}

/** Delete one of your saved views. */
export async function deleteSavedView(input: { viewId: string }): Promise<ActionResult> {
  try {
    const { viewId } = deleteSavedViewSchema.parse(input);
    const session = await requireSession();
    const mine = and(eq(savedView.id, viewId), eq(savedView.userId, session.user.id));
    const [row] = await db
      .select({ projectId: savedView.projectId, workspaceSlug: workspace.slug })
      .from(savedView)
      .innerJoin(project, eq(project.id, savedView.projectId))
      .innerJoin(workspace, eq(workspace.id, project.workspaceId))
      .where(mine)
      .limit(1);
    if (!row) return { error: 'That view was already deleted.' };
    await db.delete(savedView).where(mine);
    revalidatePath(projectPath(row.workspaceSlug, row.projectId));
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not delete the view.');
  }
}
