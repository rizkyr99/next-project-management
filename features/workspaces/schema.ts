import z from 'zod';

export const workspaceFormSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  url: z
    .string()
    .min(1, 'Workspace URL is required')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'URL must contain only lowercase letters, numbers, and hyphens'
    ),
  description: z.string().optional(),
});
