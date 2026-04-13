import { db } from '@/db/drizzle';
import {
  member,
  project,
  task,
  taskAssignee,
  taskStatus,
  workspace,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MyTasksView } from '@/features/tasks/components/my-tasks-view';

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ readonly workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [currentWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .innerJoin(member, eq(member.workspaceId, workspace.id))
    .where(
      and(
        eq(workspace.slug, workspaceSlug),
        eq(member.userId, session.user.id),
      ),
    );

  if (!currentWorkspace) redirect('/create-workspace');

  const myTasks = await db
    .select({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      statusId: task.statusId,
      statusName: taskStatus.name,
      projectId: project.id,
      projectName: project.name,
    })
    .from(taskAssignee)
    .innerJoin(task, eq(taskAssignee.taskId, task.id))
    .innerJoin(taskStatus, eq(task.statusId, taskStatus.id))
    .innerJoin(project, eq(task.projectId, project.id))
    .where(
      and(
        eq(taskAssignee.userId, session.user.id),
        eq(project.workspaceId, currentWorkspace.id),
      ),
    )
    .orderBy(asc(task.createdAt));

  return (
    <div className='flex-1 flex flex-col'>
      <div className='px-4 py-4 border-b'>
        <h1 className='text-lg font-semibold'>My tasks</h1>
        <p className='text-sm text-muted-foreground'>
          Tasks assigned to you across all projects in this workspace.
        </p>
      </div>
      <MyTasksView tasks={myTasks} workspaceSlug={workspaceSlug} />
    </div>
  );
}
