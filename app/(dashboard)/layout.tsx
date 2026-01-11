import { db } from '@/db/drizzle';
import { member, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const userWorkspaces = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(workspace, eq(member.workspaceId, workspace.id))
    .where(eq(member.userId, session.user.id));

  if (userWorkspaces.length === 0) {
    redirect('/create-workspace');
  }

  return (
    <div className='flex h-screen overflow-hidden'>
      <aside className='hidden md:flex w-64 flex-col border-r bg-card'></aside>
      <main>{children}</main>
    </div>
  );
}
