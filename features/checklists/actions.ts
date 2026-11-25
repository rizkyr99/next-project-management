'use server';

import { and, eq, max, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/drizzle';
import { checklistItem } from '@/db/schema';
import { AuthzError, requireTaskAccess, toActionError, type ActionResult } from '@/lib/authz';
import {
  addChecklistItemsSchema,
  deleteChecklistItemSchema,
  MAX_CHECKLIST_ITEMS,
  reorderChecklistSchema,
  updateChecklistItemSchema,
  type ChecklistItemInfo,
} from './schema';

type TaskCtx = Awaited<ReturnType<typeof requireTaskAccess>>;

const refresh = (ctx: TaskCtx) => revalidatePath(`/workspaces/${ctx.workspace.slug}/projects/${ctx.project.id}`);

/** The item's task, checked against the caller's access to it. */
async function requireItem(itemId: string) {
  const [row] = await db
    .select({ taskId: checklistItem.taskId })
    .from(checklistItem)
    .where(eq(checklistItem.id, itemId))
    .limit(1);
  if (!row) throw new AuthzError();
  return requireTaskAccess(row.taskId);
}

/** Add steps to the end of a task's checklist. */
export async function addChecklistItems(input: {
  taskId: string;
  titles: string[];
}): Promise<ActionResult<{ items: ChecklistItemInfo[] }>> {
  try {
    const parsed = addChecklistItemsSchema.parse(input);
    const ctx = await requireTaskAccess(parsed.taskId);
    const [{ n, last }] = await db
      .select({ n: count(), last: max(checklistItem.position) })
      .from(checklistItem)
      .where(eq(checklistItem.taskId, ctx.task.id));
    if (n + parsed.titles.length > MAX_CHECKLIST_ITEMS) {
      return { error: `A checklist can have up to ${MAX_CHECKLIST_ITEMS} steps.` };
    }
    const start = (last ?? -1) + 1;
    const items = await db
      .insert(checklistItem)
      .values(parsed.titles.map((title, i) => ({ taskId: ctx.task.id, title, position: start + i })))
      .returning({
        id: checklistItem.id,
        title: checklistItem.title,
        done: checklistItem.done,
        position: checklistItem.position,
      });
    refresh(ctx);
    return { items };
  } catch (error) {
    return toActionError(error, 'Could not add the step.');
  }
}

/** Tick, untick or rename a step. */
export async function updateChecklistItem(input: {
  itemId: string;
  title?: string;
  done?: boolean;
}): Promise<ActionResult> {
  try {
    const parsed = updateChecklistItemSchema.parse(input);
    const ctx = await requireItem(parsed.itemId);
    await db
      .update(checklistItem)
      .set({
        ...(parsed.title !== undefined && { title: parsed.title }),
        ...(parsed.done !== undefined && { done: parsed.done }),
      })
      .where(eq(checklistItem.id, parsed.itemId));
    refresh(ctx);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not update the step.');
  }
}

export async function deleteChecklistItem(input: { itemId: string }): Promise<ActionResult> {
  try {
    const parsed = deleteChecklistItemSchema.parse(input);
    const ctx = await requireItem(parsed.itemId);
    await db.delete(checklistItem).where(eq(checklistItem.id, parsed.itemId));
    refresh(ctx);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not delete the step.');
  }
}

/**
 * Put a task's steps in the given order. The list must be exactly the
 * task's steps (no more, no fewer), so a stale list from before someone
 * else's change is refused instead of half-applied.
 */
export async function reorderChecklist(input: { taskId: string; itemIds: string[] }): Promise<ActionResult> {
  try {
    const parsed = reorderChecklistSchema.parse(input);
    const ctx = await requireTaskAccess(parsed.taskId);
    const current = await db
      .select({ id: checklistItem.id })
      .from(checklistItem)
      .where(eq(checklistItem.taskId, ctx.task.id));
    const ids = new Set(parsed.itemIds);
    if (ids.size !== parsed.itemIds.length || ids.size !== current.length || current.some((c) => !ids.has(c.id))) {
      return { error: 'The checklist changed. Try again.' };
    }
    if (parsed.itemIds.length > 0) {
      await db.batch(
        parsed.itemIds.map((id, position) =>
          db
            .update(checklistItem)
            .set({ position })
            .where(and(eq(checklistItem.id, id), eq(checklistItem.taskId, ctx.task.id))),
        ) as unknown as Parameters<typeof db.batch>[0],
      );
    }
    refresh(ctx);
    return { success: true };
  } catch (error) {
    return toActionError(error, 'Could not reorder the checklist.');
  }
}
