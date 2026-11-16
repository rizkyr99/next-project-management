import { AppSidebar } from '@/components/app-sidebar';
import { Header } from '@/components/header';
import { db } from '@/db/drizzle';
import { member, project, workspace } from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { checkWorkspaceLimit } from '@/lib/subscription';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';

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

  const [userWorkspaces, limitCheck, activeWorkspace, workspaceProjects] = await Promise.all([
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
    getActiveWorkspace(workspaceSlug, session.user.id),
    // Joined through the caller's membership so a foreign slug yields nothing.
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
      .innerJoin(
        member,
        and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)),
      )
      .where(eq(workspace.slug, workspaceSlug)),
  ]);

  if (userWorkspaces.length === 0) {
    redirect('/create-workspace');
  }

  // Not a member (or no such workspace): render nothing from this workspace.
  if (!activeWorkspace) {
    notFound();
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
