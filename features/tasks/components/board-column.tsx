import { TaskCard } from './task-card';
import { AddTaskInline } from './add-task-inline';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

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
  projectId,
  statuses,
  currentUserId,
  onTaskCreated,
  tasks = [],
  availableAssignees = [],
}: Readonly<BoardColumnProps>) {
  const { setNodeRef } = useSortable({ id });

  return (
    <div className='bg-muted w-64 p-2 rounded-lg space-y-2 shrink-0'>
      <div className='text-muted-foreground font-medium text-sm uppercase'>
        {title}
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className='space-y-1'>
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
