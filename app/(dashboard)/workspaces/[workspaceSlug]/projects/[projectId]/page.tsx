import { db } from '@/db/drizzle';
import { comment, member, project, user } from '@/db/schema';
import { and, count, eq, inArray } from 'drizzle-orm';
import BoardView from '@/features/projects/components/board-view-client';
import { CallButton } from '@/features/call/components/call-button';
import { ListView } from '@/features/projects/components/list-view';
import { TableView } from '@/features/projects/components/table-view';
import { ViewSwitcher } from '@/features/projects/components/view-switcher';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectActionsMenu } from '@/features/projects/components/project-actions-menu';
import type { Metadata } from 'next';

type View = 'board' | 'list' | 'table';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}): Promise<Metadata> {
  const { workspaceSlug, projectId } = await params;
  const session = await getSession();
  const ws = session ? await getActiveWorkspace(workspaceSlug, session.user.id) : null;
  if (!ws) return {};
  // Same scoping as the page: a project from another workspace gets no title.
  const [row] = await db
    .select({ name: project.name })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, ws.id)))
    .limit(1);
  return row ? { title: row.name } : {};
}

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

  const session = await getSession();
  if (!session) redirect('/login');

  const currentView: View =
    view === 'list' || view === 'table' ? view : 'board';

  // Membership is resolved (and cached) by the workspace layout as well.
  const currentWorkspace = await getActiveWorkspace(workspaceSlug, session.user.id);
  if (!currentWorkspace) notFound();

  const [workspaceMembers, data] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.workspaceId, currentWorkspace.id)),

    // Scoped to this workspace: a project ID from another tenant is a 404.
    db.query.project.findFirst({
      where: and(eq(project.id, projectId), eq(project.workspaceId, currentWorkspace.id)),
      with: {
        statuses: {
          orderBy: (taskStatus, { asc }) => [asc(taskStatus.order)],
          with: {
            tasks: {
              orderBy: (t, { asc }) => [asc(t.order)],
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

  if (!data) notFound();

  // Fetch comment counts for all tasks in this project in one query
  const allTaskIds = data.statuses.flatMap((s) => s.tasks.map((t) => t.id)) ?? [];
  const commentCounts =
    allTaskIds.length > 0
      ? await db
          .select({ taskId: comment.taskId, count: count() })
          .from(comment)
          .where(inArray(comment.taskId, allTaskIds))
          .groupBy(comment.taskId)
      : [];
  const commentCountMap = Object.fromEntries(commentCounts.map((r) => [r.taskId, r.count]));

  return (
    <div className='h-full flex flex-col'>
      <div className='px-4 py-2 space-y-2 border-b'>
        <div className='flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <h1 className='text-lg font-semibold truncate'>{data.name}</h1>
            {data.description && (
              <p className='text-sm text-muted-foreground line-clamp-2'>{data.description}</p>
            )}
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            <CallButton
              projectId={projectId}
              currentUserId={session.user.id}
              currentUserName={session.user.name ?? 'User'}
            />
            <ProjectActionsMenu
              project={{ id: data.id, name: data.name, description: data.description }}
              canDelete={currentWorkspace.role === 'owner' || currentWorkspace.role === 'admin'}
              trigger={
                <Button variant='ghost' size='icon' aria-label='Project options'>
                  <MoreHorizontal />
                </Button>
              }
            />
          </div>
        </div>
        <Suspense>
          <ViewSwitcher currentView={currentView} />
        </Suspense>
      </div>
      {currentView === 'board' && (
        <BoardView
          boardKey={allTaskIds.join(',')}
          project={data}
          workspaceMembers={workspaceMembers}
          currentUserId={session.user.id}
          commentCountMap={commentCountMap}
        />
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
