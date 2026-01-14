import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
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
    <SidebarProvider>
      <div className='flex h-screen overflow-hidden'>
        <AppSidebar workspaces={userWorkspaces} />
        <main>
          <SidebarTrigger />
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
