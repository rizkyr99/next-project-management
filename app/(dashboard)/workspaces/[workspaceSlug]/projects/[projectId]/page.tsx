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
import { ProjectActionsMenu } from '@/features/projects/components/project-actions-menu';
import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { TaskDetailSheet } from '@/features/tasks/components/task-detail/task-detail-sheet';
import { TaskFilterBar } from '@/features/tasks/components/task-filter-bar';
import { ProjectLiveUpdates } from '@/features/tasks/components/project-live-updates';
import { projectSnapshot } from '@/features/tasks/snapshot';

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

  // The snapshot is taken alongside the data, so the live stream can tell
  // whether anything changed between this render and its first poll.
  const [snapshot, workspaceMembers, data] = await Promise.all([
    projectSnapshot(projectId),
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

  // The list and table keep local state (optimistic edits); remount them
  // whenever the server data they show changes. The board syncs itself.
  const boardKey = createHash('sha1')
    .update(
      JSON.stringify(
        data.statuses.map((s) => [
          s.id,
          s.name,
          s.color,
          s.isDefault,
          s.tasks.map((t) => [
            t.id,
            t.title,
            t.priority,
            t.dueDate?.getTime() ?? null,
            Boolean(t.description),
            t.assignees.map((a) => a.user.id),
          ]),
        ]),
      ),
    )
    .digest('base64url');

  return (
    <div className='h-full flex flex-col'>
      <ProjectLiveUpdates projectId={data.id} snapshot={snapshot} />
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
              variant='header'
            />
          </div>
        </div>
        <Suspense>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <ViewSwitcher currentView={currentView} />
            <TaskFilterBar
              members={workspaceMembers.map((m) => ({ id: m.id, name: m.name }))}
              currentUserId={session.user.id}
            />
          </div>
        </Suspense>
      </div>
      {currentView === 'board' && (
        <BoardView project={data} commentCountMap={commentCountMap} currentUserId={session.user.id} />
      )}
      {currentView === 'list' && (
        <ListView key={boardKey} project={data} workspaceMembers={workspaceMembers} currentUserId={session.user.id} />
      )}
      {currentView === 'table' && (
        <TableView key={boardKey} project={data} workspaceMembers={workspaceMembers} currentUserId={session.user.id} />
      )}
      <Suspense>
        <TaskDetailSheet
          projectId={data.id}
          statuses={data.statuses}
          members={workspaceMembers}
          currentUserId={session.user.id}
        />
      </Suspense>
    </div>
  );
}
