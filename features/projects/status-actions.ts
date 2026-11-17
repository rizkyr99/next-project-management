'use server';

import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { task, taskStatus } from '@/db/schema';
import {
  AuthzError,
  projectPath,
  requireProjectAccess,
  requireStatusAccess,
  toActionError,
  type ActionResult,
} from '@/lib/authz';
import {
  MAX_STATUSES_PER_PROJECT,
  createStatusSchema,
  deleteStatusSchema,
  reorderStatusesSchema,
  setDefaultStatusSchema,
  updateStatusSchema,
} from './schema';

/**
 * Board column (task_status) management. Any member of the workspace can
 * shape the board: deleting a column never deletes tasks, it moves them.
 */

type Batch = [BatchItem<'pg'>, ...BatchItem<'pg'>[]];

/** A rule the user broke (as opposed to "not found"); its message is shown as-is. */
class ColumnRuleError extends Error {}

function columnError(error: unknown, fallback: string) {
  if (error instanceof ColumnRuleError) return { error: error.message };
  return toActionError(error, fallback);
}

function refresh(workspaceSlug: string, projectId: string) {
  revalidatePath(projectPath(workspaceSlug, projectId));
}

export async function createStatus(
  values: z.infer<typeof createStatusSchema>,
): Promise<ActionResult<{ status: { id: string; name: string; order: number } }>> {
  try {
    const input = createStatusSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);

    const [{ count, maxOrder }] = await db
      .select({ count: sql<number>`count(*)::int`, maxOrder: max(taskStatus.order) })
      .from(taskStatus)
      .where(eq(taskStatus.projectId, ctx.project.id));
    if (count >= MAX_STATUSES_PER_PROJECT) {
      throw new ColumnRuleError(`A project can have at most ${MAX_STATUSES_PER_PROJECT} columns.`);
    }

    const [created] = await db
      .insert(taskStatus)
      .values({ projectId: ctx.project.id, name: input.name, order: (maxOrder ?? 0) + 1 })
      .returning({ id: taskStatus.id, name: taskStatus.name, order: taskStatus.order });

    refresh(ctx.workspace.slug, ctx.project.id);
    return { status: created };
  } catch (error) {
    return columnError(error, 'Failed to add column.');
  }
}

/** Rename and/or recolor a column. */
export async function updateStatus(
  values: z.infer<typeof updateStatusSchema>,
): Promise<ActionResult> {
  try {
    const input = updateStatusSchema.parse(values);
    const ctx = await requireStatusAccess(input.statusId);

    await db
      .update(taskStatus)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      })
      .where(eq(taskStatus.id, ctx.status.id));

    refresh(ctx.workspace.slug, ctx.project.id);
    return { success: true };
  } catch (error) {
    return columnError(error, 'Failed to update column.');
  }
}

/**
 * Persists a new column order. `statusIds` must be exactly the project's
 * columns, so a stale or forged list can't drop or smuggle in columns.
 */
export async function reorderStatuses(
  values: z.infer<typeof reorderStatusesSchema>,
): Promise<ActionResult> {
  try {
    const input = reorderStatusesSchema.parse(values);
    const ctx = await requireProjectAccess(input.projectId);

    const existing = await db
      .select({ id: taskStatus.id })
      .from(taskStatus)
      .where(eq(taskStatus.projectId, ctx.project.id));
    const given = new Set(input.statusIds);
    if (
      given.size !== input.statusIds.length ||
      existing.length !== given.size ||
      existing.some((s) => !given.has(s.id))
    ) {
      throw new ColumnRuleError('The board changed. Refresh and try again.');
    }

    const updates: BatchItem<'pg'>[] = input.statusIds.map((id, index) =>
      db
        .update(taskStatus)
        .set({ order: index + 1 })
        .where(and(eq(taskStatus.id, id), eq(taskStatus.projectId, ctx.project.id))),
    );
    await db.batch(updates as Batch);

    refresh(ctx.workspace.slug, ctx.project.id);
    return { success: true };
  } catch (error) {
    return columnError(error, 'Failed to reorder columns.');
  }
}

