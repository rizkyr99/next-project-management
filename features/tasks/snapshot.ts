import 'server-only';

import { db } from '@/db/drizzle';
import { sql } from 'drizzle-orm';

/**
 * A fingerprint of everything a project's board, list and task panel show:
 * each task's fields, the columns, the assignees and the comments.
 *
 * It's built from the data itself, not from `updated_at`, so every kind of
 * change shows up: edits, moves, reorders, deletes, column renames, and
 * assignee changes, which don't touch `task` at all. A delete followed by a
 * create also shows up, which a count would miss.
 *
 * One query, scoped to the project by indexed columns. Projects are small
 * enough that hashing them every few seconds is cheap.
 */
export async function projectSnapshot(projectId: string): Promise<string> {
  const result = await db.execute<{ snap: string }>(sql`
    select md5(
      coalesce((
        select string_agg(
          concat_ws('|', t.id, t.status_id, t."order", t.title, t.priority, t.due_date, t.due_has_time,
                    md5(coalesce(t.description, '')), t.updated_at),
          ',' order by t.id)
        from task t where t.project_id = ${projectId}
      ), '')
      || '#' || coalesce((
        select string_agg(concat_ws('|', s.id, s.name, s."order", s.color, s.is_default), ',' order by s.id)
        from task_status s where s.project_id = ${projectId}
      ), '')
      || '#' || coalesce((
        select string_agg(a.task_id || ':' || a.user_id, ',' order by a.task_id, a.user_id)
        from task_assignee a join task t on t.id = a.task_id
        where t.project_id = ${projectId}
      ), '')
      || '#' || coalesce((
        select string_agg(concat_ws('|', c.id, md5(c.body), c.updated_at), ',' order by c.id)
        from comment c join task t on t.id = c.task_id
        where t.project_id = ${projectId}
      ), '')
      || '#' || coalesce((
        select string_agg(concat_ws('|', tl.task_id, l.id, l.name, l.color), ',' order by tl.task_id, l.id)
        from task_label tl join task t on t.id = tl.task_id join label l on l.id = tl.label_id
        where t.project_id = ${projectId}
      ), '')
      || '#' || coalesce((
        select string_agg(concat_ws('|', ci.id, ci.task_id, ci.title, ci.done, ci.position), ',' order by ci.id)
        from checklist_item ci join task t on t.id = ci.task_id
        where t.project_id = ${projectId}
      ), '')
      || '#' || coalesce((select name || '|' || coalesce(description, '') from project where id = ${projectId}), '')
    ) as snap
  `);
  return result.rows[0]?.snap ?? '';
}
