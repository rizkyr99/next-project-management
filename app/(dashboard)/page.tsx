import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { listPendingInvitesForUser } from '@/lib/invites';

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  const userWorkspaces = await db
    .select({
      slug: workspace.slug,
    })
    .from(member)
    .innerJoin(workspace, eq(member.workspaceId, workspace.id))
    .where(eq(member.userId, session!.user.id));

  if (userWorkspaces.length === 0) {
    // Someone who signed up without going through an invite link still
    // shouldn't end up creating a workspace when a team is waiting for them.
    const pending = await listPendingInvitesForUser(session!.user);
    redirect(pending.length > 0 ? '/invites' : '/create-workspace');
  }

  redirect(`/workspaces/${userWorkspaces[0].slug}`);
}
