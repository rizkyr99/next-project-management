import z from 'zod';

export const createProjectSchema = z.object({
  workspaceSlug: z.string(),
  name: z.string().min(1, 'Project name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().max(500, 'Description must be 500 characters or fewer').optional(),
});
