'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MIN_LENGTH = 8;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: apiError } = await authClient.resetPassword({ newPassword: password, token });
      if (apiError) {
        if (apiError.code === 'INVALID_TOKEN') setExpired(true);
        setError(apiError.message || 'Something went wrong. Please try again.');
        return;
      }
      router.replace('/login?reset=1');
    } catch {
      setError('Could not reach Tide. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  if (expired) {
    return (
      <div role='alert' className='space-y-3 rounded-lg border p-4 text-sm'>
        <p className='font-medium'>This reset link is invalid or has expired.</p>
        <Button asChild variant='outline' size='sm'>
          <Link href='/forgot-password'>Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className='space-y-4' noValidate>
      <div className='space-y-2'>
        <Label htmlFor='new-password'>New password</Label>
        <Input
          id='new-password'
          type='password'
          autoComplete='new-password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='confirm-password'>Confirm new password</Label>
        <Input
          id='confirm-password'
          type='password'
          autoComplete='new-password'
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <p className='text-xs text-muted-foreground'>
        At least {MIN_LENGTH} characters. Changing your password signs you out on every device.
      </p>
      <Button type='submit' size='lg' className='w-full' disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}
