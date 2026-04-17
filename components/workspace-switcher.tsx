'use client';
import { useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from './ui/sidebar';
import { Briefcase, ChevronsUpDown } from 'lucide-react';
import { CreateWorkspaceDialog } from '@/features/workspaces/components/create-workspace-dialog';
import { useParams, useRouter } from 'next/navigation';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceSwitcherProps {
  workspaces?: Workspace[];
  atWorkspaceLimit?: boolean;
}

export function WorkspaceSwitcher({ workspaces = [], atWorkspaceLimit }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [optimisticSlug, setOptimisticSlug] = useState<string | null>(null);
  const { isMobile, setOpenMobile } = useSidebar();

  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug;

  const activeWorkspace = useMemo(() => {
    if (!workspaces.length) return null;
    const currentSlug = optimisticSlug ?? slug;
    return workspaces.find((w) => w.slug === currentSlug) ?? workspaces[0] ?? null;
  }, [slug, optimisticSlug, workspaces]);

  const handleSelectWorkspace = (workspace: Workspace) => {
    setOptimisticSlug(workspace.slug);
    router.push(`/workspaces/${workspace.slug}`);
    setOpen(false);
    if (isMobile) setOpenMobile(false);
  };

  if (!activeWorkspace) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
              <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-bold'>
                {activeWorkspace.name.charAt(0).toUpperCase()}
              </div>
              <div className='flex-1 text-sm leading-tight'>
                <span className='truncate font-medium'>
                  {activeWorkspace.name}
                </span>
              </div>
              <ChevronsUpDown className='ml-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            align='start'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}>
            <DropdownMenuLabel className='text-muted-foreground text-xs'>
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => handleSelectWorkspace(workspace)}
                className='p-2'>
                <div className='flex size-6 items-center justify-center rounded-md border'>
                  <Briefcase className='size-3.5 shrink-0' />
                </div>
                {workspace.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <CreateWorkspaceDialog onSuccess={() => setOpen(false)} disabled={atWorkspaceLimit} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
