import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { checklistItem, project, task, taskApproval, taskStatus, workspace } from '@/db/schema';
import { ProjectDetails } from '@/features/projects/components/project-details';
import { isWellFormedShareToken } from '@/features/projects/share-link';
import { TaskCardPreview } from '@/features/tasks/components/task-card';
import { SharedCalendar } from '@/features/calendar/components/calendar-view';
import { cn } from '@/lib/utils';
import { statusDotClass } from '@/features/projects/status-colors';
import type { ApprovalState } from '@/features/approvals/states';
import type { TaskData } from '@/features/tasks/components/task-meta';

// Live data on every request: a turned-off link must stop working at once.
export const dynamic = 'force-dynamic';

/**
 * C4: a project's board, or its calendar (?view=calendar), for someone without
 * an account, opened from its share link. Read-only and deliberately thin:
 * columns, task titles, priority, start and due dates, checklist progress and
 * approval state. No comments, descriptions,
 * people, labels or files, and nothing for archived projects or turned-off
 * links (both are the same 404 as a link that never existed).
 */
const sharedProject = cache(async (token: string) => {
  if (!isWellFormedShareToken(token)) return null;
  const [row] = await db
    .select({
      id: project.id,
      name: project.name,
      clientName: project.clientName,
      deadline: project.deadline,
      status: project.status,
      workspaceName: workspace.name,
    })
    .from(project)
    .innerJoin(workspace, eq(workspace.id, project.workspaceId))
    .where(and(eq(project.shareToken, token), isNull(project.archivedAt)))
    .limit(1);
  return row ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const shared = await sharedProject((await params).token);
  return {
    title: shared ? `${shared.name} · ${shared.workspaceName}` : 'Not found',
    // Never in search results, and the token never leaks through a Referer.
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharedBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { token } = await params;
  const shared = await sharedProject(token);
  if (!shared) notFound();
  const view = (await searchParams).view === 'calendar' ? 'calendar' : 'board';

  const [columns, tasks] = await Promise.all([
    db
      .select({ id: taskStatus.id, name: taskStatus.name, color: taskStatus.color })
      .from(taskStatus)
      .where(eq(taskStatus.projectId, shared.id))
      .orderBy(asc(taskStatus.order)),
    db
      .select({
        id: task.id,
        statusId: task.statusId,
        title: task.title,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        dueHasTime: task.dueHasTime,
      })
      .from(task)
      // C2: internal tasks are the team's; a share link never shows them.
      .where(and(eq(task.projectId, shared.id), eq(task.internal, false)))
      .orderBy(asc(task.order)),
  ]);
  const taskIds = tasks.map((t) => t.id);
  const [steps, approvals] =
    taskIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({ id: checklistItem.id, taskId: checklistItem.taskId, done: checklistItem.done })
            .from(checklistItem)
            .where(inArray(checklistItem.taskId, taskIds)),
          db
            .selectDistinctOn([taskApproval.taskId], { taskId: taskApproval.taskId, status: taskApproval.status })
            .from(taskApproval)
            .where(and(inArray(taskApproval.taskId, taskIds), ne(taskApproval.status, 'cancelled')))
            .orderBy(taskApproval.taskId, desc(taskApproval.createdAt)),
        ]);
  const approvalOf = new Map(approvals.map((a) => [a.taskId, a.status as ApprovalState]));

  // Only what a card shows; step titles stay private (progress only).
  const card = (t: (typeof tasks)[number]): TaskData => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    startDate: t.startDate,
    dueDate: t.dueDate,
    dueHasTime: t.dueHasTime,
    assignees: [],
    checklist: steps
      .filter((s) => s.taskId === t.id)
      .map((s, position) => ({ id: s.id, title: '', done: s.done, position })),
    approval: approvalOf.get(t.id) ?? null,
  });

  return (
    <div className='min-h-dvh bg-background flex flex-col'>
      <header className='border-b px-4 py-4 md:px-8'>
        <p className='text-xs text-muted-foreground'>Shared by {shared.workspaceName}</p>
        <h1 className='text-xl font-semibold mt-0.5'>{shared.name}</h1>
        <ProjectDetails clientName={shared.clientName} deadline={shared.deadline} status={shared.status} />
        <nav aria-label='View' className='mt-3 flex w-fit items-center gap-1 rounded-lg bg-secondary p-1 text-sm'>
          {(['board', 'calendar'] as const).map((v) => (
            <Link
              key={v}
              href={v === 'board' ? `/share/${token}` : `/share/${token}?view=calendar`}
              aria-current={view === v ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1 font-medium',
                view === v ? 'border bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}>
              {v === 'board' ? 'Board' : 'Calendar'}
            </Link>
          ))}
        </nav>
      </header>

      {/* The calendar pads itself by 1rem: md:px-4 lines it up with the header's 2rem. */}
      {view === 'calendar' ? (
        <main className='flex-1 md:px-4'>
          <SharedCalendar
            project={{
              id: shared.id,
              statuses: columns.map((c) => ({ ...c, tasks: tasks.filter((t) => t.statusId === c.id).map(card) })),
            }}
          />
        </main>
      ) : (
        <main className='flex-1 overflow-x-auto px-4 py-4 md:px-8'>
          <div className='flex gap-4 items-start min-w-max'>
            {columns.map((column, index) => {
              const columnTasks = tasks.filter((t) => t.statusId === column.id);
              // The last column means done: a past due date there isn't overdue.
              const done = index === columns.length - 1;
              return (
                <section
                  key={column.id}
                  aria-label={column.name}
                  className='w-72 shrink-0 rounded-lg bg-muted/60 p-2 space-y-2'>
                  <h2 className='flex items-center gap-2 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                    <span className={`size-2 rounded-full ${statusDotClass(column.color)}`} aria-hidden />
                    {column.name}
                    <span className='font-normal'>{columnTasks.length}</span>
                  </h2>
                  {columnTasks.length === 0 ? (
                    <p className='px-1 pb-1 text-xs text-muted-foreground'>No tasks</p>
                  ) : (
                    <ul className='space-y-2'>
                      {columnTasks.map((t) => (
                        <li key={t.id} className='bg-white dark:bg-card shadow p-2.5 rounded-md space-y-2'>
                          <TaskCardPreview task={card(t)} done={done} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      )}

      <footer className='border-t px-4 py-3 md:px-8 text-xs text-muted-foreground flex justify-between gap-4'>
        <span>Read-only view. It updates when you reload.</span>
        <Link href='/' className='hover:text-foreground'>
          Made with Tide
        </Link>
      </footer>
    </div>
  );
}
