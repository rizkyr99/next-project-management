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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { SidebarMenuAction } from '@/components/ui/sidebar';
import { unstable_rethrow } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { deleteProject, updateProject } from '../actions';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
}

/**
 * The "⋯" menu for a project, used in the project header and on sidebar
 * rows. The trigger is rendered here (not passed in as an element from a
 * Server Component) so server HTML and client hydration always agree.
 * Delete only appears for owners and admins; the server enforces this too.
 */
export function ProjectActionsMenu({
  project,
  canDelete,
  variant,
}: {
  project: ProjectSummary;
  canDelete: boolean;
  variant: 'header' | 'sidebar';
}) {
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const align = variant === 'sidebar' ? 'start' : 'end';
  const trigger: ReactNode =
    variant === 'sidebar' ? (
      <SidebarMenuAction showOnHover aria-label={`${project.name} options`}>
        <MoreHorizontal />
      </SidebarMenuAction>
    ) : (
      <Button variant='ghost' size='icon' aria-label='Project options'>
        <MoreHorizontal />
      </Button>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} className='w-44'>
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil />
            Edit details
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive' onSelect={() => setDialog('delete')}>
                <Trash2 />
                Delete project
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProjectDialog
        project={project}
        open={dialog === 'edit'}
        onOpenChange={(open) => setDialog(open ? 'edit' : null)}
      />
      {canDelete && (
        <DeleteProjectDialog
          project={project}
          open={dialog === 'delete'}
          onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        />
      )}
    </>
  );
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [isPending, startTransition] = useTransition();

  // Start from the current values every time the dialog opens.
  useResetOnOpen(open, () => {
    setName(project.name);
    setDescription(project.description ?? '');
  });

  const save = () =>
    startTransition(async () => {
      const result = await updateProject({ projectId: project.id, name, description });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success('Project updated', { position: 'top-center' });
      onOpenChange(false);
    });

  const trimmed = name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Any workspace member can rename a project.</DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) save();
          }}>
          <div className='space-y-2'>
            <Label htmlFor={`project-name-${project.id}`}>Name</Label>
            <Input
              id={`project-name-${project.id}`}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor={`project-description-${project.id}`}>Description</Label>
            <Textarea
              id={`project-description-${project.id}`}
              value={description}
              maxLength={500}
              rows={3}
              placeholder='What is this project about?'
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={!trimmed || isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [isPending, startTransition] = useTransition();

  useResetOnOpen(open, () => setConfirmation(''));

  const remove = () =>
    startTransition(async () => {
      try {
        // Redirects to the workspace home on success.
        const result = await deleteProject({ projectId: project.id });
        if (result?.error !== undefined) toast.error(result.error, { position: 'top-center' });
      } catch (error) {
        unstable_rethrow(error);
        toast.error('Failed to delete project.', { position: 'top-center' });
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This permanently deletes <span className='font-medium text-foreground'>{project.name}</span>{' '}
            with all of its columns, tasks and comments. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor={`confirm-project-${project.id}`}>
            Type <span className='font-semibold'>{project.name}</span> to confirm
          </Label>
          <Input
            id={`confirm-project-${project.id}`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={project.name}
            autoComplete='off'
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={confirmation !== project.name || isPending}
            onClick={remove}>
            {isPending ? 'Deleting…' : 'Delete project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
