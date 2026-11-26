import 'server-only';
import { db } from '@/db/drizzle';
import { sql } from 'drizzle-orm';
import { deleteExpiredNotifications } from '@/lib/notifications';
import { APP_URL, sendDailyDigestEmail, sendTrialNoticeEmail } from '@/lib/email';
import { PLAN_DETAILS, TRIAL_REMINDER_DAYS } from '@/lib/plans';

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
      where p.archived_at is null
        and t.due_date > ${now.toISOString()}::timestamptz
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

/** Items listed in a digest email; the rest are summarised as "…and N more". */
const DIGEST_MAX_ITEMS = 10;

function digestLine(n: {
  type: string;
  actorName: string | null;
  taskTitle: string | null;
  workspaceName: string | null;
  dueLabel: string | null;
}) {
  switch (n.type) {
    case 'task_assigned':
      return `${n.actorName ?? 'Someone'} assigned you to ${n.taskTitle ?? 'a task'}`;
    case 'comment_mention':
      return `${n.actorName ?? 'Someone'} mentioned you in ${n.taskTitle ?? 'a task'}`;
    case 'workspace_invite':
      return `${n.actorName ?? 'Someone'} invited you to ${n.workspaceName ?? 'a workspace'}`;
    case 'due_soon':
      return `${n.taskTitle ?? 'A task'} is due ${n.dueLabel ?? 'soon'}`;
    case 'approval_requested':
      return `${n.actorName ?? 'Someone'} asked for your approval on ${n.taskTitle ?? 'a task'}`;
    case 'task_approved':
      return `${n.actorName ?? 'Someone'} approved ${n.taskTitle ?? 'a task'}`;
    case 'changes_requested':
      return `${n.actorName ?? 'Someone'} requested changes to ${n.taskTitle ?? 'a task'}`;
    default:
      return 'New notification';
  }
}

export interface DigestResult {
  /** Users whose digest window was processed this run. */
  checked: number;
  /** Digest emails actually sent (users with unread notifications). */
  sent: number;
}

/**
 * Opt-in daily digest (P3.4): unread notifications since the user's last
 * digest (or the last 24 h), for verified users who turned it on.
 *
 * Each user is claimed by moving `digest_last_sent_at` to the database's
 * `now()` in one statement (SKIP LOCKED, and only if the last one is 20 h+
 * old), so overlapping runs can't email anyone twice. That same `now()` is
 * the digest's cutoff: it's read after the due-soon reminders were inserted,
 * so today's reminders are always included.
 *
 * If building or sending a user's digest fails, their cursor is moved back
 * (compare-and-set), so the window is retried on the next run instead of
 * being skipped. One user's failure never stops the others.
 */
export async function sendDailyDigests(): Promise<DigestResult> {
  const claimed = await db.execute<{
    user_id: string;
    email: string;
    name: string;
    since: string;
    prev: string | null;
    cutoff: string;
  }>(sql`
    with due as (
      select up.user_id, up.digest_last_sent_at as prev,
             coalesce(up.digest_last_sent_at, now() - interval '24 hours') as since
      from user_preferences up
      join "user" u on u.id = up.user_id
      where up.email_digest
        and u.email_verified
        and (up.digest_last_sent_at is null or up.digest_last_sent_at < now() - interval '20 hours')
      for update of up skip locked
    )
    update user_preferences up
    set digest_last_sent_at = now()
    from due join "user" u on u.id = due.user_id
    where up.user_id = due.user_id
    returning up.user_id, u.email, u.name, due.since, due.prev, up.digest_last_sent_at as cutoff
  `);

  let sent = 0;
  for (const row of claimed.rows) {
    let delivered = false;
    try {
      const items = await db.execute<{
        type: string;
        actor_name: string | null;
        task_title: string | null;
        workspace_name: string | null;
        due_label: string | null;
        href: string | null;
        total: number;
      }>(sql`
        select type, actor_name, task_title, workspace_name, due_label, href,
               count(*) over ()::int as total
        from notification
        where user_id = ${row.user_id}
          and read = false
          and created_at > ${row.since}::timestamptz
          and created_at <= ${row.cutoff}::timestamptz
        order by created_at desc
        limit ${DIGEST_MAX_ITEMS}
      `);
      const total = Number(items.rows[0]?.total ?? 0);
      if (total === 0) continue; // nothing to send: keep the cursor moved

      const result = await sendDailyDigestEmail(row.email, {
        name: row.name,
        total,
        items: items.rows.map((n) => ({
          text: digestLine({
            type: n.type,
            actorName: n.actor_name,
            taskTitle: n.task_title,
            workspaceName: n.workspace_name,
            dueLabel: n.due_label,
          }),
          url: `${APP_URL}${n.href && n.href.startsWith('/') && !n.href.startsWith('//') ? n.href : '/notifications'}`,
        })),
      });
      delivered = result.sent;
      if (delivered) sent += 1;
    } catch (error) {
      console.error('[cron] digest failed for a user:', error);
    }
    if (!delivered) await releaseDigestClaim(row.user_id, row.cutoff, row.prev);
  }
  return { checked: claimed.rows.length, sent };
}

