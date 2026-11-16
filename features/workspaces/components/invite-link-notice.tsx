'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export interface SentInvite {
  email: string;
  inviteUrl: string;
  emailSent: boolean;
}

/**
 * Shown right after an invite is created or resent. Only the token's hash is
 * stored, so this is the only time the link can be shown. It lets an admin
 * share it directly, which also covers the case where the email failed.
 */
export function InviteLinkNotice({ invite }: { invite: SentInvite }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the field is selectable.
    }
  };

  return (
    <div className='rounded-md border bg-muted/40 p-3 space-y-2' role='status'>
      <p className='text-sm'>
        {invite.emailSent ? (
          <>
            Invite emailed to <span className='font-medium'>{invite.email}</span>. You can also
            share this link with them:
          </>
        ) : (
          <>
            We couldn&apos;t email <span className='font-medium'>{invite.email}</span>. Share this
            link with them instead:
          </>
        )}
      </p>
      <div className='flex gap-2'>
        <Input
          readOnly
          value={invite.inviteUrl}
          aria-label='Invite link'
          onFocus={(e) => e.currentTarget.select()}
          className='font-mono text-xs'
        />
        <Button type='button' variant='outline' size='icon' onClick={copy} aria-label='Copy invite link'>
          {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
        </Button>
      </div>
      <p className='text-xs text-muted-foreground'>
        Works only for {invite.email} and expires in 7 days.
      </p>
    </div>
  );
}
