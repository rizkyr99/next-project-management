import { z } from 'zod';
import { STATUS_COLOR_KEYS } from '@/features/projects/status-colors';
import { PRIORITIES } from '@/features/tasks/priority';
import { MAX_LABELS_PER_TASK, MAX_LABELS_PER_WORKSPACE } from '@/features/labels/schema';
import { MAX_STATUSES_PER_PROJECT } from '@/features/projects/schema';
import { MAX_DESCRIPTION_LENGTH } from '@/features/tasks/schema';

/**
 * A project template (B5): the shape of a project without its people,
 * comments or history. Saved templates store this as JSON; the built-in
 * ones are written in code. Due dates are kept as days after the project's
 * start, so a template can be started on any day.
 */

export const MAX_TEMPLATE_TASKS = 300;
export const MAX_TEMPLATE_CHECKLIST_ITEMS = 2000;
export const MAX_TEMPLATES_PER_WORKSPACE = 50;
/** Ten years: a due date further out than this is a typo. */
export const MAX_DUE_OFFSET_DAYS = 3650;

const color = z.enum(STATUS_COLOR_KEYS).nullable();

export const templateColumnSchema = z.object({
  name: z.string().trim().min(1).max(64),
  color,
  isDefault: z.boolean(),
});

export const templateLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color,
});

export const templateTaskSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable(),
  priority: z.enum(PRIORITIES),
  /** Index into `columns`. */
  column: z.number().int().min(0),
  /** Days after the start; `time` ("HH:MM") when due at a time of day. */
  due: z
    .object({
      days: z.number().int().min(0).max(MAX_DUE_OFFSET_DAYS),
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable(),
    })
    .nullable(),
  /** B4: start day, as days after the start. Older templates don't have it. */
  start: z
    .object({ days: z.number().int().min(0).max(MAX_DUE_OFFSET_DAYS) })
    .nullable()
    .optional(),
  /** Label names, matched to the workspace's labels when the template is used. */
  labels: z.array(z.string().trim().min(1).max(40)).max(MAX_LABELS_PER_TASK),
  checklist: z.array(z.string().trim().min(1).max(255)).max(100),
});

export const templateDataSchema = z
  .object({
    columns: z.array(templateColumnSchema).min(1).max(MAX_STATUSES_PER_PROJECT),
    labels: z.array(templateLabelSchema).max(MAX_LABELS_PER_WORKSPACE),
    tasks: z.array(templateTaskSchema).max(MAX_TEMPLATE_TASKS),
  })
  .refine((d) => d.columns.filter((c) => c.isDefault).length === 1, 'A template needs exactly one default column.')
  .refine((d) => d.tasks.every((t) => t.column < d.columns.length), 'A task points at a missing column.')
  .refine(
    (d) => d.tasks.reduce((n, t) => n + t.checklist.length, 0) <= MAX_TEMPLATE_CHECKLIST_ITEMS,
    `A template can hold up to ${MAX_TEMPLATE_CHECKLIST_ITEMS} checklist items.`,
  );

export type TemplateData = z.infer<typeof templateDataSchema>;
export type TemplateTask = z.infer<typeof templateTaskSchema>;

/** What the "Start from" picker shows. Built-in ids start with "builtin:". */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  taskCount: number;
}

export const BUILTIN_PREFIX = 'builtin:';
