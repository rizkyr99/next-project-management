'use server';


import { db } from '@/db/drizzle';
import { checklistItem, label, member, project, task, taskLabel, taskStatus, workspace, projectFavorite } from '@/db/schema';
import { insertActivity } from '@/lib/activity';
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import z from 'zod';
import { archiveProjectSchema, createProjectSchema, deleteProjectSchema, updateProjectSchema } from './schema';
import type { ProjectStatus } from './details';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { generateShareToken } from './share-token';
import { requireProjectAccess, requireSession, runAction, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadTemplate } from '@/features/templates/load';
import { templateToRows } from '@/features/templates/convert';
import { dayInZone, safeTimeZone } from '@/features/templates/dates';
import { MAX_LABELS_PER_WORKSPACE } from '@/features/labels/schema';

export async function createProject(
  values: z.infer<typeof createProjectSchema>,
) {
  return runAction('Failed to create project.', async () => {
    const session = await requireSession();

    const parsed = createProjectSchema.safeParse(values);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid project details.' };
    }
    const { name, description, workspaceSlug, templateId, startDate } = parsed.data;
    const userId = session.user.id;

    const [membership] = await db
      .select({ workspaceId: workspace.id })
      .from(workspace)
      .innerJoin(member, eq(member.workspaceId, workspace.id))
      // Clients (guests) only see the projects shared with them; they can't add any.
      .where(and(eq(workspace.slug, workspaceSlug), eq(member.userId, userId), ne(member.role, 'guest')))
      .limit(1);

    if (!membership) {
      return { error: 'Workspace not found.' };
    }

    // IDs are generated up front so the project and everything in it can be
    // written in one batch (a single transaction): a failure can never leave
    // a project without columns, or half a template. New blank projects start
    // empty; the guided tour lives in each workspace's "Getting started"
    // project (P4.3).
    const projectId = crypto.randomUUID();
    const insertProject = () =>
      db
        .insert(project)
        .values({ id: projectId, name, description: description?.trim() || null, workspaceId: membership.workspaceId })
        .returning();

    let templateName: string | undefined;
    let newProject: typeof project.$inferSelect;
    if (templateId) {
      await enforceRateLimit('templates', userId);
      const template = await loadTemplate(templateId, membership.workspaceId);
      if (!template) return { error: 'That template no longer exists. Pick another one.' };
      templateName = template.name;

      const timeZone = safeTimeZone(parsed.data.timeZone);
      const existingLabels = await db
        .select({ id: label.id, name: label.name })
        .from(label)
        .where(eq(label.workspaceId, membership.workspaceId));
      const rows = templateToRows(template.data, {
        projectId,
        workspaceId: membership.workspaceId,
        startDay: startDate || dayInZone(new Date(), timeZone),
        timeZone,
        existingLabels,
        labelSlots: Math.max(0, MAX_LABELS_PER_WORKSPACE - existingLabels.length),
      });

      const [[created]] = await db.batch([
        insertProject(),
        db.insert(taskStatus).values(rows.statuses),
        ...(rows.labels.length ? [db.insert(label).values(rows.labels)] : []),
        ...(rows.tasks.length ? [db.insert(task).values(rows.tasks)] : []),
        ...(rows.taskLabels.length ? [db.insert(taskLabel).values(rows.taskLabels)] : []),
        ...(rows.checklist.length ? [db.insert(checklistItem).values(rows.checklist)] : []),
      ]);
      newProject = created;
    } else {
      const [[created]] = await db.batch([
        insertProject(),
        db.insert(taskStatus).values([
          { name: 'To Do', order: 1, projectId, isDefault: true },
          { name: 'In Progress', order: 2, projectId },
          { name: 'Done', order: 3, projectId },
        ]),
      ]);
      newProject = created;
    }

    await insertActivity({
      workspaceId: membership.workspaceId,
      actorId: userId,
      action: 'project.created',
      projectId,
      metadata: { projectName: name, ...(templateName && { templateName }) },
    });

    revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');

    return { project: newProject };
  });
}

/** Rename or re-describe a project. Any member of its workspace may do this. */
export async function updateProject(
  values: z.input<typeof updateProjectSchema>,
): Promise<
  ActionResult<{
    project: {
      id: string;
      name: string;
      description: string | null;
      clientName: string | null;
      deadline: string | null;
      status: ProjectStatus | null;
    };
  }>
