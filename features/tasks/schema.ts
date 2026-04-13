import z from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
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
  taskIds: z.array(z.uuid()).min(1),
  statusId: z.uuid(),
  projectId: z.uuid(),
});

export const bulkDeleteTasksSchema = z.object({
  taskIds: z.array(z.uuid()).min(1),
  projectId: z.uuid(),
});

export const reorderTasksSchema = z.object({
  projectId: z.uuid(),
  statusId: z.uuid(),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      order: z.number(),
    }),
  ),
});
