'use server';

import { db } from '@/db/drizzle';
import { checklistItem, label, member, projectTemplate, task, taskLabel, taskStatus, workspace } from '@/db/schema';
import { requireProjectAccess, requireSession, AuthzError, toActionError, type ActionResult } from '@/lib/authz';
import { enforceRateLimit } from '@/lib/rate-limit';
import { planGateProblem } from '@/lib/subscription';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { BUILTIN_TEMPLATES } from './builtin';
import { projectToTemplate } from './convert';
import { safeTimeZone } from './dates';
import {
  MAX_TEMPLATE_CHECKLIST_ITEMS,
  MAX_TEMPLATE_TASKS,
  MAX_TEMPLATES_PER_WORKSPACE,
  templateDataSchema,
  type TemplateSummary,
} from './shape';

/** The workspace (by slug) and the caller's role in it; team members only. */
async function requireTeamBySlug(workspaceSlug: string) {
  const session = await requireSession();
  const [row] = await db
    .select({ id: workspace.id, slug: workspace.slug, role: member.role })
    .from(workspace)
    .innerJoin(member, and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)))
    .where(and(eq(workspace.slug, workspaceSlug), ne(member.role, 'guest')))
    .limit(1);
  if (!row) throw new AuthzError();
  return { session, workspace: row };
}

/** Built-in templates and the workspace's own, for the "Start from" picker. */
export async function listTemplates(
  workspaceSlug: string,
): Promise<ActionResult<{ builtin: TemplateSummary[]; saved: TemplateSummary[] }>> {
  try {
    const { workspace: ws } = await requireTeamBySlug(z.string().min(1).max(100).parse(workspaceSlug));
    const saved = await db
      .select({
        id: projectTemplate.id,
        name: projectTemplate.name,
        description: projectTemplate.description,
        taskCount: projectTemplate.taskCount,
      })
      .from(projectTemplate)
      .where(eq(projectTemplate.workspaceId, ws.id))
      .orderBy(asc(projectTemplate.name));
    return {
      builtin: BUILTIN_TEMPLATES.map(({ id, name, description, taskCount }) => ({ id, name, description, taskCount })),
      saved,
    };
  } catch (error) {
    return toActionError(error, 'Could not load templates.');
  }
}

const saveSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, 'Name the template.').max(100, 'Template names can be up to 100 characters.'),
  description: z
    .string()
    .trim()
    .max(500, 'The description can be up to 500 characters.')
    .optional()
    .transform((v) => v || null),
  timeZone: z.string().max(64).optional(),
});

/**
 * Saves a project's columns, tasks, checklists and labels as a template.
 * Assignees, comments, approvals, files and history stay behind. Any team
 * member may save one; clients can't.
 */
export async function saveProjectAsTemplate(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<{ templateId: string }>> {
  try {
    const { projectId, name, description, timeZone } = saveSchema.parse(input);
    const ctx = await requireProjectAccess(projectId);
    await enforceRateLimit('templates', ctx.session.user.id);
    const gated = await planGateProblem(ctx.workspace.id, 'savedTemplates');
    if (gated) return { error: gated };

    const [[{ templates }], statuses, tasks] = await db.batch([
      db.select({ templates: count() }).from(projectTemplate).where(eq(projectTemplate.workspaceId, ctx.workspace.id)),
      db
        .select({ id: taskStatus.id, name: taskStatus.name, color: taskStatus.color, isDefault: taskStatus.isDefault })
        .from(taskStatus)
        .where(eq(taskStatus.projectId, projectId))
        .orderBy(asc(taskStatus.order)),
      db
        .select({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          dueHasTime: task.dueHasTime,
          statusId: task.statusId,
        })
        .from(task)
        .innerJoin(taskStatus, eq(taskStatus.id, task.statusId))
        .where(eq(task.projectId, projectId))
        .orderBy(asc(taskStatus.order), asc(task.order)),
    ]);
    if (templates >= MAX_TEMPLATES_PER_WORKSPACE) {
      return { error: `A workspace can keep up to ${MAX_TEMPLATES_PER_WORKSPACE} templates. Delete one in Settings first.` };
    }
    if (tasks.length > MAX_TEMPLATE_TASKS) {
      return { error: `Templates can hold up to ${MAX_TEMPLATE_TASKS} tasks; this project has ${tasks.length}.` };
    }

    const taskIds = tasks.map((t) => t.id);
    const [labels, checklist] =
      taskIds.length === 0
        ? [[], []]
        : await db.batch([
            db
              .select({ taskId: taskLabel.taskId, name: label.name, color: label.color })
              .from(taskLabel)
              .innerJoin(label, eq(label.id, taskLabel.labelId))
              .where(inArray(taskLabel.taskId, taskIds))
              .orderBy(asc(label.name)),
            db
              .select({ taskId: checklistItem.taskId, title: checklistItem.title })
              .from(checklistItem)
              .where(inArray(checklistItem.taskId, taskIds))
              .orderBy(asc(checklistItem.position)),
          ]);
    if (checklist.length > MAX_TEMPLATE_CHECKLIST_ITEMS) {
      return { error: `Templates can hold up to ${MAX_TEMPLATE_CHECKLIST_ITEMS} checklist items; this project has ${checklist.length}.` };
    }

    const data = templateDataSchema.parse(
      projectToTemplate(
        { statuses, tasks, labels, checklist },
        safeTimeZone(timeZone),
      ),
    );

    const [created] = await db
      .insert(projectTemplate)
      .values({
        workspaceId: ctx.workspace.id,
        name,
        description,
        taskCount: data.tasks.length,
        data,
        createdById: ctx.session.user.id,
      })
      .returning({ id: projectTemplate.id });

    revalidatePath(`/workspaces/${ctx.workspace.slug}/settings`);
    return { templateId: created.id };
  } catch (error) {
    return toActionError(error, 'Could not save the template.');
  }
}

/** Deletes a saved template: its creator, or an owner or admin. */
export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  try {
    const id = z.uuid().parse(templateId);
    const session = await requireSession();
    const [row] = await db
      .select({ createdById: projectTemplate.createdById, role: member.role, slug: workspace.slug })
      .from(projectTemplate)
      .innerJoin(workspace, eq(workspace.id, projectTemplate.workspaceId))
      .innerJoin(member, and(eq(member.workspaceId, projectTemplate.workspaceId), eq(member.userId, session.user.id)))
      .where(eq(projectTemplate.id, id))
      .limit(1);
    if (!row || row.role === 'guest') throw new AuthzError();
    const isManager = row.role === 'owner' || row.role === 'admin';
    if (!isManager && row.createdById !== session.user.id) {
      return { error: 'Only the person who saved this template, or an admin, can delete it.' };
    }
    await db.delete(projectTemplate).where(eq(projectTemplate.id, id));
    revalidatePath(`/workspaces/${row.slug}/settings`);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not delete the template.');
  }
}
