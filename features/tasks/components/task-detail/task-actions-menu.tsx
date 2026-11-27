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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, FolderInput, Lock, MoreHorizontal } from 'lucide-react';
import { useClientAudience } from '@/features/projects/read-only';
import { useParams, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { closeTask, switchTask, taskHref } from '../../task-link';
import { duplicateTask, listMoveTargets, moveTask, setTaskInternal } from '../../transfer-actions';

/** The task sheet's "⋯" menu: duplicate, move to another project (I2), hide from the client (C2). */
export function TaskActionsMenu({
  taskId,
  title,
  internal = false,
}: Readonly<{ taskId: string; title: string; internal?: boolean }>) {
  const [moving, setMoving] = useState(false);
  const [isDuplicating, startDuplicate] = useTransition();
  const [isChangingVisibility, startVisibility] = useTransition();
  const clientAudience = useClientAudience();

  const toggleInternal = () =>
    startVisibility(async () => {
      const result = await setTaskInternal({ taskId, internal: !internal });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(internal ? 'The client can see this task now' : 'Only your team can see this task now', {
        position: 'top-center',
      });
    });

  const duplicate = () =>
    startDuplicate(async () => {
      const result = await duplicateTask({ taskId });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(`Duplicated “${title}”`, { position: 'top-center' });
      switchTask(result.taskId);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8 shrink-0 text-muted-foreground'
            aria-label='Task actions'
            title='Task actions'>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-52'>
          <DropdownMenuItem disabled={isDuplicating} onSelect={duplicate}>
            <Copy />
            Duplicate task
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoving(true)}>
            <FolderInput />
            Move to project…
          </DropdownMenuItem>
          {/* An internal task in a project the client no longer sees can still be shown again. */}
          {(clientAudience || internal) && (
            <DropdownMenuItem disabled={isChangingVisibility} onSelect={toggleInternal}>
              {internal ? <Eye /> : <Lock />}
              {internal ? 'Show to client' : 'Hide from client'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveTaskDialog taskId={taskId} title={title} open={moving} onOpenChange={setMoving} />
    </>
  );
}

function MoveTaskDialog({
  taskId,
  title,
  open,
  onOpenChange,
}: {
  taskId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [isPending, startTransition] = useTransition();
  useResetOnOpen(open, () => setTarget(''));

  const targets = useQuery({
    queryKey: ['move-targets', taskId],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await listMoveTargets({ taskId });
      if (res.error !== undefined) throw new Error(res.error);
      return res.projects;
    },
  });

  const move = () =>
    startTransition(async () => {
      const result = await moveTask({ taskId, projectId: target });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      onOpenChange(false);
      closeTask();
      toast.success(`Moved “${title}” to ${result.projectName}`, {
        position: 'top-center',
        description: `It’s in ${result.column}.`,
        // Long enough to reach "Open" (the default 4 s is short for an action).
        duration: 10_000,
        action: {
          label: 'Open',
          onClick: () => router.push(taskHref(workspaceSlug, result.projectId, taskId)),
        },
      });
    });

  const none = targets.data?.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move task</DialogTitle>
          <DialogDescription>
            Comments, checklist, files and history go with it. It lands in the column with the same name, or the
            project’s first column.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='move-task-project'>Project</Label>
          <Select value={target} onValueChange={setTarget} disabled={!targets.data || none}>
            <SelectTrigger id='move-task-project' className='w-full'>
              <SelectValue placeholder={targets.isPending ? 'Loading projects…' : 'Choose a project'} />
            </SelectTrigger>
            <SelectContent>
              {targets.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {none && <p className='text-xs text-muted-foreground'>There are no other active projects to move it to.</p>}
          {targets.isError && (
            <p role='alert' className='text-xs text-destructive'>
              The projects couldn’t be loaded. Close this and try again.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type='button' disabled={!target || isPending} onClick={move}>
            {isPending ? 'Moving…' : 'Move task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
