'use client';

import { Bell, BellOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationRow,
} from '@/features/notifications/actions';
import { NotificationItem } from '@/features/notifications/components/notification-item';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

type SSERow = NotificationRow & { createdAt: string };

function mergeIncoming(incoming: NotificationRow[], prev: NotificationRow[]): NotificationRow[] {
  const existingIds = new Set(prev.map((n) => n.id));
  const novel = incoming.filter((n) => !existingIds.has(n.id));
  return [...novel, ...prev];
}

function parseSSEData(raw: string): NotificationRow[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type !== 'notifications' || !parsed.data.length) return null;
    return parsed.data.map((n: SSERow) => ({ ...n, createdAt: new Date(n.createdAt) }));
  } catch {
    return null;
  }
}

export function NotificationsPopover() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const source = new EventSource('/api/notifications/stream');

    source.onmessage = (event) => {
      const incoming = parseSSEData(event.data as string);
      if (incoming) {
        setNotifications((prev) => mergeIncoming(incoming, prev));
      }
    };

    return () => source.close();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      startTransition(async () => {
        const data = await getNotifications();
        setNotifications(data);
      });
    }
  };

  function markAllRead(prev: NotificationRow[]): NotificationRow[] {
    return prev.map((n) => ({ ...n, read: true }));
  }

  function markOneRead(id: string, prev: NotificationRow[]): NotificationRow[] {
    return prev.map((n) => (n.id === id ? { ...n, read: true } : n));
  }

  const handleMarkAllAsRead = () => {
    startTransition(async () => {
      await markAllAsRead();
      setNotifications(markAllRead);
    });
  };

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      await markAsRead(id);
      setNotifications((prev) => markOneRead(id, prev));
    });
  };

  const handleOpenItem = (item: NotificationRow, href: string | null) => {
    if (!item.read) handleMarkAsRead(item.id);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          className='relative'
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}>
          <Bell />
          {unreadCount > 0 ? (
            <span className='absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground'>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-96 p-0'>
        <div className='flex items-center justify-between gap-4 px-4 py-2'>
          <h2 className='font-semibold'>Notifications</h2>
          {unreadCount > 0 && (
            <Button
              variant='link'
              size='sm'
              onClick={handleMarkAllAsRead}
              disabled={isPending}>
              Mark all as read
            </Button>
          )}
        </div>
        <div className='max-h-[60vh] overflow-y-auto'>
          {isPending && notifications.length === 0 ? (
            <div className='flex items-center justify-center py-8 text-sm text-muted-foreground'>
              Loading…
            </div>
          ) : null}
          {!isPending && notifications.length === 0 ? (
            <div className='flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground'>
              <BellOff className='size-6' />
              <p className='font-medium text-foreground'>You&apos;re all caught up</p>
              <p className='text-xs'>Assignments, mentions and invites show up here.</p>
            </div>
          ) : null}
          {notifications.map((item) => (
            <NotificationItem key={item.id} item={item} onOpen={handleOpenItem} className='border-t' />
          ))}
        </div>
        <div className='border-t p-1'>
          <Button asChild variant='ghost' size='sm' className='w-full'>
            <Link href='/notifications' onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
