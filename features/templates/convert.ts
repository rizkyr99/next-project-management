import { STATUS_COLOR_KEYS, type StatusColor } from '@/features/projects/status-colors';
import type { Priority } from '@/features/tasks/priority';
import { addDays, dayInZone, daysBetween, timeInZone, zonedInstant } from './dates';
import { MAX_DUE_OFFSET_DAYS, type TemplateData } from './shape';

/**
 * Pure conversions between a project's rows and a template, kept apart from
 * the database so they can be tested on their own.
 */

const asColor = (c: string | null | undefined): StatusColor | null =>
  c && (STATUS_COLOR_KEYS as readonly string[]).includes(c) ? (c as StatusColor) : null;

/**
 * Images in a description point at files of the original project
 * (/api/files/<id>). A new project's clients couldn't open them, and they'd
 * break when the original is deleted, so templates leave them out.
 */
export function stripUploadedImages(markdown: string | null): string | null {
  if (!markdown) return null;
  const out = markdown
    .replace(/!\[[^\]]*\]\(\/api\/files\/[^)\s]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out || null;
}

export interface ProjectRows {
  /** Ordered by column order. */
  statuses: { id: string; name: string; color: string | null; isDefault: boolean | null }[];
  /** Ordered by column, then position. */
  tasks: {
    id: string;
    title: string;
    description: string | null;
    priority: Priority;
    dueDate: Date | null;
    dueHasTime: boolean;
    statusId: string;
  }[];
  labels: { taskId: string; name: string; color: string | null }[];
  /** Ordered by position. */
  checklist: { taskId: string; title: string }[];
}

/**
 * A project as a template. Due dates become days after the earliest one, so
 * the first due date lands on the start day picked when the template is
 * used and the rest keep their spacing. (The project's creation day isn't
 * used: a project set up today for work next month would gain a month.)
 */
export function projectToTemplate(rows: ProjectRows, timeZone: string): TemplateData {
  const columnIndex = new Map(rows.statuses.map((s, i) => [s.id, i]));
  const defaultIndex = Math.max(0, rows.statuses.findIndex((s) => s.isDefault));

  const dueDays = rows.tasks.flatMap((t) => (t.dueDate ? [dayInZone(t.dueDate, timeZone)] : []));
  const start = dueDays.sort()[0];

  const labelsByTask = new Map<string, string[]>();
  const labels = new Map<string, { name: string; color: StatusColor | null }>();
  for (const l of rows.labels) {
    labelsByTask.set(l.taskId, [...(labelsByTask.get(l.taskId) ?? []), l.name]);
    if (!labels.has(l.name.toLowerCase())) labels.set(l.name.toLowerCase(), { name: l.name, color: asColor(l.color) });
  }
  const checklistByTask = new Map<string, string[]>();
  for (const c of rows.checklist) checklistByTask.set(c.taskId, [...(checklistByTask.get(c.taskId) ?? []), c.title]);

  return {
    columns: rows.statuses.map((s, i) => ({ name: s.name, color: asColor(s.color), isDefault: i === defaultIndex })),
    labels: [...labels.values()],
    tasks: rows.tasks.map((t) => {
      const days = t.dueDate && start ? daysBetween(start, dayInZone(t.dueDate, timeZone)) : null;
      return {
        title: t.title,
        description: stripUploadedImages(t.description),
        priority: t.priority,
        column: columnIndex.get(t.statusId) ?? defaultIndex,
        due:
          t.dueDate && days !== null && days <= MAX_DUE_OFFSET_DAYS
            ? { days, time: t.dueHasTime ? timeInZone(t.dueDate, timeZone) : null }
            : null,
        labels: labelsByTask.get(t.id) ?? [],
        checklist: checklistByTask.get(t.id) ?? [],
      };
    }),
  };
}

export interface NewProjectRows {
  statuses: { id: string; projectId: string; name: string; color: StatusColor | null; order: number; isDefault: boolean }[];
  tasks: {
    id: string;
    projectId: string;
    statusId: string;
    title: string;
    description: string | null;
    priority: Priority;
    dueDate: Date | null;
    dueHasTime: boolean;
    order: number;
    updatedAt: null;
  }[];
  labels: { id: string; workspaceId: string; name: string; color: StatusColor | null }[];
  taskLabels: { taskId: string; labelId: string }[];
  checklist: { taskId: string; title: string; position: number }[];
}

/**
 * The rows a new project gets from a template. Labels are matched to the
 * workspace's by name (any capitalisation); missing ones are created while
 * there's room under the workspace's label limit, and dropped after that.
 */
export function templateToRows(
  data: TemplateData,
  opts: {
    projectId: string;
    workspaceId: string;
    /** "YYYY-MM-DD": the day the project starts. */
    startDay: string;
    timeZone: string;
    existingLabels: { id: string; name: string }[];
    labelSlots: number;
    newId?: () => string;
  },
): NewProjectRows {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const statuses = data.columns.map((c, i) => ({
    id: newId(),
    projectId: opts.projectId,
    name: c.name,
    color: c.color,
    order: i + 1,
    isDefault: c.isDefault,
  }));

  const labelId = new Map(opts.existingLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const labels: NewProjectRows['labels'] = [];
  const colorOf = new Map(data.labels.map((l) => [l.name.toLowerCase(), l.color]));
  const resolveLabel = (name: string): string | null => {
    const key = name.toLowerCase();
    const found = labelId.get(key);
    if (found) return found;
    if (labels.length >= opts.labelSlots) return null;
    const id = newId();
    labels.push({ id, workspaceId: opts.workspaceId, name, color: colorOf.get(key) ?? null });
    labelId.set(key, id);
    return id;
  };

  const perColumn = new Map<number, number>();
  const tasks: NewProjectRows['tasks'] = [];
  const taskLabels: NewProjectRows['taskLabels'] = [];
  const checklist: NewProjectRows['checklist'] = [];
  for (const t of data.tasks) {
    const order = (perColumn.get(t.column) ?? 0) + 1;
    perColumn.set(t.column, order);
    const id = newId();
    const day = t.due ? addDays(opts.startDay, t.due.days) : null;
    tasks.push({
      id,
      projectId: opts.projectId,
      statusId: statuses[t.column].id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: day ? zonedInstant(day, opts.timeZone, t.due?.time ?? '00:00') : null,
      dueHasTime: Boolean(t.due?.time),
      order,
      // task.updated_at's $onUpdate would also fire on insert.
      updatedAt: null,
    });
    const seen = new Set<string>();
    for (const name of t.labels) {
      const lid = resolveLabel(name);
      if (lid && !seen.has(lid)) {
        seen.add(lid);
        taskLabels.push({ taskId: id, labelId: lid });
      }
    }
    t.checklist.forEach((title, position) => checklist.push({ taskId: id, title, position }));
  }

  return { statuses, tasks, labels, taskLabels, checklist };
}
