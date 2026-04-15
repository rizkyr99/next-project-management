'use server';

import { db } from '@/db/drizzle';
import { notification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function getNotifications() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return [];

  return db
    .select()
    .from(notification)
    .where(eq(notification.userId, session.user.id))
    .orderBy(desc(notification.createdAt))
    .limit(20);
}

export async function markAllAsRead() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return;

  await db
    .update(notification)
    .set({ read: true })
    .where(eq(notification.userId, session.user.id));
}

export async function markAsRead(notificationId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return;

  await db
    .update(notification)
    .set({ read: true })
    .where(eq(notification.id, notificationId));
}
