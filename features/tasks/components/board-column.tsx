import { TaskCard } from './task-card';
import { AddTaskInline } from './add-task-inline';
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

type NewTask = {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: Date | null;
  assignees: [];
};

interface BoardColumnProps {
  id: string;
  title: string;
  color?: string | null;
  isDefault?: boolean;
  /** All columns, for the delete dialog's "move tasks to" picker. */
  columns?: ColumnInfo[];
  projectId: string;
  statuses: { id: string; name: string }[];
  currentUserId: string;
  onTaskCreated?: (task: NewTask) => void;
  tasks?: {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high';
    dueDate?: Date | null;
    commentCount?: number;
    assignees: {
      user: {
        id: string;
        name: string;
        email?: string;
        image?: string | null;
      };
    }[];
  }[];
  availableAssignees?: {
    id: string;
    name: string;
    email?: string;
    image?: string | null;
  }[];
}

export function BoardColumn({
  id,
  title,
  color = null,
  isDefault = false,
  columns = [],
  projectId,
  statuses,
  currentUserId,
  onTaskCreated,
  tasks = [],
  availableAssignees = [],
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
      className={cn('bg-muted w-64 p-2 rounded-lg space-y-2 shrink-0', isDragging && 'opacity-50')}>
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
            <TaskCard
              key={task.id}
              id={task.id}
              title={task.title}
              priority={task.priority}
              dueDate={task.dueDate}
              statusId={id}
              projectId={projectId}
              statuses={statuses}
              assignees={task.assignees}
              availableAssignees={availableAssignees}
              currentUserId={currentUserId}
              commentCount={task.commentCount}
            />
          ))}
          <AddTaskInline statusId={id} onTaskCreated={onTaskCreated} />
        </div>
      </SortableContext>
    </div>
  );
}
