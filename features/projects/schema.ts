import z from 'zod';
import { STATUS_COLOR_KEYS } from './status-colors';

export const createProjectSchema = z.object({
  workspaceSlug: z.string(),
  name: z.string().min(1, 'Project name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().max(500, 'Description must be 500 characters or fewer').optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .optional(),
});

export const deleteProjectSchema = z.object({
  projectId: z.uuid(),
});


/** A project can't grow an unbounded board. */
export const MAX_STATUSES_PER_PROJECT = 20;

const statusName = z
  .string()
  .trim()
  .min(1, 'Column name is required')
  .max(64, 'Column name must be 64 characters or fewer');

export const createStatusSchema = z.object({
  projectId: z.uuid(),
  name: statusName,
});

export const updateStatusSchema = z
  .object({
    statusId: z.uuid(),
    name: statusName.optional(),
    color: z.enum(STATUS_COLOR_KEYS).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, 'Nothing to update');

export const reorderStatusesSchema = z.object({
  projectId: z.uuid(),
  statusIds: z.array(z.uuid()).min(1).max(MAX_STATUSES_PER_PROJECT),
});

export const setDefaultStatusSchema = z.object({ statusId: z.uuid() });

export const deleteStatusSchema = z.object({
  statusId: z.uuid(),
  /** Required when the column has tasks or is the default; becomes the new default. */
  moveTasksTo: z.uuid().optional(),
});
