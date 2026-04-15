'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, Clock3, MessageSquare, UserPlus, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
} from '@/features/notifications/actions';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

function renderNotificationContent(item: NotificationRow) {
  switch (item.type) {
    case 'task_assigned':
      return {
        icon: <UserPlus className='size-5 text-muted-foreground' />,
        title: 'Task assigned to you',
        description: (
          <>
            <span className='text-foreground font-medium'>{item.actorName}</span>{' '}
            assigned you to{' '}
            <span className='text-foreground font-medium'>{item.taskTitle}</span>
          </>
        ),
      };
    case 'workspace_invite':
      return {
        icon: <Users className='size-5 text-muted-foreground' />,
        title: 'Added to workspace',
        description: (
          <>
            <span className='text-foreground font-medium'>{item.actorName}</span>{' '}
            added you to{' '}
            <span className='text-foreground font-medium'>{item.workspaceName}</span>
          </>
        ),
      };
    case 'comment_mention':
      return {
        icon: <MessageSquare className='size-5 text-muted-foreground' />,
        title: 'You were mentioned',
        description: (
          <>
            <span className='text-foreground font-medium'>{item.actorName}</span>{' '}
            mentioned you in{' '}
            <span className='text-foreground font-medium'>{item.taskTitle}</span>
          </>
        ),
      };
    case 'due_soon':
      return {
        icon: <Clock3 className='size-5 text-muted-foreground' />,
        title: 'Due date reminder',
        description: (
          <>
            <span className='text-foreground font-medium'>{item.taskTitle}</span> is
            due {item.dueLabel}
          </>
        ),
      };
  }
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isPending, startTransition] = useTransition();

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

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='icon-sm' className='relative'>
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
        <div>
          {isPending && notifications.length === 0 ? (
            <div className='flex items-center justify-center py-8 text-sm text-muted-foreground'>
              Loading…
            </div>
          ) : null}
          {!isPending && notifications.length === 0 ? (
            <div className='flex items-center justify-center py-8 text-sm text-muted-foreground'>
              No notifications yet
            </div>
          ) : null}
          {notifications.map((item) => {
            const content = renderNotificationContent(item);
            const unread = !item.read;
            return (
              <button
                key={item.id}
                type='button'
                className={`w-full text-left p-4 flex items-start gap-2 border-t transition-colors hover:bg-muted/50 ${
                  unread ? 'bg-muted/30' : ''
                }`}
                onClick={() => unread && handleMarkAsRead(item.id)}>
                <div className='size-10 bg-muted flex items-center justify-center rounded-full shrink-0'>
                  {content.icon}
                </div>
                <div className='space-y-1 flex-1'>
                  <div className='flex items-center justify-between gap-4'>
                    <p className='text-sm font-medium'>{content.title}</p>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      {unread && (
                        <span className='size-2 rounded-full bg-primary' />
                      )}
                      <p className='text-xs text-muted-foreground'>
                        {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <p className='text-xs text-muted-foreground'>{content.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
