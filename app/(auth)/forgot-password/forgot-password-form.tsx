'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

const emailSchema = z.email('Enter a valid email address');

/**
 * Asks for a reset link. The confirmation is the same whether or not the
 * address has an account, so this form can't be used to find out who's
 * registered. Only real failures (e.g. rate limiting) show an error.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email: parsed.data,
        redirectTo: '/reset-password',
      });
      if (apiError) {
        setError(apiError.message || 'Something went wrong. Please try again.');
        return;
      }
      setSentTo(parsed.data);
    } catch {
      setError('Could not reach Tide. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <div role='status' className='space-y-3 rounded-lg border p-4 text-sm'>
        <div className='flex items-center gap-2 font-medium'>
          <MailCheck className='size-4' />
          Check your email
        </div>
        <p className='text-muted-foreground'>
          If an account exists for <span className='font-medium text-foreground'>{sentTo}</span>, we&apos;ve
          sent a link to reset its password. The link expires in 1 hour.
        </p>
        <Button variant='outline' size='sm' onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className='space-y-4' noValidate>
      <div className='space-y-2'>
        <Label htmlFor='forgot-email'>Email</Label>
        <Input
          id='forgot-email'
          type='email'
          autoComplete='email'
          placeholder='Enter your email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </div>
      <Button type='submit' size='lg' className='w-full' disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
