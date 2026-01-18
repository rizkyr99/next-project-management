import z from 'zod';

export const createProjectSchema = z.object({
  workspaceSlug: z.string(),
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
});
