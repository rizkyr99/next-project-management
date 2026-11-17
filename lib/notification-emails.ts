import 'server-only';
import { db } from '@/db/drizzle';
import { user, userPreferences } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { APP_URL, sendTaskNotificationEmail } from '@/lib/email';

export type TaskEmailKind = 'assigned' | 'mentioned';

/**
 * Of `userIds`, who should get an email of this kind: verified addresses
 * only (P3.2), and only if they haven't turned it off (a missing
 * preferences row means the default, which is on).
 */
export async function emailRecipients(userIds: string[], kind: TaskEmailKind) {
  if (userIds.length === 0) return [];
  const pref = kind === 'assigned' ? userPreferences.emailOnAssign : userPreferences.emailOnMention;
  return db
    .select({ id: user.id, email: user.email })
    .from(user)
    .leftJoin(userPreferences, eq(userPreferences.userId, user.id))
    .where(and(inArray(user.id, userIds), eq(user.emailVerified, true), sql`coalesce(${pref}, true)`));
}

const MAX_EXCERPT = 280;

/**
 * Emails the assignment or mention to everyone who wants it. Meant to run in
 * `after()`, once the action has responded, and never throws: email is a
 * courtesy on top of the in-app notification, which is already saved.
 */
export async function emailTaskNotification({
  kind,
  userIds,
  actorName,
  taskTitle,
  href,
  excerpt,
}: {
  kind: TaskEmailKind;
  userIds: string[];
  actorName: string;
  taskTitle: string;
  /** App-relative task link, e.g. /workspaces/acme/projects/p?task=t */
  href: string;
  excerpt?: string;
}) {
  try {
    const recipients = await emailRecipients(userIds, kind);
    const trimmed =
      excerpt && excerpt.length > MAX_EXCERPT ? `${excerpt.slice(0, MAX_EXCERPT - 1)}…` : excerpt;
    await Promise.all(
      recipients.map((r) =>
        sendTaskNotificationEmail(r.email, {
          kind,
          actorName,
          taskTitle,
          excerpt: trimmed,
          taskUrl: `${APP_URL}${href}`,
        }),
      ),
    );
  } catch (error) {
    console.error('[email] task notification emails failed:', error);
  }
}
