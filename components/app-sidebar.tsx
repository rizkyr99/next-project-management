'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from './workspace-switcher';
import { Activity, Archive, CheckSquare, CreditCard, Home, List, Settings, Star } from 'lucide-react';
import type { ProjectStatus } from '@/features/projects/details';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { LinkPending } from './link-pending';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { ProjectActionsMenu } from '@/features/projects/components/project-actions-menu';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  workspaces: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member' | 'guest';
  }[];
  projects: {
    id: string;
    name: string;
    description: string | null;
    clientName: string | null;
    deadline: string | null;
    status: ProjectStatus | null;
    /** Archived projects aren't listed; they're counted under "Archived". */
    archivedAt: Date | null;
    /** When I starred it; null if not a favourite. */
    favoritedAt: Date | null;
  }[];
}

export function AppSidebar({ workspaces, projects }: AppSidebarProps) {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const pathname = usePathname();
  const { workspaceSlug, projectId } = params;
  const { isMobile, setOpenMobile } = useSidebar();
  const role = workspaces.find((w) => w.slug === workspaceSlug)?.role;
  const canDeleteProjects = role === 'owner' || role === 'admin';
  // Clients see their shared projects and nothing else of the workspace.
  const isGuest = role === 'guest';

  const closeSidebarOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const allItems = [
    {
      title: 'Home',
      url: `/workspaces/${workspaceSlug}`,
      icon: Home,
    },
    {
      title: 'My tasks',
      url: `/workspaces/${workspaceSlug}/my-tasks`,
      icon: CheckSquare,
    },
    {
      title: 'Activity',
      url: `/workspaces/${workspaceSlug}/activity`,
      icon: Activity,
    },
    {
      title: 'Settings',
      url: `/workspaces/${workspaceSlug}/settings`,
      icon: Settings,
    },
    {
      title: 'Billing',
      url: `/settings/billing`,
      icon: CreditCard,
    },
  ];
  const items = isGuest ? allItems.filter((item) => item.title === 'Home') : allItems;


  // Archived projects live on their own page, linked under the list.
  const active = projects.filter((p) => !p.archivedAt);
  const archivedCount = projects.length - active.length;
  const archivedUrl = `/workspaces/${workspaceSlug}/archived`;

  // Starred projects get their own group at the top, in the order starred.
  const favorites = active
    .filter((p) => p.favoritedAt)
    .sort((a, b) => new Date(a.favoritedAt!).getTime() - new Date(b.favoritedAt!).getTime());
  const others = active.filter((p) => !p.favoritedAt);

  const renderProject = (project: AppSidebarProps['projects'][number], favorite: boolean) => (
    <SidebarMenuItem key={project.id}>
      <SidebarMenuButton asChild>
        <Link
          href={`/workspaces/${workspaceSlug}/projects/${project.id}`}
          onClick={closeSidebarOnMobile}
          aria-current={projectId === project.id ? 'page' : undefined}
          className={cn(projectId === project.id && 'bg-muted font-medium')}>
          {favorite ? <Star className='fill-current text-amber-500' /> : <List />}
          <span>{project.name}</span>
          <LinkPending />
        </Link>
      </SidebarMenuButton>
      {!isGuest && (
        <ProjectActionsMenu project={{ ...project, favorite }} canDelete={canDeleteProjects} variant='sidebar' />
      )}
    </SidebarMenuItem>
  );

  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link
                      href={item.url}
                      onClick={closeSidebarOnMobile}
                      aria-current={pathname === item.url ? 'page' : undefined}>
                      <item.icon />
                      <span>{item.title}</span>
                      <LinkPending />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {favorites.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Favourites</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu aria-label='Favourite projects'>
                {favorites.map((project) => renderProject(project, true))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>{isGuest ? 'Shared with you' : 'Projects'}</SidebarGroupLabel>
          {!isGuest && <CreateProjectDialog />}
          <SidebarGroupContent>
            <SidebarMenu aria-label='Projects'>
              {active.length === 0 && (
                <div className='text-xs text-muted-foreground p-2'>
                  {isGuest
                    ? 'Nothing is shared with you here yet.'
                    : archivedCount > 0
                      ? 'No active projects. Use + to start one.'
                      : 'No projects yet. Use + to create one.'}
                </div>
              )}
              {others.map((project) => renderProject(project, false))}
            </SidebarMenu>
            {archivedCount > 0 && (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === archivedUrl} size='sm'>
                    <Link
                      href={archivedUrl}
                      onClick={closeSidebarOnMobile}
                      aria-current={pathname === archivedUrl ? 'page' : undefined}
                      className='text-muted-foreground'>
                      <Archive />
                      <span>Archived</span>
                      <span className='ml-auto text-xs tabular-nums'>{archivedCount}</span>
                      <LinkPending />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
