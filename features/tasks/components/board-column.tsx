import { Button } from '@/components/ui/button';
import { TaskCard } from './task-card';
import { Plus } from 'lucide-react';

interface BoardColumnProps {
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

export function BoardColumn({ title, tasks = [] }: BoardColumnProps) {
  return (
    <div className='bg-muted w-64 p-2 rounded-lg space-y-2 shrink-0'>
      <div className='text-muted-foreground font-medium text-sm uppercase'>
        {title}
      </div>
      <div className='space-y-1'>
        {tasks.map((task) => (
          <TaskCard key={task.id} title={task.title} />
        ))}
        <Button
          variant='ghost'
          size='sm'
          className='hover:bg-background/50 w-full justify-start'>
          <Plus />
          Add task
        </Button>
      </div>
    </div>
  );
}
