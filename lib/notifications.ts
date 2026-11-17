import { db } from '@/db/drizzle';
import { notification } from '@/db/schema';
import { lt } from 'drizzle-orm';

export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATIONS_PAGE_SIZE = 30;

/** Deletes notifications past the retention window. Run daily by the P3.3 cron. */
export async function deleteExpiredNotifications(now = new Date()) {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(notification)
    .where(lt(notification.createdAt, cutoff))
    .returning({ id: notification.id });
  return deleted.length;
}
