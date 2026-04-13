'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ShieldCheck, User, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { changeMemberRole, removeMember } from '../actions';

interface WorkspaceMember {
  id: string;
  name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
}

interface MemberListProps {
  members: WorkspaceMember[];
  workspaceSlug: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
};

export function MemberList({
  members,
  workspaceSlug,
  currentUserId,
  currentUserRole,
}: MemberListProps) {
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleRemove = async (memberId: string, name: string | null) => {
    const result = await removeMember(workspaceSlug, memberId);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success(`${name ?? 'Member'} removed`, { position: 'top-center' });
    }
  };

  const handleRoleChange = async (
    memberId: string,
    newRole: 'admin' | 'member',
    name: string | null,
  ) => {
    const result = await changeMemberRole(workspaceSlug, memberId, newRole);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success(`${name ?? 'Member'} is now ${newRole}`, {
        position: 'top-center',
      });
    }
  };

  return (
    <div className='divide-y rounded-md border'>
      {members.map((m) => {
        const isSelf = m.id === currentUserId;
        const canActOnMember =
          canManage &&
          !isSelf &&
          m.role !== 'owner' &&
          !(currentUserRole === 'admin' && m.role === 'admin');

        return (
          <div
            key={m.id}
            className='flex items-center justify-between gap-4 px-4 py-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <Avatar>
                <AvatarFallback>
                  {m.name?.charAt(0).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-sm font-medium'>{m.name}</span>
                  {isSelf && (
                    <span className='text-xs text-muted-foreground'>(you)</span>
                  )}
                </div>
                <div className='truncate text-xs text-muted-foreground'>
                  {m.email}
                </div>
              </div>
            </div>

            <div className='flex shrink-0 items-center gap-2'>
              <Badge variant={roleBadgeVariant[m.role]}>
                {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
              </Badge>

              {canActOnMember && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' size='icon' className='h-8 w-8'>
                      <MoreHorizontal className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    {currentUserRole === 'owner' && (
                      <>
                        {m.role !== 'admin' && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleRoleChange(m.id, 'admin', m.name)
                            }>
                            <ShieldCheck className='mr-2 h-4 w-4' />
                            Make admin
                          </DropdownMenuItem>
                        )}
                        {m.role !== 'member' && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleRoleChange(m.id, 'member', m.name)
                            }>
                            <User className='mr-2 h-4 w-4' />
                            Make member
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      className='text-destructive focus:text-destructive'
                      onClick={() => handleRemove(m.id, m.name)}>
                      <UserMinus className='mr-2 h-4 w-4' />
                      Remove member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
