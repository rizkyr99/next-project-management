'use client';

import { Button } from '@/components/ui/button';
import { RotateCw, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { resendInvite, revokeInvite } from '../invite-actions';
import { InviteLinkNotice, type SentInvite } from './invite-link-notice';

interface PendingInvite {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  expiresAt: Date;
  /** Computed server-side so rendering stays pure. */
  expired: boolean;
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
  const [isPending, startTransition] = useTransition();
  const [resent, setResent] = useState<SentInvite | null>(null);

  const handleRevoke = (inviteId: string, email: string) =>
    startTransition(async () => {
      const result = await revokeInvite(workspaceSlug, inviteId);
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
      } else {
        toast.success(`Invite to ${email} revoked`, { position: 'top-center' });
        if (resent?.email === email) setResent(null);
      }
    });

  const handleResend = (inviteId: string) =>
    startTransition(async () => {
      const result = await resendInvite(workspaceSlug, inviteId);
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      setResent({ email: result.email, inviteUrl: result.inviteUrl, emailSent: result.emailSent });
      if (result.emailSent) {
        toast.success(`Invite resent to ${result.email}`, { position: 'top-center' });
      } else {
        toast.warning("New link created, but the email couldn't be sent.", { position: 'top-center' });
      }
    });

  if (!invites.length) {
    return (
      <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
        No pending invites.
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='divide-y rounded-md border'>
        {invites.map((invite) => {
          const { expired } = invite;
          return (
            <div
              key={invite.id}
              className='flex items-center justify-between gap-4 px-4 py-3'>
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium'>{invite.email}</div>
                <div className='text-xs text-muted-foreground'>
                  {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} ·{' '}
                  {expired ? 'Expired ' : 'Expires '}
                  {invite.expiresAt.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
              {canRevoke && (
                <div className='flex shrink-0 items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-8 text-muted-foreground'
                    disabled={isPending}
                    onClick={() => handleResend(invite.id)}
                    aria-label={`Resend invite to ${invite.email}`}>
                    <RotateCw className='h-4 w-4' />
                    <span className='hidden sm:inline'>Resend</span>
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8 text-muted-foreground hover:text-destructive'
                    disabled={isPending}
                    onClick={() => handleRevoke(invite.id, invite.email)}
                    aria-label={`Revoke invite to ${invite.email}`}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {resent && <InviteLinkNotice invite={resent} />}
    </div>
  );
}
