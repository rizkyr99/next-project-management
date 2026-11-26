import { useReadOnly } from '@/features/projects/read-only';
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
import { useCollapsedColumns } from '@/features/projects/collapsed-columns';
import { statusDotClass } from '@/features/projects/status-colors';
import { ChevronsRight } from 'lucide-react';
import { useParams } from 'next/navigation';

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
  const readOnly = useReadOnly();
  // The whole column is sortable horizontally (dragged by its header grip),
  // while the task list is the drop target for tasks, keyed by the status ID.
  const {
    setNodeRef: setColumnRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnDragId(id), data: { type: 'column', statusId: id }, disabled: readOnly });
  const { setNodeRef: setDropRef } = useDroppable({ id, data: { type: 'column-drop' } });

  const column: ColumnInfo = { id, name: title, color, isDefault, taskCount: tasks.length };
  // The last column means done (the due-soon job uses the same rule).
  const isLastColumn = columns.length > 0 && columns[columns.length - 1].id === id;
  const { projectId } = useParams<{ projectId: string }>();
  const { isCollapsed, setCollapsed } = useCollapsedColumns(projectId);

  // Collapsed: a narrow strip with the name and count. It keeps its place in
  // the column order, and cards can still be dropped onto it.
  if (isCollapsed(id)) {
    return (
      <div
        ref={setColumnRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        data-testid={`column-${title}`}
        data-collapsed=''
        className={cn('bg-muted w-10 shrink-0 rounded-lg snap-start', isDragging && 'opacity-50')}>
        <div ref={setDropRef} className='flex h-full min-h-48 flex-col items-center gap-2 py-2'>
          <button
            type='button'
            className='rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground'
            aria-label={`Expand column ${title}`}
            aria-expanded={false}
            onClick={() => setCollapsed(id, false)}>
            <ChevronsRight className='size-4' />
          </button>
          <span className={cn('size-2 rounded-full', statusDotClass(color))} aria-hidden />
          <span className='[writing-mode:vertical-rl] text-sm font-medium text-muted-foreground whitespace-nowrap'>
            {title} <span className='tabular-nums text-muted-foreground/70'>{tasks.length}</span>
          </span>
        </div>
      </div>
    );
  }

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
        onCollapse={() => setCollapsed(id, true)}
      />
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className='space-y-1 min-h-2'>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              commentCount={task.commentCount}
              dragDisabled={filtering || readOnly}
              done={isLastColumn}
            />
          ))}
          {/* Empty columns read as drop targets; only the default (where new
              tasks land) says what to do, so an empty board isn't repetitive. */}
          {tasks.length === 0 &&
            (isDefault && !filtering && !readOnly ? (
              <p className='rounded-md border border-dashed border-muted-foreground/25 px-2 py-4 text-center text-xs text-muted-foreground'>
                No tasks yet. Add the first one below.
              </p>
            ) : (
              <div aria-hidden className='h-12 rounded-md border border-dashed border-muted-foreground/20' />
            ))}
          {!readOnly && <AddTaskInline statusId={id} {...addTask} answersShortcut={isDefault} />}
        </div>
      </SortableContext>
    </div>
  );
}
