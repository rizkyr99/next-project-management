import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { getWorkspaceActivity } from '@/features/activity/actions';
import { db } from '@/db/drizzle';
import { member, project, user, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, asc, eq } from 'drizzle-orm';
import { ActivityFilters } from '@/features/activity/components/activity-filters';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ project?: string; person?: string }>;
}) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [currentWorkspace] = await db
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.slug, workspaceSlug));

  if (!currentWorkspace) redirect('/create-workspace');

  const [currentMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.workspaceId, currentWorkspace.id), eq(member.userId, session.user.id)));

  if (!currentMember) redirect('/create-workspace');

  const filters = {
    projectId: typeof query.project === 'string' ? query.project : undefined,
    actorId: typeof query.person === 'string' ? query.person : undefined,
  };
  const [{ items, nextCursor }, projects, people] = await Promise.all([
    getWorkspaceActivity(currentWorkspace.id, undefined, filters),
    db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(eq(project.workspaceId, currentWorkspace.id))
      .orderBy(asc(project.name)),
    db
      .select({ id: user.id, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.workspaceId, currentWorkspace.id))
      .orderBy(asc(user.name)),
  ]);

  return (
    <div className='flex-1 p-6 md:p-8 max-w-3xl space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Activity</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          A log of all actions taken in{' '}
          <span className='font-medium text-foreground'>{currentWorkspace.name}</span>.
        </p>
      </div>

      <Suspense>
        <ActivityFilters projects={projects} people={people} />
      </Suspense>

      <ActivityFeed
        // A new filter starts a new feed (its own pages and "load more").
        key={`${filters.projectId ?? ''}|${filters.actorId ?? ''}`}
        filters={filters}
        workspaceId={currentWorkspace.id}
        workspaceSlug={workspaceSlug}
        initialItems={items}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
