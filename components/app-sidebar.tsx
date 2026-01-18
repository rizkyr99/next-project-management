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
import { CheckSquare, Dumbbell, Home, Settings } from 'lucide-react';
import Link from 'next/link';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';

interface AppSidebarProps {
  workspaces: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member';
  }[];
}

const items = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
  },
  {
    title: 'My tasks',
    url: '/my-tasks',
    icon: CheckSquare,
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
  },
];

const projects = [{ title: 'Forge Gym', url: 'forge', icon: Dumbbell }];

export function AppSidebar({ workspaces }: AppSidebarProps) {
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
                <SidebarMenuItem key={project.url}>
                  <SidebarMenuButton asChild>
                    <Link href={project.url}>
                      <project.icon />
                      <span>{project.title}</span>
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
