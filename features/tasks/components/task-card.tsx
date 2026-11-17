'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlignLeft, MessageSquare } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { openTask } from '../task-link';
import { formatShortDate, PersonAvatar, priorityConfig, type TaskData } from './task-meta';

interface TaskCardProps {
  task: TaskData;
  commentCount?: number;
  /** While the board is filtered, cards open but can't be dragged. */
  dragDisabled?: boolean;
}

/** The card's face. Also used, without drag behaviour, as the drag overlay. */
export function TaskCardPreview({ task, commentCount = 0 }: TaskCardProps) {
  const p = priorityConfig[task.priority];
  const dueDate = task.dueDate ?? null;
  const isOverdue = dueDate !== null && dueDate < new Date();
  const assignees = task.assignees.map((a) => a.user);

  return (
    <>
      <div className='text-sm font-medium leading-snug'>{task.title}</div>
      <div className='flex items-center gap-1.5 flex-wrap'>
        <Badge variant={p.variant} className='gap-1 text-xs font-normal px-1.5 py-0'>
          {p.icon}
          {p.label}
        </Badge>
        {dueDate && (
          <span className={cn('text-xs', isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
            {formatShortDate(dueDate)}
          </span>
        )}
        <div className='flex items-center gap-2 ml-auto text-muted-foreground'>
          {task.description && <AlignLeft className='size-3' aria-label='Has description' />}
          {commentCount > 0 && (
            <span className='flex items-center gap-0.5 text-xs'>
              <MessageSquare className='size-3' />
              {commentCount}
            </span>
          )}
          {assignees.length > 0 && (
            <div className='flex items-center -space-x-1'>
              {assignees.slice(0, 3).map((a) => (
                <PersonAvatar
                  key={a.id}
                  person={a}
                  className='size-6 border-2 border-card'
                  fallbackClassName='text-[9px] font-medium'
                />
              ))}
              {assignees.length > 3 && (
                <span className='text-xs pl-2'>+{assignees.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const cardClassName =
  'bg-white dark:bg-card shadow p-2.5 rounded-md space-y-2 hover:shadow-md cursor-pointer transition';

/**
 * A draggable board card. Clicking it (or pressing Enter) opens the task
 * sheet via `?task=`; Space picks it up for keyboard dragging.
 */
export function TaskCard({ task, commentCount, dragDisabled = false }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openTask(task.id);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...(dragDisabled
        ? // Filtered: still a button that opens the task, just not draggable,
          // so drop the "sortable"/disabled semantics and drag instructions.
          { role: 'button', tabIndex: 0 }
        : attributes)}
      {...(dragDisabled ? {} : listeners)}
      onKeyDown={onKeyDown}
      onClick={() => openTask(task.id)}
      aria-label={`Open task ${task.title}`}
      data-testid={`task-${task.id}`}
      className={cardClassName}>
      <TaskCardPreview task={task} commentCount={commentCount} />
    </div>
  );
}
