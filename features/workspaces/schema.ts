import z from 'zod';

export const workspaceFormSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Name must be 100 characters or fewer'),
  url: z
    .string()
    .min(1, 'Workspace URL is required')
    .max(100, 'URL must be 100 characters or fewer')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'URL must contain only lowercase letters, numbers, and hyphens',
    ),
  description: z.string().max(500, 'Description must be 500 characters or fewer').optional(),
});

export const inviteMemberSchema = z.object({
  workspaceSlug: z.string().min(1, 'Workspace is required'),
  email: z.email('Enter a valid email'),
  role: z.enum(['admin', 'member']),
});
