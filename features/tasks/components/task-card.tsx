import { Button } from '@/components/ui/button';
import { UserCircle } from 'lucide-react';

interface TaskCardProps {
  title: string;
}

export function TaskCard({ title }: TaskCardProps) {
  return (
    <div className='bg-white shadow p-2 rounded-md space-y-2 hover:shadow-md cursor-pointer transition'>
      <div className='text-sm font-medium'>{title}</div>
      <div className='flex items-center gap-1'>
        <Button variant='outline' size='icon-sm'>
          <UserCircle />
        </Button>
      </div>
    </div>
  );
}
