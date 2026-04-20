import { AppSidebar } from '@/components/app-sidebar';
import { Header } from '@/components/header';
import { db } from '@/db/drizzle';
import { member, project, workspace } from '@/db/schema';
import { auth } from '@/lib/auth';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const [userWorkspaces, limitCheck] = await Promise.all([
    db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(workspace, eq(member.workspaceId, workspace.id))
      .where(eq(member.userId, session.user.id)),
    checkWorkspaceLimit(session.user.id),
  ]);

  if (userWorkspaces.length === 0) {
    redirect('/create-workspace');
  }

  const activeWorkspace = userWorkspaces.find((w) => w.slug === workspaceSlug);

  const workspaceProjects = activeWorkspace
    ? await db.select().from(project).where(eq(project.workspaceId, activeWorkspace.id))
    : [];

  return (
    <>
      <AppSidebar workspaces={userWorkspaces} projects={workspaceProjects} atWorkspaceLimit={!limitCheck.allowed} />
      <div className='flex-1 h-screen overflow-x-auto flex flex-col'>
        <Header />
        <main className='flex-1'>{children}</main>
      </div>
    </>
  );
}
