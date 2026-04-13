import { db } from '@/db/drizzle';
import {
  member,
  project,
  task,
  taskStatus,
  user,
  workspace,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [currentWorkspace] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.slug, workspaceSlug));

  if (!currentWorkspace) redirect('/create-workspace');

  const [currentMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.workspaceId, currentWorkspace.id),
        eq(member.userId, session.user.id),
      ),
    );

  if (!currentMember) redirect('/create-workspace');

  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(eq(project.workspaceId, currentWorkspace.id));

  const taskCountsRaw = await db
    .select({ projectId: task.projectId, count: count() })
    .from(task)
    .innerJoin(taskStatus, eq(task.statusId, taskStatus.id))
    .innerJoin(project, eq(taskStatus.projectId, project.id))
    .where(eq(project.workspaceId, currentWorkspace.id))
    .groupBy(task.projectId);

  const taskCountMap = Object.fromEntries(
    taskCountsRaw.map((r) => [r.projectId, r.count]),
  );

  const totalTasks = taskCountsRaw.reduce((sum, r) => sum + r.count, 0);

  const members = await db
    .select({
      id: member.id,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.workspaceId, currentWorkspace.id));

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
            <CardContent className='flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground gap-1'>
              <Briefcase className='size-8 mb-2 opacity-30' />
              <p className='font-medium'>No projects yet</p>
              <p>Create your first project from the sidebar.</p>
            </CardContent>
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
