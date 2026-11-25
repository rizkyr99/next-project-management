import { db } from '@/db/drizzle';
import { project, task } from '@/db/schema';
import { EmptyState } from '@/components/empty-state';
import { Card } from '@/components/ui/card';
import { ProjectDetails } from '@/features/projects/components/project-details';
import { RestoreProjectButton } from '@/features/projects/components/restore-project-button';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { Archive } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Archived projects' };

/** Finished projects, out of the sidebar but kept, and one click from coming back. */
export default async function ArchivedProjectsPage({
  params,
}: {
  params: Promise<{ readonly workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const ws = await getActiveWorkspace(workspaceSlug, session.user.id);
  if (!ws) redirect('/create-workspace');
  if (ws.role === 'guest') redirect(`/workspaces/${workspaceSlug}`);

  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      clientName: project.clientName,
      deadline: project.deadline,
      status: project.status,
      archivedAt: project.archivedAt,
      tasks: count(task.id),
    })
    .from(project)
    .leftJoin(task, eq(task.projectId, project.id))
    .where(and(eq(project.workspaceId, ws.id), isNotNull(project.archivedAt)))
    .groupBy(project.id)
    .orderBy(desc(project.archivedAt));

  return (
    <div className='flex-1 p-6 md:p-8 space-y-6 max-w-3xl'>
      <div>
        <h1 className='text-2xl font-semibold'>Archived projects</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Finished work, kept with all its tasks and comments. Archived projects still show up in search.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card className='border-dashed'>
          <EmptyState icon={Archive} title='Nothing archived'>
            Archive a finished project from its ⋯ menu to clear it out of the sidebar.
          </EmptyState>
        </Card>
      ) : (
        <ul aria-label='Archived projects' className='divide-y rounded-lg border'>
          {projects.map((p) => (
            <li key={p.id} className='flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3'>
              <div className='min-w-0 flex-1 space-y-1'>
                <Link
                  href={`/workspaces/${workspaceSlug}/projects/${p.id}`}
                  className='block truncate text-sm font-medium hover:underline'>
                  {p.name}
                </Link>
                <ProjectDetails clientName={p.clientName} deadline={p.deadline} status={p.status} />
                <p className='text-xs text-muted-foreground'>
                  {p.tasks} {p.tasks === 1 ? 'task' : 'tasks'} · archived{' '}
                  {p.archivedAt!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <RestoreProjectButton projectId={p.id} projectName={p.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
