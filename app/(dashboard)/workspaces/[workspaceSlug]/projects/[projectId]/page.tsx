import { Button } from '@/components/ui/button';
import { db } from '@/db/drizzle';
import { project } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Kanban, List, Table } from 'lucide-react';
import BoardView from '@/features/projects/components/board-view-client';

export default async function ProjectIdPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const data = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    with: {
      statuses: {
        orderBy: (taskStatus, { asc }) => [asc(taskStatus.order)],
        with: {
          tasks: {
            orderBy: (task, { asc }) => [asc(task.order)],
            with: {
              assignees: {
                with: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return (
    <div className='h-full flex flex-col'>
      <div className='px-4 py-2 space-y-2 border-b'>
        <div className='text-lg font-semibold flex items-center justify-between'>
          {data?.name}
        </div>
        <div className='flex items-center gap-1 bg-secondary w-fit rounded-lg p-1'>
          <Button variant='outline' size='sm'>
            <Kanban />
            <span>Board</span>
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
      <BoardView project={data} />
    </div>
  );
}
