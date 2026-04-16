import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { getWorkspaceActivity } from '@/features/activity/actions';
import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

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

  const { items, nextCursor } = await getWorkspaceActivity(currentWorkspace.id);

  return (
    <div className='flex-1 p-6 md:p-8 max-w-3xl space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Activity</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          A log of all actions taken in{' '}
          <span className='font-medium text-foreground'>{currentWorkspace.name}</span>.
        </p>
      </div>

      <ActivityFeed
        workspaceId={currentWorkspace.id}
        initialItems={items}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
