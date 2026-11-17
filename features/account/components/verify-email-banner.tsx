'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { MailWarning } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function ResendVerificationButton({ email, size = 'default' }: { email: string; size?: 'default' | 'sm' }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const resend = async () => {
    setState('sending');
    let error: { message?: string } | null = null;
    try {
      ({ error } = await authClient.sendVerificationEmail({ email, callbackURL: '/email-verified' }));
    } catch {
      error = { message: 'Could not reach Tide. Check your connection and try again.' };
    }
    if (error) {
      setState('idle');
      toast.error(error.message || 'Could not send the email. Please try again.', { position: 'top-center' });
      return;
    }
    setState('sent');
    toast.success(`Verification email sent to ${email}`, { position: 'top-center' });
  };

  return (
    <Button size={size} variant='outline' onClick={resend} disabled={state !== 'idle'}>
      {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Email sent' : 'Resend email'}
    </Button>
  );
}

/**
 * Soft gate for unverified email/password accounts: the app works, but
 * invites can only be accepted from the emailed link and no notification
 * emails are sent until the address is confirmed.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div
      role='region'
      aria-label='Email verification'
      className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100'>
      <MailWarning className='size-4 shrink-0' />
      <p className='min-w-0 flex-1'>
        <span className='sm:hidden'>Verify your email to get invites and notifications.</span>
        <span className='hidden sm:inline'>
          Verify your email (<span className='font-medium'>{email}</span>) to receive invites and
          notifications. Use “Resend email” to get a verification link.
        </span>
      </p>
      <ResendVerificationButton email={email} size='sm' />
    </div>
  );
}
