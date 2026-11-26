import { UpgradeProvider } from '@/features/billing/components/upgrade';
import { planSummaryBySlug } from '@/lib/subscription';
import { AppSidebar } from '@/components/app-sidebar';
import { Header } from '@/components/header';
import { VerifyEmailBanner } from '@/features/account/components/verify-email-banner';
import { db } from '@/db/drizzle';
import { member, project, projectGuest, workspace, projectFavorite } from '@/db/schema';
import { getSession } from '@/lib/auth-session';
import { getActiveWorkspace } from '@/lib/workspace-context';
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const session = await getSession();
  // Resolved through the viewer's membership (React-cached with the layout's
  // own lookup), so a foreign slug never leaks a workspace name via <title>.
  const ws = session ? await getActiveWorkspace(workspaceSlug, session.user.id) : null;
  if (!ws) return {};
  return {
    title: { default: ws.name, template: `%s · ${ws.name} · Tide` },
    robots: { index: false, follow: false },
  };
}

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

  const [userWorkspaces, activeWorkspace, workspaceProjects, planSummary] = await Promise.all([
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
    getActiveWorkspace(workspaceSlug, session.user.id),
    // Joined through the caller's membership so a foreign slug yields nothing.
    db
      .select({
        id: project.id,
        name: project.name,
        description: project.description,
        clientName: project.clientName,
        deadline: project.deadline,
        status: project.status,
        archivedAt: project.archivedAt,
        createdAt: project.createdAt,
        workspaceId: project.workspaceId,
        favoritedAt: projectFavorite.createdAt,
      })
      .from(project)
      .innerJoin(workspace, eq(project.workspaceId, workspace.id))
      .innerJoin(
        member,
        and(eq(member.workspaceId, workspace.id), eq(member.userId, session.user.id)),
      )
      .leftJoin(
        projectFavorite,
        and(eq(projectFavorite.projectId, project.id), eq(projectFavorite.userId, session.user.id)),
      )
      .leftJoin(projectGuest, and(eq(projectGuest.projectId, project.id), eq(projectGuest.userId, session.user.id)))
      .where(
        and(
          eq(workspace.slug, workspaceSlug),
          // Guests (clients) see only the active projects shared with them.
          or(ne(member.role, 'guest'), and(isNotNull(projectGuest.projectId), isNull(project.archivedAt))),
        ),
      ),
    // E3: the plan behind upgrade prompts, in one query alongside the rest.
    // Only used once membership is confirmed below; the server enforces every gate too.
    planSummaryBySlug(workspaceSlug),
  ]);

  if (userWorkspaces.length === 0) {
    redirect('/create-workspace');
  }

  // Not a member (or no such workspace): render nothing from this workspace.
  if (!activeWorkspace) {
    notFound();
  }

  return (
    <UpgradeProvider
      workspaceSlug={workspaceSlug}
      plan={planSummary?.plan ?? 'free'}
      isOwner={activeWorkspace.role === 'owner'}
      teamMembers={planSummary?.teamMembers ?? 1}>
      <AppSidebar workspaces={userWorkspaces} projects={workspaceProjects} />
      <div className='flex-1 h-screen overflow-x-auto flex flex-col'>
        <Header
          role={activeWorkspace.role}
          projects={workspaceProjects.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }))}
        />
        {!session.user.emailVerified && <VerifyEmailBanner email={session.user.email} />}
        <main className='flex-1'>{children}</main>
      </div>
    </UpgradeProvider>
  );
}
