import { db } from '@/db/drizzle';
import { project } from '@/db/schema';
import { eq } from 'drizzle-orm';
import BoardView from '@/features/projects/components/board-view-client';
import { ListView } from '@/features/projects/components/list-view';
import { ViewSwitcher } from '@/features/projects/components/view-switcher';
import { Suspense } from 'react';

type View = 'board' | 'list' | 'table';

export default async function ProjectIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ projectId }, { view }] = await Promise.all([params, searchParams]);
  const currentView: View =
    view === 'list' || view === 'table' ? view : 'board';

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
        <Suspense>
          <ViewSwitcher currentView={currentView} />
        </Suspense>
      </div>
      {currentView === 'board' && <BoardView project={data} />}
      {currentView === 'list' && <ListView project={data} />}
      {currentView === 'table' && (
        <div className='flex-1 flex items-center justify-center text-muted-foreground text-sm'>
          Table view coming soon.
        </div>
      )}
    </div>
  );
}
