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
import { unstable_rethrow } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { leaveWorkspace } from '../membership-actions';

export function LeaveWorkspaceButton({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const leave = () =>
    startTransition(async () => {
      try {
        // Redirects away on success.
        const result = await leaveWorkspace({ workspaceId });
        if (result?.error !== undefined) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error('Failed to leave the workspace.', { position: 'top-center' });
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='destructive'>Leave workspace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave workspace</DialogTitle>
          <DialogDescription>
            You&apos;ll lose access to <span className='font-medium text-foreground'>{workspaceName}</span>{' '}
            and be unassigned from its tasks. An admin can invite you back later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant='destructive' disabled={isPending} onClick={leave}>
            {isPending ? 'Leaving…' : 'Leave workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
