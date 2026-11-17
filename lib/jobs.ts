import 'server-only';
import { db } from '@/db/drizzle';
import { sql } from 'drizzle-orm';
import { deleteExpiredNotifications } from '@/lib/notifications';

/** Reminder window. The job runs daily (Vercel Hobby crons), so look 48 h ahead. */
export const DUE_SOON_WINDOW_HOURS = 48;

/**
 * Inserts one `due_soon` notification per assignee per task due within the
 * window, skipping tasks in their project's last column (treated as done).
 *
 * Idempotent: each assignee row records the due date it was reminded about
 * (`due_soon_notified_for`), set in the same statement as the insert, so a
 * re-run (or an overlapping run, thanks to SKIP LOCKED) sends nothing twice.
 * Moving the due date makes the task eligible again.
 */
export async function sendDueSoonReminders(now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + DUE_SOON_WINDOW_HOURS * 60 * 60 * 1000);
  const result = await db.execute<{ inserted: number }>(sql`
    with due as (
      select ta.task_id, ta.user_id, t.title, t.due_date, t.project_id, p.workspace_id, w.slug
      from task_assignee ta
      join task t on t.id = ta.task_id
      join project p on p.id = t.project_id
      join workspace w on w.id = p.workspace_id
      -- Only current members get reminders.
      join member m on m.workspace_id = p.workspace_id and m.user_id = ta.user_id
      where t.due_date > ${now.toISOString()}::timestamptz
        and t.due_date <= ${until.toISOString()}::timestamptz
        and ta.due_soon_notified_for is distinct from t.due_date
        and t.status_id <> (
          select s.id from task_status s
          where s.project_id = t.project_id
          order by s."order" desc
          limit 1
        )
      for update of ta skip locked
    ), marked as (
      update task_assignee ta
      set due_soon_notified_for = due.due_date
      from due
      where ta.task_id = due.task_id and ta.user_id = due.user_id
      returning ta.task_id, ta.user_id
    ), inserted as (
      insert into notification (id, user_id, type, task_title, due_label, workspace_id, project_id, task_id, href)
      select
        gen_random_uuid()::text,
        due.user_id,
        'due_soon',
        due.title,
        to_char(due.due_date at time zone 'UTC', '"on" Mon FMDD'),
        due.workspace_id,
        due.project_id,
        due.task_id,
        '/workspaces/' || due.slug || '/projects/' || due.project_id || '?task=' || due.task_id
      from due
      join marked on marked.task_id = due.task_id and marked.user_id = due.user_id
      returning 1
    )
    select count(*)::int as inserted from inserted
  `);
  return Number(result.rows[0]?.inserted ?? 0);
}

export interface CleanupResult {
  invitesExpired: number;
  signalsDeleted: number;
  staleParticipantsDeleted: number;
  verificationsDeleted: number;
  notificationsDeleted: number;
}

/** Housekeeping that would otherwise grow forever or leave stale state behind. */
export async function runCleanup(now = new Date()): Promise<CleanupResult> {
  const iso = now.toISOString();
  const [invites, signals, participants, verifications] = await Promise.all([
    // Pending invites past their expiry show as "expired" everywhere already;
    // this makes the stored status match.
    db.execute(sql`
      update workspace_invite set status = 'expired'
      where status = 'pending' and expires_at < ${iso}::timestamptz
    `),
    // WebRTC signalling is only useful for seconds.
    db.execute(sql`delete from webrtc_signal where created_at < ${iso}::timestamptz - interval '1 hour'`),
    // Call presence: a participant that hasn't pinged for 2 minutes has left.
    db.execute(sql`delete from call_participant where last_seen < ${iso}::timestamptz - interval '2 minutes'`),
    // Spent or expired auth tokens (password reset).
    db.execute(sql`delete from verification where expires_at < ${iso}::timestamptz`),
  ]);
  const notificationsDeleted = await deleteExpiredNotifications(now);
  return {
    invitesExpired: invites.rowCount ?? 0,
    signalsDeleted: signals.rowCount ?? 0,
    staleParticipantsDeleted: participants.rowCount ?? 0,
    verificationsDeleted: verifications.rowCount ?? 0,
    notificationsDeleted,
  };
}
