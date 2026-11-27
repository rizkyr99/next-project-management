import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { task } from '@/db/schema';

/**
 * Locks a task's row for the rest of a `db.batch` (one transaction). Put it
 * first: a write that depends on the task's visibility (C2) then waits for any
 * concurrent hide/show to commit, and its own condition sees the result.
 */
export function lockTask(taskId: string) {
  return db.select({ id: task.id }).from(task).where(eq(task.id, taskId)).for('update');
}
