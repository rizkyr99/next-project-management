import z from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(255, 'Title must be 255 characters or fewer'),
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

export const bulkUpdateStatusSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(500),
  statusId: z.uuid(),
  projectId: z.uuid(),
});

export const bulkDeleteTasksSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(500),
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
    .max(1000),
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

export const updateTaskPrioritySchema = z.object({
  taskId: z.uuid(),
  priority: z.enum(['low', 'medium', 'high']),
});

export const updateTaskDueDateSchema = z.object({
  taskId: z.uuid(),
  dueDate: z.date().nullable(),
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
