'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, Clock3, MessageSquare, UserPlus, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

type BaseNotification = {
  id: string;
  createdAt: Date;
  read: boolean;
};

type TaskAssignedNotification = BaseNotification & {
  type: 'task_assigned';
  actorName: string;
  taskTitle: string;
};

type WorkspaceInviteNotification = BaseNotification & {
  type: 'workspace_invite';
  actorName: string;
  workspaceName: string;
};

type CommentMentionNotification = BaseNotification & {
  type: 'comment_mention';
  actorName: string;
  taskTitle: string;
};

type DueSoonNotification = BaseNotification & {
  type: 'due_soon';
  taskTitle: string;
  dueLabel: string;
};

type NotificationItem =
  | TaskAssignedNotification
  | WorkspaceInviteNotification
  | CommentMentionNotification
  | DueSoonNotification;

const sampleNotifications: NotificationItem[] = [
  {
    id: '1',
    type: 'task_assigned',
    actorName: 'Alex Miller',
    taskTitle: 'Design System Update',
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
    read: false,
  },
  {
    id: '2',
    type: 'workspace_invite',
    actorName: 'Nadia',
    workspaceName: 'Marketing Ops',
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
    read: false,
  },
  {
    id: '3',
    type: 'comment_mention',
    actorName: 'Ryan',
    taskTitle: 'Landing page QA',
    createdAt: new Date(Date.now() - 45 * 60 * 1000),
    read: true,
  },
  {
    id: '4',
    type: 'due_soon',
    taskTitle: 'Prepare sprint retro',
    dueLabel: 'tomorrow',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    read: true,
  },
];

function renderNotificationContent(item: NotificationItem) {
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
        title: 'Workspace invite',
        description: (
          <>
            <span className='text-foreground font-medium'>{item.actorName}</span>{' '}
            invited you to{' '}
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
  const unreadCount = sampleNotifications.filter((item) => !item.read).length;

  return (
    <Popover>
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
          <Button variant='link' size='sm'>
            Mark all as read
          </Button>
        </div>
        <div>
          {sampleNotifications.map((item) => {
            const content = renderNotificationContent(item);
            return (
              <div key={item.id} className='p-4 flex items-start gap-2 border-t'>
                <div className='size-10 bg-muted flex items-center justify-center rounded-full shrink-0'>
                  {content.icon}
                </div>
                <div className='space-y-1 flex-1'>
                  <div className='flex items-center justify-between gap-4'>
                    <p className='text-sm font-medium'>{content.title}</p>
                    <p className='text-xs text-muted-foreground'>
                      {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <p className='text-xs text-muted-foreground'>{content.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
