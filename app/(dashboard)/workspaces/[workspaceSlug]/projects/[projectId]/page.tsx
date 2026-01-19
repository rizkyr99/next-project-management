import { Button } from '@/components/ui/button';
import { Kanban, List, Plus, Table, User, UserCircle } from 'lucide-react';

export default async function ProjectIdPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = await params;
  return (
    <div className='overflow-x-auto h-full flex flex-col'>
      <div className='px-4 py-2 space-y-2 border-b'>
        <div className='text-lg font-semibold flex items-center justify-between'>
          Project {projectId}
        </div>
        <div className='flex items-center gap-1'>
          <Button size='sm'>
            <Kanban />
            Board
          </Button>
          <Button variant='ghost' size='sm'>
            <List />
            List
          </Button>
          <Button variant='ghost' size='sm'>
            <Table />
            Table
          </Button>
        </div>
      </div>
      <div className='flex-1 p-4'>
        <div className='bg-muted w-64 p-2 rounded-lg space-y-2'>
          <div className='text-muted-foreground font-medium text-sm'>TO DO</div>
          <div className='space-y-1'>
            <div className='bg-white p-2 rounded-md space-y-2'>
              <div className='text-sm font-medium'>Task 1</div>
              <div className='flex items-center gap-1'>
                <Button variant='outline' size='icon-sm'>
                  <UserCircle />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
