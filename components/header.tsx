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
import { Input } from './ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { useForm } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { inviteUserToWorkspace } from '@/features/workspaces/actions';
import { toast } from 'sonner';

const inviteUserFormSchema = z.object({
  email: z.email('Invalid email address'),
  role: z.enum(['member', 'admin']),
});

export function Header() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug;

  console.log(workspaceSlug);

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

  const form = useForm<z.infer<typeof inviteUserFormSchema>>({
    resolver: zodResolver(inviteUserFormSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/login');
        },
      },
    });
  };

  const onSubmit = async (values: z.infer<typeof inviteUserFormSchema>) => {
    if (!workspaceSlug) return;
    const result = await inviteUserToWorkspace(workspaceSlug as string, values);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`${result?.name} has been added to the workspace`);
      form.reset();
    }
  };

  return (
    <header className='h-16 border-b flex justify-between items-center px-4 shrink-0'>
      <SidebarTrigger />
      <div className='flex items-center gap-4'>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <UserPlus2 />
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite new user</DialogTitle>
              <DialogDescription>
                Add new user to your workspace to collaborate with them.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4'>
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='email'
                          placeholder='e.g. john.doe@example.com'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Select role' />
                          </SelectTrigger>
                          <SelectContent side='bottom'>
                            <SelectGroup>
                              <SelectItem value='member'>Member</SelectItem>
                              <SelectItem value='admin'>Admin</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant='ghost'>Cancel</Button>
                  </DialogClose>
                  <Button type='submit'>Invite</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

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