/** Puts a user's digest cursor back, unless something else has moved it since. */
async function releaseDigestClaim(userId: string, claimedAt: string, prev: string | null) {
  try {
    await db.execute(sql`
      update user_preferences
      set digest_last_sent_at = ${prev}::timestamptz
      where user_id = ${userId} and digest_last_sent_at = ${claimedAt}::timestamptz
    `);
  } catch (error) {
    console.error('[cron] could not release digest claim:', error);
  }
}

export interface TrialNoticeResult {
  ending: number;
  ended: number;
}

type TrialNoticeRow = {
  id: string;
  name: string;
  slug: string;
  trial_ends_at: string;
  email: string;
  owner_name: string;
  team: number;
};

/**
 * E2: emails a workspace's owner TRIAL_REMINDER_DAYS before its Pro trial
 * ends, and once it has ended, unless the workspace pays by then. Each
 * notice is claimed in the same statement that finds it (a re-run or an
 * overlapping run sends nothing twice), and released if the email fails,
 * so the next run retries. A trial that ended over a week ago gets no
 * "ended" email: that news is stale.
 */
export async function sendTrialNotices(now = new Date()): Promise<TrialNoticeResult> {
  const result: TrialNoticeResult = { ending: 0, ended: 0 };
  const at = now.toISOString();
  for (const kind of ['ending', 'ended'] as const) {
    const column = sql.raw(kind === 'ending' ? 'trial_reminder_sent_at' : 'trial_ended_sent_at');
    const window =
      kind === 'ending'
        ? sql`w.trial_ends_at > ${at}::timestamptz and w.trial_ends_at <= ${at}::timestamptz + make_interval(days => ${TRIAL_REMINDER_DAYS})`
        : sql`w.trial_ends_at <= ${at}::timestamptz and w.trial_ends_at > ${at}::timestamptz - interval '7 days'`;
    const claimed = await db.execute<TrialNoticeRow>(sql`
      with due as (
        select w.id
        from workspace w
        join "user" u on u.id = w.user_id
        left join subscription s on s.workspace_id = w.id
        where ${window}
          and w.${column} is null
          and u.email_verified
          and not coalesce(s.status in ('active', 'trialing', 'past_due') and s.plan = 'pro', false)
        for update of w skip locked
      )
      update workspace w
      set ${column} = ${at}::timestamptz
      from due, "user" u
      where w.id = due.id and u.id = w.user_id
      returning w.id, w.name, w.slug, w.trial_ends_at, u.email, u.name as owner_name,
        (select count(*)::int from member m where m.workspace_id = w.id and m.role <> 'guest') as team
    `);
    for (const row of claimed.rows) {
      if (await deliverTrialNotice(kind, row)) result[kind] += 1;
      else await releaseTrialNotice(column, row.id, at);
    }
  }
  return result;
}

async function deliverTrialNotice(kind: 'ending' | 'ended', row: TrialNoticeRow): Promise<boolean> {
  const seats = Math.max(1, Number(row.team));
  const price = PLAN_DETAILS.pro.priceMonthly;
  try {
    const { sent } = await sendTrialNoticeEmail(row.email, {
      kind,
      ownerName: row.owner_name.split(' ')[0] || row.owner_name,
      workspaceName: row.name,
      endsOn: new Date(row.trial_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
      priceLine: `$${seats * price} a month (${seats} team ${seats === 1 ? 'member' : 'members'} × $${price})`,
      billingUrl: `${APP_URL}/workspaces/${row.slug}/settings?tab=billing`,
    });
    return sent;
  } catch (error) {
    console.error(`[cron] trial ${kind} email failed:`, error);
    return false;
  }
}

/**
 * Puts a trial notice back for the next run, unless something moved it
 * since. Compared against the value this run wrote (`claimedAt`, an ISO
 * string), not one read back from the driver, whose format can differ.
 */
async function releaseTrialNotice(column: ReturnType<typeof sql.raw>, workspaceId: string, claimedAt: string) {
  try {
    await db.execute(
      sql`update workspace set ${column} = null where id = ${workspaceId} and ${column} = ${claimedAt}::timestamptz`,
    );
  } catch (error) {
    console.error('[cron] could not release trial notice claim:', error);
  }
}
