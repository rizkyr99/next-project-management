'use server';

import { and, count, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/drizzle';
import { label, taskLabel } from '@/db/schema';
import {
  AuthzError,
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceMember,
  toActionError,
  type ActionResult,
} from '@/lib/authz';
import { isUniqueViolation } from '@/lib/db-errors';
import {
  createLabelSchema,
  deleteLabelSchema,
  MAX_LABELS_PER_WORKSPACE,
  setTaskLabelsSchema,
  updateLabelSchema,
  type LabelInfo,
} from './schema';

const duplicate = (name: string) => ({ error: `There's already a label called “${name}”.` });

/** Labels are workspace-wide: refresh every page in the workspace. */
const refresh = (workspaceSlug: string) => revalidatePath(`/workspaces/${workspaceSlug}`, 'layout');

/** Create a label in the workspace of `projectId` (where it was asked for). Any member may. */
export async function createLabel(input: { projectId: string; name: string; color?: string | null }): Promise<
  ActionResult<{ label: LabelInfo }>
> {
  let parsed;
  try {
    parsed = createLabelSchema.parse(input);
    const ctx = await requireProjectAccess(parsed.projectId);
    const [{ n }] = await db.select({ n: count() }).from(label).where(eq(label.workspaceId, ctx.workspace.id));
    if (n >= MAX_LABELS_PER_WORKSPACE) {
      return { error: `A workspace can have up to ${MAX_LABELS_PER_WORKSPACE} labels. Delete one you no longer use.` };
    }
    const [created] = await db
      .insert(label)
      .values({ workspaceId: ctx.workspace.id, name: parsed.name, color: parsed.color })
      .returning({ id: label.id, name: label.name, color: label.color });
    refresh(ctx.workspace.slug);
    return { label: created };
  } catch (error) {
    if (parsed && isUniqueViolation(error)) return duplicate(parsed.name);
    return toActionError(error, 'Could not create the label.');
  }
}

/** The label, checked against the caller's membership of its workspace. */
async function requireLabel(labelId: string, opts?: Parameters<typeof requireWorkspaceMember>[1]) {
  const [row] = await db.select({ workspaceId: label.workspaceId }).from(label).where(eq(label.id, labelId)).limit(1);
  if (!row) throw new AuthzError();
  return requireWorkspaceMember(row.workspaceId, opts);
}

/** Rename or recolour. Any member may. */
export async function updateLabel(input: { labelId: string; name?: string; color?: string | null }): Promise<ActionResult> {
  let parsed;
  try {
    parsed = updateLabelSchema.parse(input);
    const ctx = await requireLabel(parsed.labelId);
    await db
      .update(label)
      .set({
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.color !== undefined && { color: parsed.color }),
      })
      .where(eq(label.id, parsed.labelId));
    refresh(ctx.workspace.slug);
    return { success: true };
  } catch (error) {
    if (parsed?.name && isUniqueViolation(error)) return duplicate(parsed.name);
    return toActionError(error, 'Could not update the label.');
  }
}

/** Delete a label (and take it off every task). Owners and admins only. */
export async function deleteLabel(input: { labelId: string }): Promise<ActionResult> {
  try {
    const parsed = deleteLabelSchema.parse(input);
    const ctx = await requireLabel(parsed.labelId, { roles: ['owner', 'admin'] });
    await db.delete(label).where(eq(label.id, parsed.labelId));
    refresh(ctx.workspace.slug);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not delete the label.');
  }
}

/** Replace a task's labels. Every label must belong to the task's workspace. */
export async function setTaskLabels(input: { taskId: string; labelIds: string[] }): Promise<ActionResult> {
  try {
    const parsed = setTaskLabelsSchema.parse(input);
    const ctx = await requireTaskAccess(parsed.taskId);
    const ids = [...new Set(parsed.labelIds)];
    if (ids.length > 0) {
      const found = await db
        .select({ id: label.id })
        .from(label)
        .where(and(eq(label.workspaceId, ctx.workspace.id), inArray(label.id, ids)));
      // A label from another workspace is treated as not found.
      if (found.length !== ids.length) throw new AuthzError();
    }
    await db.batch([
      db.delete(taskLabel).where(eq(taskLabel.taskId, ctx.task.id)),
      ...(ids.length > 0 ? [db.insert(taskLabel).values(ids.map((labelId) => ({ taskId: ctx.task.id, labelId })))] : []),
    ] as unknown as Parameters<typeof db.batch>[0]);
    revalidatePath(`/workspaces/${ctx.workspace.slug}/projects/${ctx.project.id}`);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not update labels.');
  }
}
