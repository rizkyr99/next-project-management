import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from './workspace-switcher';

export function AppSidebar() {
  const workspaces = [
    {
      id: '1',
      name: 'Workspace 1',
      slug: 'workspace-1',
    },
  ];
  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup />
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
