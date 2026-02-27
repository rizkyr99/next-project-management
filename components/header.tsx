'use client';
import { BadgeCheck, Bell, LogOut } from 'lucide-react';
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
import { Button } from './ui/button';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

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
    <header className='h-16 border-b flex justify-between items-center px-4 shrink-0'>
      <SidebarTrigger />
      <div className='flex items-center gap-4'>
        <Button variant='ghost' size='icon-sm'>
          <Bell />
        </Button>
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
              <DropdownMenuItem>
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