/** New tasks created without a column land in the default one. Exactly one per project. */
export async function setDefaultStatus(
  values: z.infer<typeof setDefaultStatusSchema>,
): Promise<ActionResult> {
  try {
    const input = setDefaultStatusSchema.parse(values);
    const ctx = await requireStatusAccess(input.statusId);

    await db.batch([
      db.update(taskStatus).set({ isDefault: false }).where(eq(taskStatus.projectId, ctx.project.id)),
      db.update(taskStatus).set({ isDefault: true }).where(eq(taskStatus.id, ctx.status.id)),
    ]);

    refresh(ctx.workspace.slug, ctx.project.id);
    return { success: true };
  } catch (error) {
    return columnError(error, 'Failed to set default column.');
  }
}

/**
 * Deletes a column. Rules:
 * - a project always keeps at least one column;
 * - a column with tasks needs `moveTasksTo`, and its tasks are appended to
 *   that column in the same transaction as the delete;
 * - deleting the default column needs `moveTasksTo`, which becomes the new
 *   default.
 * The task → column FK is NO ACTION, so the database itself refuses to drop a
 * column that still holds tasks.
 */
export async function deleteStatus(
  values: z.infer<typeof deleteStatusSchema>,
): Promise<ActionResult<{ movedTasks: number }>> {
  try {
    const input = deleteStatusSchema.parse(values);
    const ctx = await requireStatusAccess(input.statusId);

    const columns = await db
      .select({ id: taskStatus.id })
      .from(taskStatus)
      .where(eq(taskStatus.projectId, ctx.project.id))
      .orderBy(asc(taskStatus.order));
    if (columns.length <= 1) {
      throw new ColumnRuleError('A project needs at least one column.');
    }

    const tasksInColumn = await db
      .select({ id: task.id })
      .from(task)
      .where(eq(task.statusId, ctx.status.id))
      .orderBy(asc(task.order));

    const target = input.moveTasksTo;
    if (target !== undefined) {
      if (target === ctx.status.id || !columns.some((c) => c.id === target)) {
        // Another project's column, or itself.
        throw new AuthzError();
      }
    } else if (tasksInColumn.length > 0) {
      throw new ColumnRuleError('Choose a column to move this column\'s tasks to.');
    } else if (ctx.status.isDefault) {
      throw new ColumnRuleError('Choose a new default column before deleting this one.');
    }

    const statements: BatchItem<'pg'>[] = [];
    if (target !== undefined && tasksInColumn.length > 0) {
      // Append after the target's existing tasks, keeping their relative order.
      const [{ maxOrder }] = await db
        .select({ maxOrder: max(task.order) })
        .from(task)
        .where(eq(task.statusId, target));
      const base = (maxOrder ?? 0) + 1;
      statements.push(
        db
          .update(task)
          .set({
            statusId: target,
            order: sql`case ${task.id} ${sql.join(
              // Explicit cast: untyped parameters in CASE are inferred as text.
              tasksInColumn.map((t, i) => sql`when ${t.id} then ${base + i}::int`),
              sql` `,
            )} end`,
          })
          .where(inArray(task.id, tasksInColumn.map((t) => t.id))),
      );
    }
    if (ctx.status.isDefault && target !== undefined) {
      statements.push(db.update(taskStatus).set({ isDefault: true }).where(eq(taskStatus.id, target)));
    }
    statements.push(db.delete(taskStatus).where(eq(taskStatus.id, ctx.status.id)));

    await db.batch(statements as Batch);

    refresh(ctx.workspace.slug, ctx.project.id);
    return { movedTasks: tasksInColumn.length };
  } catch (error) {
    return columnError(error, 'Failed to delete column.');
  }
}
