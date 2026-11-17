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
import { Label } from '@/components/ui/label';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { transferOwnership } from '../membership-actions';

/** Confirms handing the workspace to another member (type their name). */
export function TransferOwnershipDialog({
  workspaceId,
  workspaceName,
  target,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  workspaceName: string;
  target: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    if (next) setConfirmation('');
    onOpenChange(next);
  };

  const transfer = () =>
    startTransition(async () => {
      if (!target) return;
      const result = await transferOwnership({ workspaceId, toMemberId: target.id });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(`${target.name} now owns ${workspaceName}`, { position: 'top-center' });
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            <span className='font-medium text-foreground'>{target?.name}</span> will become the owner of{' '}
            <span className='font-medium text-foreground'>{workspaceName}</span>, and the workspace will
            count toward their plan. You&apos;ll stay on as an admin. Only the new owner can undo this.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='confirm-transfer'>
            Type <span className='font-semibold'>{target?.name}</span> to confirm
          </Label>
          <Input
            id='confirm-transfer'
            value={confirmation}
            autoComplete='off'
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={target?.name}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={!target || confirmation.trim() !== target.name || isPending}
            onClick={transfer}>
            {isPending ? 'Transferring…' : 'Transfer ownership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