> {
  try {
    const input = updateProjectSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);

    const description = input.description ? input.description : null;
    const [updated] = await db
      .update(project)
      .set({
        name: input.name,
        description,
        ...(input.clientName !== undefined && { clientName: input.clientName }),
        ...(input.deadline !== undefined && { deadline: input.deadline }),
        ...(input.status !== undefined && { status: input.status }),
      })
      .where(eq(project.id, ctx.project.id))
      .returning({
        id: project.id,
        name: project.name,
        description: project.description,
        clientName: project.clientName,
        deadline: project.deadline,
        status: project.status,
      });

    if (input.name !== ctx.project.name) {
      await insertActivity({
        workspaceId: ctx.workspace.id,
        actorId: ctx.session.user.id,
        action: 'project.updated',
        projectId: ctx.project.id,
        metadata: { from: ctx.project.name, to: input.name },
      });
    }

    // The layout renders the sidebar and the page renders the header, so
    // refresh both.
    revalidatePath(`/workspaces/${ctx.workspace.slug}`, 'layout');
    return { project: updated };
  } catch (error) {
    return toActionError(error, 'Failed to update project.');
  }
}

/**
 * Archive a finished project, or bring it back. Archived projects leave the
 * sidebar, the home page and My tasks, and stop sending due-date reminders,
 * but keep everything and stay searchable. Any member may (it's reversible).
 */
export async function setProjectArchived(values: z.infer<typeof archiveProjectSchema>): Promise<ActionResult> {
  try {
    const input = archiveProjectSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);
    const [changed] = await db
      .update(project)
      .set({ archivedAt: input.archived ? new Date() : null })
      .where(
        and(
          eq(project.id, ctx.project.id),
          input.archived ? isNull(project.archivedAt) : isNotNull(project.archivedAt),
        ),
      )
      .returning({ id: project.id });
    // Already in that state (a double click, or another member got there first).
    if (!changed) return { success: true };

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: input.archived ? 'project.archived' : 'project.restored',
      projectId: ctx.project.id,
      metadata: { projectName: ctx.project.name },
    });
    revalidatePath(`/workspaces/${ctx.workspace.slug}`, 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, archiveErrorMessage(values));
  }
}

const shareLinkSchema = z.object({ projectId: z.uuid(), action: z.enum(['enable', 'replace', 'disable']) });

/**
 * C4: turns a project's read-only share link on (keeping the current link if
 * there is one), replaces it (the old link stops working), or turns it off.
 * Owners and admins only: it shows the board to anyone with the link.
 */
export async function setProjectShareLink(
  values: z.infer<typeof shareLinkSchema>,
): Promise<ActionResult<{ token: string | null }>> {
  try {
    const input = shareLinkSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId, { roles: ['owner', 'admin'] });
    const [current] = await db
      .select({ token: project.shareToken })
      .from(project)
      .where(eq(project.id, ctx.project.id));
    if (input.action === 'enable' && current?.token) return { token: current.token };
    if (input.action === 'disable' && !current?.token) return { token: null };

    const token = input.action === 'disable' ? null : generateShareToken();
    await db.update(project).set({ shareToken: token }).where(eq(project.id, ctx.project.id));
    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: token ? 'project.share_link_created' : 'project.share_link_disabled',
      projectId: ctx.project.id,
      metadata: { projectName: ctx.project.name },
    });
    revalidatePath(`/workspaces/${ctx.workspace.slug}/projects/${ctx.project.id}`);
    return { token };
  } catch (error) {
    return toActionError(error, 'Could not change the share link.');
  }
}

function archiveErrorMessage(values: { archived?: unknown }) {
  return values?.archived === false ? 'Could not restore the project.' : 'Could not archive the project.';
}

/**
 * Permanently deletes a project and, by cascade, its columns, tasks,
 * comments and call state. Activity entries stay (project_id is set to
 * null) so the workspace history survives. Owners and admins only.
 */
export async function deleteProject(
  values: z.infer<typeof deleteProjectSchema>,
): Promise<ActionResult> {
  let slug: string;
  try {
    const input = deleteProjectSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId, { roles: ['owner', 'admin'] });
    slug = ctx.workspace.slug;

    await db.delete(project).where(eq(project.id, ctx.project.id));

    await insertActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.session.user.id,
      action: 'project.deleted',
      metadata: { projectName: ctx.project.name },
    });
  } catch (error) {
    return toActionError(error, 'Failed to delete project.');
  }

  revalidatePath(`/workspaces/${slug}`, 'layout');
  redirect(`/workspaces/${slug}`);
}

const favoriteSchema = z.object({ projectId: z.uuid(), favorite: z.boolean() });

/** Star or unstar a project for myself: starred ones sit at the top of my sidebar. */
export async function setProjectFavorite(projectId: string, favorite: boolean): Promise<ActionResult> {
  try {
    const input = favoriteSchema.parse({ projectId, favorite });
    const ctx = await requireProjectAccess(input.projectId);
    const userId = ctx.session.user.id;
    if (input.favorite) {
      await db.insert(projectFavorite).values({ userId, projectId: ctx.project.id }).onConflictDoNothing();
    } else {
      await db
        .delete(projectFavorite)
        .where(and(eq(projectFavorite.userId, userId), eq(projectFavorite.projectId, ctx.project.id)));
    }
    revalidatePath(`/workspaces/${ctx.workspace.slug}`, 'layout');
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not update favourites.');
  }
}
