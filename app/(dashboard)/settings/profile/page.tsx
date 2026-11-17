import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

/** Profile settings live on the workspace-scoped Account page; this URL forwards there. */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackURL=%2Fsettings%2Fprofile');

  const [first] = await db
    .select({ slug: workspace.slug })
    .from(member)
    .innerJoin(workspace, eq(member.workspaceId, workspace.id))
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt))
    .limit(1);

  redirect(first ? `/workspaces/${first.slug}/account` : '/create-workspace');
}
