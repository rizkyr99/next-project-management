'use client';
import { BadgeCheck, LogOut, UserPlus2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { SidebarTrigger } from './ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { useParams, useRouter } from 'next/navigation';
import { NotificationsPopover } from './notifications-popover';
import { GlobalSearch } from '@/features/search/components/global-search';
import { ThemeToggle } from './theme-toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { InviteMemberForm } from '@/features/workspaces/components/invite-member-form';
import { Button } from './ui/button';

export function Header() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug;

  const user = session?.user;
  const userName = user?.name || user?.email || 'User';
  const userEmail = user?.email || 'No email';
  const initialsSource = user?.name || user?.email || 'U';
  const initials = initialsSource
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/login');
        },
      },
    });
  };

  return (
    <header className='h-16 border-b flex justify-between items-center px-4 shrink-0 w-full min-w-0'>
      <SidebarTrigger />
      <div className='flex items-center gap-2 sm:gap-4 min-w-0'>
        {workspaceSlug && <GlobalSearch />}
        {typeof workspaceSlug === 'string' && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size='sm' className='sm:size-auto' aria-label='Invite to workspace'>
                <UserPlus2 />
                <span className='hidden sm:inline'>Invite</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite to workspace</DialogTitle>
                <DialogDescription>
                  They&apos;ll get an email with a link to join. Only owners and admins can invite.
                </DialogDescription>
              </DialogHeader>
              <InviteMemberForm workspaceSlug={workspaceSlug} canInvite compact />
            </DialogContent>
          </Dialog>
        )}

        <ThemeToggle />
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className=''>
              <Avatar className='size-8 rounded-lg'>
                <AvatarImage
                  src={user?.image || undefined}
                  referrerPolicy='no-referrer'
                />
                <AvatarFallback className='rounded-lg'>
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            side='bottom'
            sideOffset={8}
            className='min-w-64'>
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
                <Avatar className='size-8 rounded-lg'>
                  <AvatarImage
                    src={user?.image || undefined}
                    referrerPolicy='no-referrer'
                  />
                  <AvatarFallback className='rounded-lg'>
                    {initials || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-medium'>{userName}</span>
                  <span className='truncate text-xs'>{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/workspaces/${workspaceSlug}/account`)
                }>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
