import z from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  dueDate: z.date().optional(),
  order: z.number(),
  projectId: z.uuid(),
  statusId: z.uuid(),
});
