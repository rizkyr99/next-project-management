import { db } from '@/db/drizzle';
import {
  activityLog,
  member,
  project,
  task,
  taskStatus,
  user,
  workspaceInvite,
} from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, count, eq, ne, sql } from 'drizzle-orm';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Briefcase, CheckSquare, Users, ArrowRight } from 'lucide-react';

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

  const [projects, taskCountsRaw, members] = await Promise.all([
    db
      .select({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
      })
      .from(project)
      .where(eq(project.workspaceId, currentWorkspace.id)),
    db
      .select({ projectId: task.projectId, count: count() })
      .from(task)
      .innerJoin(taskStatus, eq(task.statusId, taskStatus.id))
      .innerJoin(project, eq(taskStatus.projectId, project.id))
      .where(eq(project.workspaceId, currentWorkspace.id))
      .groupBy(task.projectId),
    db
      .select({
        id: member.id,
        name: user.name,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.workspaceId, currentWorkspace.id)),
  ]);

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
      invitedTeammate: members.length > 1 || (pendingInvites?.n ?? 0) > 0,
    };
    // Once everything is done, it gets out of the way by itself.
    if (!(state.createdProject && state.addedTask && state.invitedTeammate)) checklist = state;
  }

  const taskCountMap = Object.fromEntries(
    taskCountsRaw.map((r) => [r.projectId, r.count]),
  );

  const totalTasks = taskCountsRaw.reduce((sum, r) => sum + r.count, 0);

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

      <div className='grid gap-4 sm:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Projects
            </CardTitle>
            <Briefcase className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total tasks
            </CardTitle>
            <CheckSquare className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalTasks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Members
            </CardTitle>
            <Users className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{members.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Projects</h2>
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
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/workspaces/${workspaceSlug}/projects/${p.id}`}>
                <Card className='h-full transition-shadow hover:shadow-md cursor-pointer'>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-semibold truncate'>
                      {p.name}
                    </CardTitle>
                    {p.description && (
                      <CardDescription className='text-xs line-clamp-2'>
                        {p.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className='flex items-center justify-between'>
                    <span className='text-xs text-muted-foreground'>
                      {taskCountMap[p.id] ?? 0}{' '}
                      {(taskCountMap[p.id] ?? 0) === 1 ? 'task' : 'tasks'}
                    </span>
                    <ArrowRight className='size-3.5 text-muted-foreground' />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className='space-y-3'>
        <h2 className='text-base font-semibold'>Members</h2>
        <Card>
          <CardContent className='divide-y p-0'>
            {members.map((m) => (
              <div key={m.id} className='flex items-center gap-3 px-4 py-3'>
                <Avatar className='size-8'>
                  <AvatarFallback className='text-xs'>
                    {m.name?.charAt(0).toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className='flex-1 text-sm font-medium'>{m.name}</span>
                <Badge
                  variant={
                    m.role === 'owner'
                      ? 'default'
                      : m.role === 'admin'
                        ? 'secondary'
                        : 'outline'
                  }
                  className='text-xs capitalize'>
                  {m.role}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
