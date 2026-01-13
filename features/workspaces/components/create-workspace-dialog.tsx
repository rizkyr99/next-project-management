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
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface CreateWorkspaceDialogProps {
  onSuccess?: () => void;
}

export function CreateWorkspaceDialog({
  onSuccess: onSuccess,
}: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.();
  };

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
