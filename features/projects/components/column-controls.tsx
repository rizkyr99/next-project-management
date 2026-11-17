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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Check, GripVertical, MoreHorizontal, Palette, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useRef, useState, useTransition, type HTMLAttributes } from 'react';
import { toast } from 'sonner';
import { MAX_STATUSES_PER_PROJECT } from '../schema';
import { createStatus, deleteStatus, setDefaultStatus, updateStatus } from '../status-actions';
import { STATUS_COLORS, STATUS_COLOR_KEYS, statusDotClass, type StatusColor } from '../status-colors';

export interface ColumnInfo {
  id: string;
  name: string;
  color: string | null;
  isDefault: boolean;
  taskCount: number;
}

function toastResult(result: { error?: string }, success?: string) {
  if (result.error !== undefined) {
    toast.error(result.error, { position: 'top-center' });
    return false;
  }
  if (success) toast.success(success, { position: 'top-center' });
  return true;
}

/**
 * Column title row: drag handle, color dot, inline-renamable name, task
 * count and the column menu. `dragHandleProps` come from the column's
 * useSortable, so only the grip starts a column drag (task drags are
 * unaffected).
 */
export function ColumnHeader({
  column,
  columns,
  dragHandleProps,
}: {
  column: ColumnInfo;
  columns: ColumnInfo[];
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cancelled = useRef(false);

  const startRename = () => {
    setDraft(column.name);
    cancelled.current = false;
    setEditing(true);
  };

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (cancelled.current || !name || name === column.name) return;
    startTransition(async () => {
      toastResult(await updateStatus({ statusId: column.id, name }));
    });
  };

  const setColor = (color: StatusColor | null) =>
    startTransition(async () => {
      toastResult(await updateStatus({ statusId: column.id, color }));
    });

  const makeDefault = () =>
    startTransition(async () => {
      toastResult(await setDefaultStatus({ statusId: column.id }), `"${column.name}" is now the default column`);
    });

  return (
    <div className='group/column-header flex items-center gap-1.5 min-h-8'>
      <button
        type='button'
        className='-ml-1 rounded p-0.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing focus-visible:outline-2 touch-none'
        aria-label={`Reorder column ${column.name}`}
        {...dragHandleProps}>
        <GripVertical className='size-3.5' />
      </button>
      <span className={cn('size-2 rounded-full shrink-0', statusDotClass(column.color))} aria-hidden />
      {editing ? (
        <Input
          value={draft}
          autoFocus
          maxLength={64}
          aria-label='Column name'
          className='h-7 px-1.5 text-sm font-medium'
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button
          type='button'
          onDoubleClick={startRename}
          className='min-w-0 truncate text-left text-sm font-medium uppercase text-muted-foreground'
          title='Double-click to rename'>
          {column.name}
        </button>
      )}
      {!editing && (
        <span className='text-xs text-muted-foreground/70 tabular-nums'>{column.taskCount}</span>
      )}
      {column.isDefault && !editing && (
        <Star className='size-3 text-muted-foreground/70 fill-current' aria-label='Default column' />
      )}
      <div className='ml-auto'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='size-7 text-muted-foreground'
              disabled={isPending}
              aria-label={`Column ${column.name} options`}>
              <MoreHorizontal className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48'>
            <DropdownMenuItem onSelect={startRename}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => setColor(null)}>
                  <span className='size-2.5 rounded-full bg-muted-foreground/40' />
                  None
                  {!column.color && <Check className='ml-auto' />}
                </DropdownMenuItem>
                {STATUS_COLOR_KEYS.map((key) => (
                  <DropdownMenuItem key={key} onSelect={() => setColor(key)}>
                    <span className={cn('size-2.5 rounded-full', STATUS_COLORS[key])} />
                    <span className='capitalize'>{key}</span>
                    {column.color === key && <Check className='ml-auto' />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={makeDefault} disabled={column.isDefault}>
              <Star />
              {column.isDefault ? 'Default column' : 'Set as default'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant='destructive'
              disabled={columns.length <= 1}
              onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DeleteColumnDialog
        column={column}
        columns={columns}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </div>
  );
}

function DeleteColumnDialog({
  column,
  columns,
  open,
  onOpenChange,
}: {
  column: ColumnInfo;
  columns: ColumnInfo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const others = columns.filter((c) => c.id !== column.id);
  const needsTarget = column.taskCount > 0 || column.isDefault;
  const [target, setTarget] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    if (next) setTarget(others[0]?.id ?? '');
    onOpenChange(next);
  };

  const remove = () =>
    startTransition(async () => {
      const result = await deleteStatus({
        statusId: column.id,
        ...(needsTarget && target ? { moveTasksTo: target } : {}),
      });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      const targetName = others.find((c) => c.id === target)?.name;
      toast.success(
        result.movedTasks > 0
          ? `Deleted "${column.name}" and moved ${result.movedTasks} task${result.movedTasks === 1 ? '' : 's'} to "${targetName}"`
          : `Deleted "${column.name}"`,
        { position: 'top-center' },
      );
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete column</DialogTitle>
          <DialogDescription>
            {column.taskCount > 0 ? (
              <>
                <span className='font-medium text-foreground'>{column.name}</span> has{' '}
                {column.taskCount} task{column.taskCount === 1 ? '' : 's'}. They&apos;ll be moved, not deleted.
              </>
            ) : (
              <>
                Delete the empty column <span className='font-medium text-foreground'>{column.name}</span>?
              </>
            )}
            {column.isDefault && ' This is the default column, so the column you pick becomes the new default.'}
          </DialogDescription>
        </DialogHeader>
        {needsTarget && (
          <div className='space-y-2'>
            <Label htmlFor={`move-to-${column.id}`}>
              {column.taskCount > 0 ? 'Move tasks to' : 'New default column'}
            </Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id={`move-to-${column.id}`} className='w-full'>
                <SelectValue placeholder='Choose a column' />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant='destructive' disabled={isPending || (needsTarget && !target)} onClick={remove}>
            {isPending ? 'Deleting…' : 'Delete column'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "+ Add column" at the end of the board; turns into an input in place. */
export function AddColumn({ projectId, columnCount }: { projectId: string; columnCount: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isPending, startTransition] = useTransition();

  if (columnCount >= MAX_STATUSES_PER_PROJECT) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      if (toastResult(await createStatus({ projectId, name: trimmed }))) {
        setName('');
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <Button
        variant='ghost'
        className='w-64 shrink-0 justify-start text-muted-foreground border border-dashed'
        onClick={() => setOpen(true)}>
        <Plus />
        Add column
      </Button>
    );
  }

  return (
    <form
      className='w-64 shrink-0 rounded-lg bg-muted p-2 space-y-2'
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}>
      <Input
        autoFocus
        value={name}
        maxLength={64}
        placeholder='Column name'
        aria-label='New column name'
        disabled={isPending}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setName('');
            setOpen(false);
          }
        }}
      />
      <div className='flex gap-2'>
        <Button type='submit' size='sm' disabled={isPending || !name.trim()}>
          {isPending ? 'Adding…' : 'Add column'}
        </Button>
        <Button type='button' size='sm' variant='ghost' onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
