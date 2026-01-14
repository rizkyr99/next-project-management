import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

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
    redirect('/create-workspace');
  }

  redirect(`/${userWorkspaces[0].slug}`);
}
