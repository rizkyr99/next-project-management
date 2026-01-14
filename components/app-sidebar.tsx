import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from './workspace-switcher';

interface AppSidebarProps {
  workspaces: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member';
  }[];
}

export function AppSidebar({ workspaces }: AppSidebarProps) {
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
