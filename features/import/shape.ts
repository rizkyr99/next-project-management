import { z } from 'zod';
import { STATUS_COLOR_KEYS, type StatusColor } from '@/features/projects/status-colors';
import { MAX_STATUSES_PER_PROJECT } from '@/features/projects/schema';
import { PRIORITIES, type Priority } from '@/features/tasks/priority';
import { MAX_DESCRIPTION_LENGTH } from '@/features/tasks/schema';
import { MAX_LABELS_PER_TASK } from '@/features/labels/schema';
import { zonedInstant } from '@/features/templates/dates';

/**
 * D4: what the import route accepts (the browser's parse of a Trello or CSV
 * file), checked again on the server, and how it becomes rows.
 */

export const MAX_IMPORT_TASKS = 1000;
export const MAX_IMPORT_CHECKLIST_ITEMS = 5000;

const day = z.iso.date();
const color = z.enum(STATUS_COLOR_KEYS).nullable();

export const importSchema = z
  .object({
    workspaceSlug: z.string().min(1).max(100),
    name: z.string().trim().min(1, 'Name the project.').max(100, 'Name must be 100 characters or fewer'),
    description: z.string().trim().max(500, 'Description must be 500 characters or fewer').optional(),
    timeZone: z.string().max(64).optional(),
    source: z.enum(['trello', 'csv']),
    columns: z
      .array(z.object({ name: z.string().trim().min(1).max(64), color }))
      .min(1)
      .max(MAX_STATUSES_PER_PROJECT),
    labels: z.array(z.object({ name: z.string().trim().min(1).max(40), color })).max(500),
    tasks: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(255),
          description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable(),
          priority: z.enum(PRIORITIES),
          column: z.number().int().min(0),
          startDay: day.nullable(),
          due: z
            .object({
              day,
              time: z
                .string()
                .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
                .nullable(),
            })
            .nullable(),
          labels: z.array(z.string().trim().min(1).max(40)).max(MAX_LABELS_PER_TASK),
          checklist: z.array(z.object({ title: z.string().trim().min(1).max(255), done: z.boolean() })).max(200),
        }),
      )
      .max(MAX_IMPORT_TASKS, `A project can be imported with up to ${MAX_IMPORT_TASKS} tasks.`),
  })
  .refine((d) => d.tasks.every((t) => t.column < d.columns.length), 'A task points at a missing column.')
  .refine(
    (d) => d.tasks.reduce((n, t) => n + t.checklist.length, 0) <= MAX_IMPORT_CHECKLIST_ITEMS,
    `A project can be imported with up to ${MAX_IMPORT_CHECKLIST_ITEMS} checklist items.`,
  );

export type ImportInput = z.output<typeof importSchema>;

export interface ImportRows {
  statuses: { id: string; projectId: string; name: string; color: StatusColor | null; order: number; isDefault: boolean }[];
  tasks: {
    id: string;
    projectId: string;
    statusId: string;
    title: string;
    description: string | null;
    priority: Priority;
    startDate: string | null;
    dueDate: Date | null;
    dueHasTime: boolean;
    order: number;
    updatedAt: null;
  }[];
  labels: { id: string; workspaceId: string; name: string; color: StatusColor | null }[];
  taskLabels: { taskId: string; labelId: string }[];
  checklist: { taskId: string; title: string; done: boolean; position: number }[];
  /** Label names dropped because the workspace's label limit was reached. */
  labelsLeftOff: string[];
}

/**
 * The rows for an imported project. The first column becomes the default
 * (where new tasks land). Labels are matched to the workspace's by name and
 * created while there's room under its label limit; after that they're left
 * off. A start after the due day is dropped, so ranges run forwards.
 */
export function importToRows(
  data: ImportInput,
  opts: {
    projectId: string;
    workspaceId: string;
    timeZone: string;
    existingLabels: { id: string; name: string }[];
    labelSlots: number;
    newId?: () => string;
  },
): ImportRows {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const statuses = data.columns.map((c, i) => ({
    id: newId(),
    projectId: opts.projectId,
    name: c.name,
    color: c.color,
    order: i + 1,
    isDefault: i === 0,
  }));

  const labelId = new Map(opts.existingLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const colorOf = new Map(data.labels.map((l) => [l.name.toLowerCase(), l.color]));
  const labels: ImportRows['labels'] = [];
  const leftOff = new Set<string>();
  const resolveLabel = (name: string) => {
    const key = name.toLowerCase();
    const found = labelId.get(key);
    if (found) return found;
    if (labels.length >= opts.labelSlots) {
      leftOff.add(name);
      return null;
    }
    const id = newId();
    labels.push({ id, workspaceId: opts.workspaceId, name, color: colorOf.get(key) ?? null });
    labelId.set(key, id);
    return id;
  };

  const perColumn = new Map<number, number>();
  const rows: ImportRows = { statuses, tasks: [], labels, taskLabels: [], checklist: [], labelsLeftOff: [] };
  for (const t of data.tasks) {
    const order = (perColumn.get(t.column) ?? 0) + 1;
    perColumn.set(t.column, order);
    const id = newId();
    rows.tasks.push({
      id,
      projectId: opts.projectId,
      statusId: statuses[t.column].id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      startDate: t.startDay && (!t.due || t.startDay <= t.due.day) ? t.startDay : null,
      dueDate: t.due ? zonedInstant(t.due.day, opts.timeZone, t.due.time ?? '00:00') : null,
      dueHasTime: Boolean(t.due?.time),
      order,
      updatedAt: null,
    });
    const seen = new Set<string>();
    for (const name of t.labels) {
      const lid = resolveLabel(name);
      if (lid && !seen.has(lid)) {
        seen.add(lid);
        rows.taskLabels.push({ taskId: id, labelId: lid });
      }
    }
    t.checklist.forEach((item, position) => rows.checklist.push({ taskId: id, title: item.title, done: item.done, position }));
  }
  rows.labelsLeftOff = [...leftOff];
  return rows;
}
