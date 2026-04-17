'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CreateWorkspaceForm } from '@/features/workspaces/components/create-workspace-form';
import { Lock, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface CreateWorkspaceDialogProps {
  onSuccess?: () => void;
  disabled?: boolean;
}

export function CreateWorkspaceDialog({
  onSuccess,
  disabled,
}: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.();
  };

  if (disabled) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className='gap-2'>
            <div className='flex size-6 items-center justify-center rounded-md border bg-transparent text-muted-foreground'>
              <Lock className='size-3.5' />
            </div>
            <div className='flex flex-1 items-center justify-between'>
              <span className='text-muted-foreground font-medium'>Add workspace</span>
              <span className='text-xs bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded'>
                Upgrade
              </span>
            </div>
          </DropdownMenuItem>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Sparkles className='size-5 text-primary' />
              Workspace limit reached
            </DialogTitle>
            <DialogDescription>
              You&apos;ve used all your available workspaces on the free plan.
              Upgrade to create more.
            </DialogDescription>
          </DialogHeader>
          <div className='mt-2 space-y-4'>
            <div className='rounded-lg border bg-muted/40 p-4 space-y-2 text-sm'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Free plan</span>
                <span className='font-medium'>1 workspace</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Pro — $9/mo</span>
                <span className='font-medium'>Up to 5 workspaces</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Business — $29/mo</span>
                <span className='font-medium'>Unlimited workspaces</span>
              </div>
            </div>
            <Button asChild className='w-full' onClick={() => setOpen(false)}>
              <Link href='/settings/billing'>
                <Sparkles className='size-4' />
                View upgrade options
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <div className='flex size-6 items-center justify-center rounded-md border bg-transparent'>
            <Plus className='size-4' />
          </div>
          <div className='text-muted-foreground font-medium'>Add workspace</div>
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to organize your projects and collaborate
            with your team.
          </DialogDescription>
        </DialogHeader>
        <div className='mt-4'>
          <CreateWorkspaceForm onSuccess={handleSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
