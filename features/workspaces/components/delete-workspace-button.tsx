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
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteWorkspace } from '../actions';

interface DeleteWorkspaceButtonProps {
  workspaceSlug: string;
  workspaceName: string;
}

export function DeleteWorkspaceButton({
  workspaceSlug,
  workspaceName,
}: DeleteWorkspaceButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWorkspace(workspaceSlug);
    } catch {
      toast.error('Failed to delete workspace', { position: 'top-center' });
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='destructive'>Delete workspace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workspace</DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone. All projects, tasks,
            and members will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='confirm-name'>
            Type <span className='font-semibold'>{workspaceName}</span> to
            confirm
          </Label>
          <Input
            id='confirm-name'
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={workspaceName}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={confirmation !== workspaceName || isDeleting}
            onClick={handleDelete}>
            {isDeleting ? 'Deleting…' : 'Delete workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
