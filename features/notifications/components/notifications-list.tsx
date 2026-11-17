'use client';

import { Button } from '@/components/ui/button';
import { BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { listNotifications, markAllAsRead, markAsRead, type NotificationRow } from '../actions';
import { NotificationItem } from './notification-item';

/** The full, paginated notification list on /notifications. */
export function NotificationsList({
  initialItems,
  initialNextCursor,
}: {
  initialItems: NotificationRow[];
  initialNextCursor: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [isLoading, startLoading] = useTransition();
  const [isMarking, startMarking] = useTransition();
  const unread = items.some((n) => !n.read);

  const loadMore = () =>
    startLoading(async () => {
      if (!cursor) return;
      try {
        const page = await listNotifications(cursor);
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      } catch {
        toast.error('Failed to load more notifications.', { position: 'top-center' });
      }
    });

  const markAll = () =>
    startMarking(async () => {
      await markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    });

  const open = (item: NotificationRow, href: string | null) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      void markAsRead(item.id);
    }
    if (href) router.push(href);
  };

  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 rounded-lg border py-16 text-center text-sm text-muted-foreground'>
        <BellOff className='size-8' />
        <p className='font-medium text-foreground'>No notifications</p>
        <p>When someone assigns you a task, mentions you or invites you, it shows up here.</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button variant='outline' size='sm' onClick={markAll} disabled={!unread || isMarking}>
          Mark all as read
        </Button>
      </div>
      <div className='divide-y rounded-lg border overflow-hidden'>
        {items.map((item) => (
          <NotificationItem key={item.id} item={item} onOpen={open} />
        ))}
      </div>
      {cursor && (
        <div className='flex justify-center'>
          <Button variant='outline' size='sm' onClick={loadMore} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
