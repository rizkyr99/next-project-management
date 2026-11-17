'use client';

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, Clock3, MessageSquare, UserPlus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { NotificationRow } from '../actions';
import { isSafeNotificationHref } from '../href';

function describe(item: NotificationRow): { icon: ReactNode; title: string; description: ReactNode } {
  const strong = (text: string | null) => <span className='text-foreground font-medium'>{text}</span>;
  switch (item.type) {
    case 'task_assigned':
      return {
        icon: <UserPlus className='size-5 text-muted-foreground' />,
        title: 'Task assigned to you',
        description: (
          <>
            {strong(item.actorName)} assigned you to {strong(item.taskTitle)}
          </>
        ),
      };
    case 'workspace_invite':
      return {
        icon: <Users className='size-5 text-muted-foreground' />,
        title: 'Workspace invite',
        description: (
          <>
            {strong(item.actorName)} invited you to {strong(item.workspaceName)}
          </>
        ),
      };
    case 'comment_mention':
      return {
        icon: <MessageSquare className='size-5 text-muted-foreground' />,
        title: 'You were mentioned',
        description: (
          <>
            {strong(item.actorName)} mentioned you in {strong(item.taskTitle)}
          </>
        ),
      };
    case 'due_soon':
      return {
        icon: <Clock3 className='size-5 text-muted-foreground' />,
        title: 'Due date reminder',
        description: (
          <>
            {strong(item.taskTitle)} is due {item.dueLabel}
          </>
        ),
      };
  }
}

/** Invite notifications always point at /invites, even rows from before hrefs existed. */
export function notificationHref(item: NotificationRow): string | null {
  if (isSafeNotificationHref(item.href)) return item.href;
  return item.type === 'workspace_invite' ? '/invites' : null;
}

/**
 * One notification row. Clicking marks it read and, when it links somewhere,
 * navigates there (`onOpen` does both; the row only renders).
 */
export function NotificationItem({
  item,
  onOpen,
  className,
}: {
  item: NotificationRow;
  onOpen: (item: NotificationRow, href: string | null) => void;
  className?: string;
}) {
  const { icon, title, description } = describe(item);
  const href = notificationHref(item);
  const unread = !item.read;

  return (
    <button
      type='button'
      data-unread={unread || undefined}
      className={cn(
        'w-full text-left p-4 flex items-start gap-3 transition-colors hover:bg-muted/50',
        unread && 'bg-muted/30',
        className,
      )}
      onClick={() => onOpen(item, href)}>
      <div className='size-10 bg-muted flex items-center justify-center rounded-full shrink-0'>{icon}</div>
      <div className='space-y-1 flex-1 min-w-0'>
        <div className='flex items-center justify-between gap-4'>
          <p className='text-sm font-medium'>{title}</p>
          <div className='flex items-center gap-1.5 shrink-0'>
            {unread && <span className='size-2 rounded-full bg-primary' aria-label='Unread' />}
            <p className='text-xs text-muted-foreground'>
              {formatDistanceToNow(item.createdAt, { addSuffix: true })}
            </p>
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>{description}</p>
      </div>
      {href && <ChevronRight className='size-4 shrink-0 self-center text-muted-foreground' aria-hidden />}
    </button>
  );
}
