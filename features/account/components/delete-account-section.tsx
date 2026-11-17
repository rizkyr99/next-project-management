'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OwnedWorkspace } from '@/lib/account';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteAccount } from '../actions';

function WorkspaceLinks({ workspaces }: { workspaces: OwnedWorkspace[] }) {
  return (
    <ul className='list-disc pl-5 space-y-1'>
      {workspaces.map((w) => (
        <li key={w.id}>
          <Link className='underline underline-offset-2' href={`/workspaces/${w.slug}/settings`}>
            {w.name}
          </Link>{' '}
          <span className='text-muted-foreground'>
            ({w.otherMembers} other member{w.otherMembers === 1 ? '' : 's'})
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Danger-zone card for deleting the account. Blocked up front while the
 * user owns workspaces other people use; the server enforces all of it.
 */
export function DeleteAccountSection({
  email,
  hasPassword,
  ownedWorkspaces,
}: {
  email: string;
  hasPassword: boolean;
  ownedWorkspaces: OwnedWorkspace[];
}) {
  const [open, setOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(ownedWorkspaces.filter((w) => w.otherMembers > 0));
  const [isPending, startTransition] = useTransition();
  const soloWorkspaces = ownedWorkspaces.filter((w) => w.otherMembers === 0);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTypedEmail('');
      setPassword('');
      setError(null);
    }
    setOpen(next);
  };

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      try {
        // Redirects to /login on success.
        const result = await deleteAccount({ email: typedEmail, password: hasPassword ? password : undefined });
        if (result?.error) {
          setError(result.error);
          if (result.blockingWorkspaces) {
            setBlocking(result.blockingWorkspaces);
            setOpen(false);
          }
        }
      } catch (err) {
        unstable_rethrow(err);
        setError('Failed to delete your account.');
      }
    });

  if (blocking.length > 0) {
    return (
      <div className='space-y-3 text-sm'>
        <p>
          You own workspaces that other people use. Transfer ownership (Settings → Members) or delete
          them before deleting your account:
        </p>
        <WorkspaceLinks workspaces={blocking} />
      </div>
    );
  }

  const canSubmit =
    typedEmail.trim().toLowerCase() === email.toLowerCase() && (!hasPassword || password.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='destructive'>Delete account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This permanently deletes your account, your comments and assignments, and cancels any paid
            subscription. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {soloWorkspaces.length > 0 && (
          <div className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1'>
            <p className='font-medium'>These workspaces only have you, and will be deleted too:</p>
            <ul className='list-disc pl-5'>
              {soloWorkspaces.map((w) => (
                <li key={w.id}>{w.name}</li>
              ))}
            </ul>
          </div>
        )}
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) confirm();
          }}>
          <div className='space-y-2'>
            <Label htmlFor='delete-account-email'>
              Type <span className='font-semibold'>{email}</span> to confirm
            </Label>
            <Input
              id='delete-account-email'
              autoComplete='off'
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
            />
          </div>
          {hasPassword && (
            <div className='space-y-2'>
              <Label htmlFor='delete-account-password'>Password</Label>
              <Input
                id='delete-account-password'
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type='submit' variant='destructive' disabled={!canSubmit || isPending}>
              {isPending ? 'Deleting…' : 'Delete my account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
