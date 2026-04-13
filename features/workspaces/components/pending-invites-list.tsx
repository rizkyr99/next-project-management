'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { revokeInvite } from '../actions';

interface PendingInvite {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  expiresAt: Date;
}

interface PendingInvitesListProps {
  invites: PendingInvite[];
  workspaceSlug: string;
  canRevoke: boolean;
}

export function PendingInvitesList({
  invites,
  workspaceSlug,
  canRevoke,
}: PendingInvitesListProps) {
  const handleRevoke = async (inviteId: string, email: string) => {
    const result = await revokeInvite(workspaceSlug, inviteId);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    } else {
      toast.success(`Invite to ${email} revoked`, { position: 'top-center' });
    }
  };

  if (!invites.length) {
    return (
      <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
        No pending invites.
      </div>
    );
  }

  return (
    <div className='divide-y rounded-md border'>
      {invites.map((invite) => (
        <div
          key={invite.id}
          className='flex items-center justify-between gap-4 px-4 py-3'>
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>{invite.email}</div>
            <div className='text-xs text-muted-foreground'>
              {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} ·
              Expires{' '}
              {invite.expiresAt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
          {canRevoke && (
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive'
              onClick={() => handleRevoke(invite.id, invite.email)}>
              <X className='h-4 w-4' />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
