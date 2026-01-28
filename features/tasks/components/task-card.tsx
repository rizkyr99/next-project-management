import { Button } from '@/components/ui/button';
import { UserCircle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
interface TaskCardProps {
  id: string;
  title: string;
}

export function TaskCard({ id, title }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className='bg-white shadow p-2 rounded-md space-y-2 hover:shadow-md cursor-pointer transition'>
      <div className='text-sm font-medium'>{title}</div>
      <div className='flex items-center gap-1'>
        <Button variant='outline' size='icon-sm'>
          <UserCircle />
        </Button>
      </div>
    </div>
  );
}
