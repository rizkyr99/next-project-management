import { db } from '@/db/drizzle';
import { member, project, user, workspace } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import BoardView from '@/features/projects/components/board-view-client';
import { ListView } from '@/features/projects/components/list-view';
import { TableView } from '@/features/projects/components/table-view';
import { ViewSwitcher } from '@/features/projects/components/view-switcher';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

type View = 'board' | 'list' | 'table';

export default async function ProjectIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ workspaceSlug, projectId }, { view }] = await Promise.all([
    params,
    searchParams,
  ]);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const currentView: View =
    view === 'list' || view === 'table' ? view : 'board';

  const [currentWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.slug, workspaceSlug));

  const [workspaceMembers, data] = await Promise.all([
    currentWorkspace
      ? db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(
            and(
              eq(member.workspaceId, currentWorkspace.id),
            ),
          )
      : Promise.resolve([]),

    db.query.project.findFirst({
      where: eq(project.id, projectId),
      with: {
        statuses: {
          orderBy: (taskStatus, { asc }) => [asc(taskStatus.order)],
          with: {
            tasks: {
              orderBy: (task, { asc }) => [asc(task.order)],
              with: {
                assignees: {
                  with: { user: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

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
      {currentView === 'board' && (
        <BoardView project={data} workspaceMembers={workspaceMembers} />
      )}
      {currentView === 'list' && (
        <ListView project={data} workspaceMembers={workspaceMembers} />
      )}
      {currentView === 'table' && (
        <TableView project={data} workspaceMembers={workspaceMembers} />
      )}
    </div>
  );
}
