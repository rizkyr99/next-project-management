import { AppSidebar } from '@/components/app-sidebar';
import { Header } from '@/components/header';
import { db } from '@/db/drizzle';
import { member, project, workspace } from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const [userWorkspaces, limitCheck, workspaceProjects] = await Promise.all([
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
    db
      .select({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        workspaceId: project.workspaceId,
      })
      .from(project)
      .innerJoin(workspace, eq(project.workspaceId, workspace.id))
      .where(eq(workspace.slug, workspaceSlug)),
    getActiveWorkspace(workspaceSlug, session.user.id),
  ]);

  if (userWorkspaces.length === 0) {
    redirect('/create-workspace');
  }

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
