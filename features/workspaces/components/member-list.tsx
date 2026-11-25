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
import { Crown, FolderKanban, MoreHorizontal, ShieldCheck, User, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { changeMemberRole, removeMember } from '../actions';
import { GuestProjectsDialog } from './guest-projects-dialog';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';

type Role = 'owner' | 'admin' | 'member' | 'guest';

interface WorkspaceMember {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: Date;
  /** Guests: the projects shared with them. */
  projects?: { id: string; name: string }[];
}

interface MemberListProps {
  members: WorkspaceMember[];
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  currentUserId: string;
  currentUserRole: Role;
  /** Active projects, offered when changing a guest's projects. */
  projects?: { id: string; name: string }[];
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
  guest: 'outline',
};

export function MemberList({
  members,
  workspaceId,
  workspaceName,
  workspaceSlug,
  currentUserId,
  currentUserRole,
  projects = [],
}: MemberListProps) {
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  const [transferTarget, setTransferTarget] = useState<{ id: string; name: string } | null>(null);
  const [guestTarget, setGuestTarget] = useState<WorkspaceMember | null>(null);

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
    <>
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
                {m.role === 'guest' && (
                  <div className='truncate text-xs text-muted-foreground'>
                    Sees: {m.projects?.length ? m.projects.map((p) => p.name).join(', ') : 'no projects'}
                  </div>
                )}
              </div>
            </div>

            <div className='flex shrink-0 items-center gap-2'>
              <Badge variant={roleBadgeVariant[m.role]} className={m.role === 'guest' ? 'border-dashed' : undefined}>
                {m.role === 'guest' ? 'Guest' : m.role.charAt(0).toUpperCase() + m.role.slice(1)}
              </Badge>

              {canActOnMember && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      aria-label={`${m.name ?? m.email} options`}>
                      <MoreHorizontal className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    {m.role === 'guest' && (
                      <>
                        <DropdownMenuItem onClick={() => setGuestTarget(m)}>
                          <FolderKanban className='mr-2 h-4 w-4' />
                          Change projects
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {currentUserRole === 'owner' && m.role !== 'guest' && (
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
                        <DropdownMenuItem
                          onClick={() => setTransferTarget({ id: m.id, name: m.name ?? m.email })}>
                          <Crown className='mr-2 h-4 w-4' />
                          Transfer ownership
                        </DropdownMenuItem>
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
    <TransferOwnershipDialog
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      target={transferTarget}
      open={transferTarget !== null}
      onOpenChange={(open) => !open && setTransferTarget(null)}
    />
    <GuestProjectsDialog
      workspaceId={workspaceId}
      guest={guestTarget}
      projects={projects}
      open={guestTarget !== null}
      onOpenChange={(open) => !open && setGuestTarget(null)}
    />
    </>
  );
}
