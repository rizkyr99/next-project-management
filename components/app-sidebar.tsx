'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { Activity, CheckSquare, CreditCard, Home, List, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  workspaces: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member';
  }[];
  projects: {
    id: string;
    name: string;
  }[];
  atWorkspaceLimit?: boolean;
}

export function AppSidebar({ workspaces, projects, atWorkspaceLimit }: AppSidebarProps) {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug, projectId } = params;
  const { isMobile, setOpenMobile } = useSidebar();

  const closeSidebarOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const items = [
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

  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} atWorkspaceLimit={atWorkspaceLimit} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url} onClick={closeSidebarOnMobile}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <CreateProjectDialog />
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.length === 0 && (
                <div className='text-xs text-muted-foreground p-2'>
                  No projects found.
                </div>
              )}
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton asChild>
                    <Link
                      href={`/workspaces/${workspaceSlug}/projects/${project.id}`}
                      onClick={closeSidebarOnMobile}
                      className={cn(
                        projectId === project.id && 'bg-muted font-medium'
                      )}>
                      <List />
                      <span>{project.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {atWorkspaceLimit && (
        <SidebarFooter>
          <Link
            href='/settings/billing'
            className='flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm hover:bg-primary/10 transition-colors'>
            <Sparkles className='size-4 text-primary mt-0.5 shrink-0' />
            <div>
              <p className='font-medium text-primary leading-tight'>Workspace limit reached</p>
              <p className='text-xs text-muted-foreground mt-0.5'>Upgrade your plan to create more workspaces.</p>
            </div>
          </Link>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
