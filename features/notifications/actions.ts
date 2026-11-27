'use server';

import { db } from '@/db/drizzle';
import { notification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/notifications';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

export type NotificationRow = {
  id: string;
  type: (typeof notification.$inferSelect)['type'];
  read: boolean;
  actorName: string | null;
  taskTitle: string | null;
  workspaceName: string | null;
  dueLabel: string | null;
  detail: string | null;
  href: string | null;
  createdAt: Date;
};

const columns = {
  id: notification.id,
  type: notification.type,
  read: notification.read,
  actorName: notification.actorName,
  taskTitle: notification.taskTitle,
  workspaceName: notification.workspaceName,
  dueLabel: notification.dueLabel,
  detail: notification.detail,
  href: notification.href,
  createdAt: notification.createdAt,
};

async function currentUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** The latest notifications, for the header popover. */
export async function getNotifications(): Promise<NotificationRow[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  return db
    .select(columns)
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(20);
}

// "<ISO timestamp>|<id>": (createdAt, id) is unique, so no row is skipped or
// repeated when several share a timestamp.
const cursorSchema = z
  .string()
  .max(200)
  .regex(/^[^|]+\|[^|]+$/)
  .transform((raw) => {
    const [at, id] = raw.split('|');
    return { at: new Date(at), id };
  })
  .refine((c) => !Number.isNaN(c.at.getTime()), 'Invalid cursor');

/** One page of the signed-in user's notifications, newest first. */
export async function listNotifications(
  cursor?: string,
): Promise<{ items: NotificationRow[]; nextCursor: string | null }> {
  const userId = await currentUserId();
  if (!userId) return { items: [], nextCursor: null };

  const parsed = cursor === undefined ? null : cursorSchema.safeParse(cursor);
  if (parsed && !parsed.success) return { items: [], nextCursor: null };
  const after = parsed?.data;

  const rows = await db
    .select(columns)
    .from(notification)
    .where(
      after
        ? and(
            eq(notification.userId, userId),
            or(
              lt(notification.createdAt, after.at),
              and(eq(notification.createdAt, after.at), lt(notification.id, after.id)),
            ),
          )
        : eq(notification.userId, userId),
    )
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(NOTIFICATIONS_PAGE_SIZE + 1);

  const hasMore = rows.length > NOTIFICATIONS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, NOTIFICATIONS_PAGE_SIZE) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export async function markAllAsRead() {
  const userId = await currentUserId();
  if (!userId) return;

  await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.userId, userId), eq(notification.read, false)));
}

export async function markAsRead(notificationId: string) {
  const userId = await currentUserId();
  const id = z.string().min(1).max(64).safeParse(notificationId);
  if (!userId || !id.success) return;

  await db
    .update(notification)
    .set({ read: true })
    // Scoped to the caller so nobody can mark another user's notifications.
    .where(and(eq(notification.id, id.data), eq(notification.userId, userId)));
}
