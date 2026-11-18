import { TaskCard } from './task-card';
import type { TaskData } from './task-meta';
import { AddTaskInline, type AddTaskCallbacks } from './add-task-inline';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ColumnHeader, type ColumnInfo } from '@/features/projects/components/column-controls';
import { cn } from '@/lib/utils';

/** Column sortable IDs are prefixed so they never collide with task IDs. */
export const columnDragId = (statusId: string) => `column:${statusId}`;


interface BoardColumnProps {
  id: string;
  title: string;
  color?: string | null;
  isDefault?: boolean;
  /** All columns, for the delete dialog's "move tasks to" picker. */
  columns?: ColumnInfo[];
  /** Adding a task from this column; see AddTaskCallbacks. */
  addTask?: AddTaskCallbacks;
  tasks?: (TaskData & { commentCount?: number })[];
  /** Filters are on: cards can't be dragged, and "empty" means no matches. */
  filtering?: boolean;
}

export function BoardColumn({
  id,
  title,
  color = null,
  isDefault = false,
  columns = [],
  addTask,
  tasks = [],
  filtering = false,
}: Readonly<BoardColumnProps>) {
  // The whole column is sortable horizontally (dragged by its header grip),
  // while the task list is the drop target for tasks, keyed by the status ID.
  const {
    setNodeRef: setColumnRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnDragId(id), data: { type: 'column', statusId: id } });
  const { setNodeRef: setDropRef } = useDroppable({ id, data: { type: 'column-drop' } });

  const column: ColumnInfo = { id, name: title, color, isDefault, taskCount: tasks.length };

  return (
    <div
      ref={setColumnRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`column-${title}`}
      className={cn(
        'bg-muted w-[85vw] max-w-80 sm:w-64 p-2 rounded-lg space-y-2 shrink-0 snap-start',
        isDragging && 'opacity-50',
      )}>
      <ColumnHeader
        column={column}
        columns={columns.length > 0 ? columns : [column]}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className='space-y-1 min-h-2'>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} commentCount={task.commentCount} dragDisabled={filtering} />
          ))}
          {/* Empty columns read as drop targets; only the default (where new
              tasks land) says what to do, so an empty board isn't repetitive. */}
          {tasks.length === 0 &&
            (isDefault && !filtering ? (
              <p className='rounded-md border border-dashed border-muted-foreground/25 px-2 py-4 text-center text-xs text-muted-foreground'>
                No tasks yet. Add the first one below.
              </p>
            ) : (
              <div aria-hidden className='h-12 rounded-md border border-dashed border-muted-foreground/20' />
            ))}
          <AddTaskInline statusId={id} {...addTask} />
        </div>
      </SortableContext>
    </div>
  );
}
