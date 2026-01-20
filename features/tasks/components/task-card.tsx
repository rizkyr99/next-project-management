import { Button } from '@/components/ui/button';
import { UserCircle } from 'lucide-react';

export function TaskCard() {
  return (
    <div className='bg-white shadow p-2 rounded-md space-y-2'>
      <div className='text-sm font-medium'>Task 1</div>
      <div className='flex items-center gap-1'>
        <Button variant='outline' size='icon-sm'>
          <UserCircle />
        </Button>
      </div>
    </div>
  );
}
