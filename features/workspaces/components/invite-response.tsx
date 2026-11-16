'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { acceptInvite, declineInvite, type InviteRef } from '../invite-actions';

/** Accept / Decline buttons. Accepting redirects into the workspace server-side. */
export function InviteResponse({
  inviteRef,
  workspaceName,
  onDeclined,
}: {
  inviteRef: InviteRef;
  workspaceName: string;
  onDeclined?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [declined, setDeclined] = useState(false);

  const accept = () =>
    startTransition(async () => {
      // On success the action redirects, so a result only comes back on failure.
      const result = await acceptInvite(inviteRef);
      if (result?.error !== undefined) toast.error(result.error, { position: 'top-center' });
    });

  const decline = () =>
    startTransition(async () => {
      const result = await declineInvite(inviteRef);
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(`Declined the invite to ${workspaceName}`, { position: 'top-center' });
      setDeclined(true);
      if (onDeclined) onDeclined();
      else router.refresh();
    });

  if (declined) {
    return <p className='text-sm text-muted-foreground'>Invite declined.</p>;
  }

  return (
    <div className='flex gap-2'>
      <Button onClick={accept} disabled={isPending}>
        {isPending ? 'Joining…' : 'Accept invite'}
      </Button>
      <Button variant='outline' onClick={decline} disabled={isPending}>
        Decline
      </Button>
    </div>
  );
}

/** Signs out, then sends the user to log in with the right account and come back. */
export function SwitchAccountButton({ callbackURL }: { callbackURL: string }) {
  const [isPending, startTransition] = useTransition();
  const switchAccount = () =>
    startTransition(async () => {
      await authClient.signOut();
      // A full navigation, so no stale session state survives.
      window.location.href = `/login?callbackURL=${encodeURIComponent(callbackURL)}`;
    });

  return (
    <Button variant='outline' onClick={switchAccount} disabled={isPending}>
      {isPending ? 'Signing out…' : 'Switch account'}
    </Button>
  );
}
