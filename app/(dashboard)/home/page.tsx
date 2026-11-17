import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { listPendingInvitesForUser } from '@/lib/invites';

/**
 * Where signed-in people land (the proxy sends them here from `/`, which is
 * the public landing page): their first workspace, their invites, or
 * onboarding.
 */
export default async function HomeRedirectPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userWorkspaces = await db
    .select({
      slug: workspace.slug,
    })
    .from(member)
    .innerJoin(workspace, eq(member.workspaceId, workspace.id))
    .where(eq(member.userId, session.user.id));

  if (userWorkspaces.length === 0) {
    // Someone who signed up without going through an invite link still
    // shouldn't end up creating a workspace when a team is waiting for them.
    const pending = await listPendingInvitesForUser(session.user);
    redirect(pending.length > 0 ? '/invites' : '/create-workspace');
  }

  redirect(`/workspaces/${userWorkspaces[0].slug}`);
}
