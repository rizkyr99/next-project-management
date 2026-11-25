'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setProjectShareLink } from '../actions';
import { sharePath } from '../share-link';

/**
 * C4: a project's read-only share link. Anyone with the link sees the board
 * (columns, task titles, priority, due dates, checklist progress and approval
 * state), never comments, descriptions or people. Replace makes the old link
 * stop working; Turn off removes it.
 */
export function ShareLinkDialog({
  projectId,
  projectName,
  token: initialToken,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [pending, start] = useTransition();
  const url = token ? `${typeof window === 'undefined' ? '' : window.location.origin}${sharePath(token)}` : '';

  const change = (action: 'enable' | 'replace' | 'disable') =>
    start(async () => {
      const result = await setProjectShareLink({ projectId, action });
      if ('error' in result && result.error) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      if ('token' in result) setToken(result.token ?? null);
      if (action === 'replace') toast.success('New link created. The old one no longer works.', { position: 'top-center' });
      if (action === 'disable') toast.success('Share link turned off', { position: 'top-center' });
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { position: 'top-center' });
    } catch {
      toast.error('Couldn’t copy. Select the link and copy it instead.', { position: 'top-center' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {projectName}</DialogTitle>
          <DialogDescription>
            Anyone with the link can see this board without signing in: columns, task titles, priority, due dates,
            checklist progress and approvals. Comments, descriptions and people are never shown.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className='flex gap-2'>
            <Input aria-label='Share link' readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button type='button' variant='outline' className='gap-1.5' onClick={copy}>
              <Copy className='size-3.5' aria-hidden />
              Copy
            </Button>
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>Sharing is off. Nobody can open this board without an account.</p>
        )}

        <DialogFooter className='gap-2 sm:justify-between'>
          {token ? (
            <>
              <Button type='button' variant='ghost' disabled={pending} onClick={() => change('disable')}>
                Turn off link
              </Button>
              <Button type='button' variant='outline' disabled={pending} onClick={() => change('replace')}>
                Replace link
              </Button>
            </>
          ) : (
            <Button type='button' disabled={pending} onClick={() => change('enable')} className='sm:ml-auto'>
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
