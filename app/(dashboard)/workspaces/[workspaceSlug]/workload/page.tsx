import { db } from '@/db/drizzle';
import { member, project, task, taskAssignee, taskStatus, user } from '@/db/schema';
import { WorkloadView } from '@/features/workload/components/workload-view';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Workload' };

/** Enough for any studio; a cap keeps one huge workspace from slowing the page. */
const MAX_TASKS = 3000;

/**
 * D2: who's busy, week by week, across every active project. Team only.
 * Weeks are counted in the browser, in the viewer's time zone.
 */
export default async function WorkloadPage({ params }: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const ws = await getActiveWorkspace(workspaceSlug, session.user.id);
  if (!ws) notFound();
  // Clients don't see the team's workload.
  if (ws.role === 'guest') redirect(`/workspaces/${workspaceSlug}`);

  // Done means the project's last column, as everywhere else.
  const lastColumnId = sql`(select s.id from ${taskStatus} s where s.project_id = ${task.projectId} order by s."order" desc limit 1)`;

  const [people, tasks] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.workspaceId, ws.id), ne(member.role, 'guest')))
      .orderBy(asc(user.name)),
    db
      .select({
        id: task.id,
        title: task.title,
        projectId: project.id,
        projectName: project.name,
        startDate: task.startDate,
        dueDate: task.dueDate,
        dueHasTime: task.dueHasTime,
        assigneeIds: sql<string[]>`coalesce(array_agg(${taskAssignee.userId}) filter (where ${taskAssignee.userId} is not null), '{}')`,
      })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .leftJoin(taskAssignee, eq(taskAssignee.taskId, task.id))
      .where(and(eq(project.workspaceId, ws.id), isNull(project.archivedAt), ne(task.statusId, lastColumnId)))
      .groupBy(task.id, project.id)
      .orderBy(asc(task.dueDate))
      .limit(MAX_TASKS),
  ]);

  return (
    <div className='flex-1 space-y-6 p-4 md:p-8'>
      <div>
        <h1 className='text-2xl font-semibold'>Workload</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Open tasks per person, week by week, across every active project. A task counts in each week it runs.
        </p>
      </div>
      <WorkloadView workspaceSlug={workspaceSlug} people={people} tasks={tasks} />
    </div>
  );
}
