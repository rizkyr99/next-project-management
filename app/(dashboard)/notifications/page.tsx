import { listNotifications } from '@/features/notifications/actions';
import { NotificationsList } from '@/features/notifications/components/notifications-list';
import { getSession } from '@/lib/auth-session';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackURL=%2Fnotifications');

  const { items, nextCursor } = await listNotifications();

  return (
    <div className='max-w-2xl mx-auto py-8 px-4 space-y-6'>
      <div>
        <Link
          href='/'
          className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4'>
          <ArrowLeft className='size-4' />
          Back to dashboard
        </Link>
        <h1 className='text-2xl font-semibold'>Notifications</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Everything from the last 90 days. Click one to open what it&apos;s about.
        </p>
      </div>
      <NotificationsList initialItems={items} initialNextCursor={nextCursor} />
    </div>
  );
}
