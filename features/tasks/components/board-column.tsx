import { TaskCard } from './task-card';
import { AddTaskInline } from './add-task-inline';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface BoardColumnProps {
  id: string;
  title: string;
  tasks?: {
    id: string;
    title: string;
    assignees: {
      user: {
        id: string;
        name: string;
      };
    }[];
  }[];
}

export function BoardColumn({ id, title, tasks = [] }: BoardColumnProps) {
  return (
    <div className='bg-muted w-64 p-2 rounded-lg space-y-2 shrink-0'>
      <div className='text-muted-foreground font-medium text-sm uppercase'>
        {title}
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}>
        <div className='space-y-1'>
          {tasks.map((task) => (
            <TaskCard key={task.id} id={task.id} title={task.title} />
          ))}
          <AddTaskInline statusId={id} />
        </div>
      </SortableContext>
    </div>
  );
}
