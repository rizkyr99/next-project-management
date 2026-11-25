import { db } from '@/db/drizzle';
import { comment, label, project, projectGuest } from '@/db/schema';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { CallButton } from '@/features/call/components/call-button';
import { ProjectViews } from '@/features/projects/components/project-views';
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
import { RememberProject } from '@/features/search/components/remember-project';
import { projectSnapshot } from '@/features/tasks/snapshot';
import { ProjectDetails } from '@/features/projects/components/project-details';
import { RestoreProjectButton } from '@/features/projects/components/restore-project-button';
import { Archive } from 'lucide-react';
import { ProjectReadOnly } from '@/features/projects/read-only';
import { projectAudience } from '@/lib/project-audience';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}): Promise<Metadata> {
  const { workspaceSlug, projectId } = await params;
  const session = await getSession();
  const ws = session ? await getActiveWorkspace(workspaceSlug, session.user.id) : null;
  if (!ws) return {};
  // Same scoping as the page: a project from another workspace (or, for a
  // guest, one not shared with them) gets no title.
  if (ws.role === 'guest' && !(await sharedWithGuest(projectId, session!.user.id))) return {};
  const [row] = await db
    .select({ name: project.name })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, ws.id)))
    .limit(1);
  return row ? { title: row.name } : {};
}

/** A guest sees a project only while it's shared with them and not archived. */
async function sharedWithGuest(projectId: string, userId: string) {
  const [row] = await db
    .select({ id: projectGuest.projectId })
    .from(projectGuest)
    .innerJoin(project, eq(project.id, projectGuest.projectId))
    .where(and(eq(projectGuest.projectId, projectId), eq(projectGuest.userId, userId), isNull(project.archivedAt)))
    .limit(1);
  return Boolean(row);
}

export default async function ProjectIdPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  const session = await getSession();
  if (!session) redirect('/login');

  // Membership is resolved (and cached) by the workspace layout as well.
  const currentWorkspace = await getActiveWorkspace(workspaceSlug, session.user.id);
  if (!currentWorkspace) notFound();
  // Clients (guests) see only projects shared with them, read-only but for comments.
  const isGuest = currentWorkspace.role === 'guest';
  if (isGuest && !(await sharedWithGuest(projectId, session.user.id))) notFound();

  // The snapshot is taken alongside the data, so the live stream can tell
  // whether anything changed between this render and its first poll.
  const [snapshot, workspaceMembers, workspaceLabels, data] = await Promise.all([
    projectSnapshot(projectId),
    // The team plus this project's guests; never other clients.
    projectAudience(currentWorkspace.id, projectId),

    db
      .select({ id: label.id, name: label.name, color: label.color })
      .from(label)
      .where(eq(label.workspaceId, currentWorkspace.id))
      .orderBy(asc(label.name)),

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
                labels: {
                  with: { label: { columns: { id: true, name: true, color: true } } },
                },
                checklist: {
                  columns: { id: true, title: true, done: true, position: true },
                  orderBy: (c, { asc }) => [asc(c.position), asc(c.createdAt)],
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
            t.labels.map((l) => [l.label.id, l.label.name, l.label.color]),
            t.dueHasTime,
            t.checklist.map((c) => [c.id, c.done]),
          ]),
        ]),
      ),
    )
    .digest('base64url');

  // Work is assigned to the team only; guests of this project can still be @mentioned.
  const teamMembers = workspaceMembers.filter((m) => m.role !== 'guest');

  return (
    <ProjectReadOnly readOnly={isGuest}>
    <div className='h-full flex flex-col'>
      <ProjectLiveUpdates projectId={data.id} snapshot={snapshot} />
      <RememberProject workspaceSlug={workspaceSlug} projectId={data.id} name={data.name} />
      {data.archivedAt && (
        <div
          role='status'
          className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/60 px-4 py-2 text-sm'>
          <Archive className='size-4 text-muted-foreground' aria-hidden />
          <span className='flex-1'>
            This project is archived. It&apos;s hidden from the sidebar and My tasks, and sends no reminders.
          </span>
          {!isGuest && <RestoreProjectButton projectId={data.id} projectName={data.name} />}
        </div>
      )}
      <div className='px-4 py-2 space-y-2 border-b'>
        <div className='flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <h1 className='text-lg font-semibold truncate'>{data.name}</h1>
            {data.description && (
              <p className='text-sm text-muted-foreground line-clamp-2'>{data.description}</p>
            )}
            <ProjectDetails
              clientName={data.clientName}
              deadline={data.deadline}
              status={data.status}
              className='mt-1'
            />
          </div>
          {!isGuest && (
          <div className='flex items-center gap-2 shrink-0'>
            <CallButton
              projectId={projectId}
              currentUserId={session.user.id}
              currentUserName={session.user.name ?? 'User'}
            />
            <ProjectActionsMenu
              project={{
                id: data.id,
                name: data.name,
                description: data.description,
                clientName: data.clientName,
                deadline: data.deadline,
                status: data.status,
                archived: data.archivedAt !== null,
              }}
              canDelete={currentWorkspace.role === 'owner' || currentWorkspace.role === 'admin'}
              variant='header'
            />
          </div>
          )}
        </div>
        <Suspense>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <ViewSwitcher />
            <TaskFilterBar
              members={teamMembers.map((m) => ({ id: m.id, name: m.name }))}
              currentUserId={session.user.id}
              labels={workspaceLabels}
            />
          </div>
        </Suspense>
      </div>
      {/* The view lives in the URL and switches without a server request. */}
      <ProjectViews
        project={data}
        commentCountMap={commentCountMap}
        workspaceMembers={teamMembers}
        currentUserId={session.user.id}
        dataKey={boardKey}
      />
      <Suspense>
        <TaskDetailSheet
          projectId={data.id}
          projectName={data.name}
          labels={workspaceLabels}
          statuses={data.statuses}
          members={teamMembers}
          mentionable={workspaceMembers}
          currentUserId={session.user.id}
        />
      </Suspense>
    </div>
    </ProjectReadOnly>
  );
}
