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
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from './workspace-switcher';
import { CheckSquare, CreditCard, Home, List, Settings } from 'lucide-react';
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
}

export function AppSidebar({ workspaces, projects }: AppSidebarProps) {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug, projectId } = params;

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
        <WorkspaceSwitcher workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
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
    </Sidebar>
  );
}
