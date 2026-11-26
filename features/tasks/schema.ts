import z from 'zod';
import { PRIORITIES } from './priority';

export const MAX_DESCRIPTION_LENGTH = 10_000;

/** Trimmed Markdown; an empty description is stored as null. */
const descriptionSchema = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION_LENGTH, `Description must be ${MAX_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters or fewer.`)
  .transform((value) => value || null);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(255, 'Title must be 255 characters or fewer'),
  description: descriptionSchema.optional(),
  dueDate: z.date().optional(),
  order: z.number(),
  projectId: z.uuid(),
  statusId: z.uuid(),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.uuid(),
  statusId: z.uuid(),
  projectId: z.uuid(),
});

// Bounds keep payloads sane while allowing large projects: the board and list
// send whole columns / all selected tasks in one call.
const MAX_TASKS_PER_CALL = 5000;

export const bulkUpdateStatusSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(MAX_TASKS_PER_CALL),
  statusId: z.uuid(),
  projectId: z.uuid(),
});

export const bulkDeleteTasksSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(MAX_TASKS_PER_CALL),
  projectId: z.uuid(),
});

export const reorderTasksSchema = z.object({
  projectId: z.uuid(),
  statusId: z.uuid(),
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        order: z.number().int(),
      }),
    )
    .max(MAX_TASKS_PER_CALL),
});

export const idSchema = z.uuid();

export const updateTaskTitleSchema = z.object({
  taskId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, 'Title must be between 1 and 255 characters.')
    .max(255, 'Title must be between 1 and 255 characters.'),
});

export const updateTaskDescriptionSchema = z.object({
  taskId: z.uuid(),
  description: descriptionSchema,
});

export const deleteTaskSchema = z.object({ taskId: z.uuid() });

export const updateTaskPrioritySchema = z.object({
  taskId: z.uuid(),
  priority: z.enum(PRIORITIES),
});

export const updateTaskDueDateSchema = z.object({
  taskId: z.uuid(),
  dueDate: z.date().nullable(),
  /** Due at that time (true), or just on that day (false). */
  hasTime: z.boolean().default(false),
});

export const updateTaskStartDateSchema = z.object({
  taskId: z.uuid(),
  /** B4: a calendar day ("YYYY-MM-DD"), or null to clear it. */
  startDate: z.iso.date('Pick a valid start date.').nullable(),
});

export const updateTaskAssigneesSchema = z.object({
  taskId: z.uuid(),
  // Better Auth user IDs are not UUIDs.
  assigneeIds: z.array(z.string().min(1).max(64)).max(50),
});

export const commentBodySchema = z
  .string()
  .trim()
  .min(1, 'Comment must be between 1 and 2000 characters.')
  .max(2000, 'Comment must be between 1 and 2000 characters.');
