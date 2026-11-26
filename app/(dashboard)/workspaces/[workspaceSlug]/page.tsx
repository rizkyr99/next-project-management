import { db } from '@/db/drizzle';
import {
  activityLog,
  member,
  project,
  projectGuest,
  task,
  taskApproval,
  workspaceInvite,
} from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { ProjectDetails } from '@/features/projects/components/project-details';
import { GETTING_STARTED_NAME } from '@/lib/onboarding';
import { cookies } from 'next/headers';
import { EmptyState } from '@/components/empty-state';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { checklistCookie, type ChecklistState } from '@/features/workspaces/checklist';
import { OnboardingChecklist } from '@/features/workspaces/components/onboarding-checklist';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Briefcase, ArrowRight, Stamp } from 'lucide-react';
import { taskHref } from '@/features/tasks/task-link';
import { studioOverview } from '@/features/overview/queries';
import { StudioOverview } from '@/features/overview/components/studio-overview';

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ readonly workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  const session = await getSession();
  if (!session) redirect('/login');

  const currentWorkspace = await getActiveWorkspace(
    workspaceSlug,
    session.user.id,
  );
  if (!currentWorkspace) redirect('/create-workspace');
  if (currentWorkspace.role === 'guest') {
    return <GuestHome workspace={currentWorkspace} userId={session.user.id} userName={session.user.name} />;
  }

  const [overview, [{ memberCount }]] = await Promise.all([
    studioOverview(currentWorkspace.id),
    db.select({ memberCount: count() }).from(member).where(eq(member.workspaceId, currentWorkspace.id)),
  ]);
  const projects = overview.projects;

  // First-run checklist (owners and admins, who can invite): completion is
  // read from data, never stored. The seeded "Getting started" project logs
  // no activity, so the activity log counts the user's own first project and
  // task. Activity logging is best-effort, so durable rows count too: any
  // project, or task, outside Getting started.
  const canManage = currentWorkspace.role === 'owner' || currentWorkspace.role === 'admin';
  const checklistHidden = (await cookies()).get(checklistCookie(currentWorkspace.id))?.value === '1';
  let checklist: ChecklistState | null = null;
  if (canManage && !checklistHidden) {
    const [[activity], [pendingInvites], [own]] = await Promise.all([
      db
        .select({
          projects: sql<number>`count(*) filter (where ${activityLog.action} = 'project.created')::int`,
          tasks: sql<number>`count(*) filter (where ${activityLog.action} = 'task.created')::int`,
        })
        .from(activityLog)
        .where(eq(activityLog.workspaceId, currentWorkspace.id)),
      db
        .select({ n: count() })
        .from(workspaceInvite)
        .where(and(eq(workspaceInvite.workspaceId, currentWorkspace.id), eq(workspaceInvite.status, 'pending'))),
      db
        .select({
          projects: sql<number>`count(distinct ${project.id})::int`,
          tasks: sql<number>`count(${task.id})::int`,
        })
        .from(project)
        .leftJoin(task, eq(task.projectId, project.id))
        .where(and(eq(project.workspaceId, currentWorkspace.id), ne(project.name, GETTING_STARTED_NAME))),
    ]);
    const state: ChecklistState = {
      createdProject: (activity?.projects ?? 0) > 0 || (own?.projects ?? 0) > 0,
      addedTask: (activity?.tasks ?? 0) > 0 || (own?.tasks ?? 0) > 0,
      invitedTeammate: memberCount > 1 || (pendingInvites?.n ?? 0) > 0,
    };
    // Once everything is done, it gets out of the way by itself.
    if (!(state.createdProject && state.addedTask && state.invitedTeammate)) checklist = state;
  }

  const firstName = session.user.name?.split(' ')[0] ?? 'there';

  return (
    <div className='flex-1 p-6 md:p-8 space-y-8 max-w-5xl'>
      <div>
        <h1 className='text-2xl font-semibold'>Welcome back, {firstName}</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Here&apos;s an overview of{' '}
          <span className='font-medium text-foreground'>
            {currentWorkspace.name}
          </span>
          .
        </p>
      </div>

      {checklist && (
        <OnboardingChecklist
          workspaceId={currentWorkspace.id}
          workspaceSlug={workspaceSlug}
          taskHref={projects[0] ? `/workspaces/${workspaceSlug}/projects/${projects[0].id}` : null}
          state={checklist}
        />
      )}

      {projects.length > 0 && <StudioOverview workspaceSlug={workspaceSlug} data={overview} />}

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Active projects</h2>
        </div>

        {projects.length === 0 ? (
          <Card className='border-dashed'>
            <EmptyState
              icon={Briefcase}
              title='No projects yet'
              action={<CreateProjectDialog variant='button' label='Create a project' />}>
              A project holds a board of tasks: a launch, a client, a sprint.
            </EmptyState>
          </Card>
        ) : (
          <ul aria-label='Active projects' className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/workspaces/${workspaceSlug}/projects/${p.id}`}>
                  <Card className='h-full gap-3 transition-shadow hover:shadow-md cursor-pointer'>
                    <CardHeader className='pb-0'>
                      <CardTitle className='text-sm font-semibold truncate'>{p.name}</CardTitle>
                      {p.description && (
                        <CardDescription className='text-xs line-clamp-2'>{p.description}</CardDescription>
                      )}
                      <ProjectDetails clientName={p.clientName} deadline={p.deadline} status={p.status} />
                    </CardHeader>
                    <CardContent className='mt-auto space-y-1.5'>
                      <div className='flex items-center justify-between text-xs text-muted-foreground'>
                        <span>
                          {p.totalTasks === 0
                            ? 'No tasks yet'
                            : `${p.doneTasks} of ${p.totalTasks} ${p.totalTasks === 1 ? 'task' : 'tasks'} done`}
                        </span>
                        <ArrowRight className='size-3.5' aria-hidden />
                      </div>
                      {p.totalTasks > 0 && (
                        <div
                          role='progressbar'
                          aria-label={`${p.name} progress`}
                          aria-valuemin={0}
                          aria-valuemax={p.totalTasks}
                          aria-valuenow={p.doneTasks}
                          className='h-1 overflow-hidden rounded-full bg-muted'>
                          <div
                            className='h-full bg-primary'
                            style={{ width: `${(p.doneTasks / p.totalTasks) * 100}%` }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

/**
 * A client's home: the projects this studio shared with them, and nothing
 * about the team or the rest of the workspace.
 */
async function GuestHome({
  workspace,
  userId,
  userName,
}: Readonly<{ workspace: { id: string; name: string; slug: string }; userId: string; userName: string | null }>) {
  const shared = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      clientName: project.clientName,
      deadline: project.deadline,
      status: project.status,
    })
    .from(projectGuest)
    .innerJoin(project, eq(project.id, projectGuest.projectId))
    .where(and(eq(projectGuest.userId, userId), eq(project.workspaceId, workspace.id), isNull(project.archivedAt)))
    .orderBy(project.name);
  // C3: what's waiting on this client, across the projects shared with them.
  const waiting = await db
    .select({ taskId: task.id, title: task.title, projectId: project.id, projectName: project.name })
    .from(taskApproval)
    .innerJoin(task, eq(task.id, taskApproval.taskId))
    .innerJoin(project, eq(project.id, task.projectId))
    .innerJoin(projectGuest, and(eq(projectGuest.projectId, project.id), eq(projectGuest.userId, userId)))
    .where(and(eq(taskApproval.status, 'pending'), eq(project.workspaceId, workspace.id), isNull(project.archivedAt)))
    .orderBy(taskApproval.createdAt)
    .limit(20);
  const firstName = userName?.split(' ')[0] ?? 'there';

  return (
    <div className='flex-1 p-6 md:p-8 space-y-8 max-w-5xl'>
      <div>
        <h1 className='text-2xl font-semibold'>Welcome, {firstName}</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Projects <span className='font-medium text-foreground'>{workspace.name}</span> shared with you. Open one to
          follow progress and leave comments.
        </p>
      </div>
      {waiting.length > 0 && (
        <section className='space-y-2'>
          <h2 className='text-sm font-semibold flex items-center gap-1.5'>
            <Stamp className='size-4 text-amber-600 dark:text-amber-400' aria-hidden />
            Waiting for your approval
          </h2>
          <ul aria-label='Waiting for your approval' className='divide-y rounded-lg border'>
            {waiting.map((w) => (
              <li key={w.taskId}>
                <Link
                  href={taskHref(workspace.slug, w.projectId, w.taskId)}
                  className='flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50'>
                  <span className='truncate font-medium'>{w.title}</span>
                  <span className='shrink-0 text-xs text-muted-foreground'>{w.projectName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {shared.length === 0 ? (
        <Card className='border-dashed'>
          <EmptyState icon={Briefcase} title='Nothing shared yet'>
            When {workspace.name} shares a project with you, it shows up here.
          </EmptyState>
        </Card>
      ) : (
        <ul aria-label='Shared projects' className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {shared.map((p) => (
            <li key={p.id}>
              <Link href={`/workspaces/${workspace.slug}/projects/${p.id}`}>
                <Card className='h-full transition-shadow hover:shadow-md cursor-pointer'>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-semibold truncate'>{p.name}</CardTitle>
                    {p.description && (
                      <CardDescription className='text-xs line-clamp-2'>{p.description}</CardDescription>
                    )}
                    <ProjectDetails clientName={p.clientName} deadline={p.deadline} status={p.status} />
                  </CardHeader>
                  <CardContent className='flex justify-end'>
                    <ArrowRight className='size-3.5 text-muted-foreground' />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
