import { db } from '@/db/drizzle';
import { checklistItem, label, task, taskAssignee, taskLabel, taskStatus, user } from '@/db/schema';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { exportFileName, exportRows, toCsv, type ExportTask } from '@/features/import/csv';
import { dayInZone, safeTimeZone, timeInZone } from '@/features/templates/dates';
import { asc, eq, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * D4: a project's tasks as CSV, column by column in board order, with dates
 * in the viewer's time zone (`?tz=`). Team members only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const ctx = await requireProjectAccess(projectId);
    const timeZone = safeTimeZone(new URL(request.url).searchParams.get('tz'));

    const tasks = await db
      .select({
        id: task.id,
        title: task.title,
        column: taskStatus.name,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        dueHasTime: task.dueHasTime,
        description: task.description,
      })
      .from(task)
      .innerJoin(taskStatus, eq(taskStatus.id, task.statusId))
      .where(eq(task.projectId, ctx.project.id))
      .orderBy(asc(taskStatus.order), asc(task.order));

    const ids = tasks.map((t) => t.id);
    const [assignees, labels, checklist] = ids.length
      ? await Promise.all([
          db
            .select({ taskId: taskAssignee.taskId, name: user.name })
            .from(taskAssignee)
            .innerJoin(user, eq(user.id, taskAssignee.userId))
            .where(inArray(taskAssignee.taskId, ids))
            .orderBy(asc(user.name)),
          db
            .select({ taskId: taskLabel.taskId, name: label.name })
            .from(taskLabel)
            .innerJoin(label, eq(label.id, taskLabel.labelId))
            .where(inArray(taskLabel.taskId, ids))
            .orderBy(asc(label.name)),
          db
            .select({ taskId: checklistItem.taskId, title: checklistItem.title, done: checklistItem.done })
            .from(checklistItem)
            .where(inArray(checklistItem.taskId, ids))
            .orderBy(asc(checklistItem.position)),
        ])
      : [[], [], []];

    const group = <T extends { taskId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) map.set(r.taskId, [...(map.get(r.taskId) ?? []), r]);
      return map;
    };
    const assigneesOf = group(assignees);
    const labelsOf = group(labels);
    const checklistOf = group(checklist);

    const rows: ExportTask[] = tasks.map((t) => ({
      title: t.title,
      column: t.column,
      priority: t.priority,
      startDay: t.startDate,
      dueDay: t.dueDate ? dayInZone(t.dueDate, timeZone) : null,
      dueTime: t.dueDate && t.dueHasTime ? timeInZone(t.dueDate, timeZone) : null,
      assignees: (assigneesOf.get(t.id) ?? []).map((a) => a.name),
      labels: (labelsOf.get(t.id) ?? []).map((l) => l.name),
      checklist: (checklistOf.get(t.id) ?? []).map((i) => ({ title: i.title, done: i.done })),
      description: t.description,
    }));

    return new Response(toCsv(exportRows(rows)), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(ctx.project.name)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
