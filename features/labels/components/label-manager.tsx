'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_COLOR_KEYS, statusDotClass } from '@/features/projects/status-colors';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteLabel, updateLabel } from '../actions';
import type { LabelInfo } from '../schema';

type ManagedLabel = LabelInfo & { taskCount: number };

const NONE = 'none';

/** Rename and recolour the workspace's labels; owners and admins can delete them. */
export function LabelManager({ labels, canDelete }: Readonly<{ labels: ManagedLabel[]; canDelete: boolean }>) {
  if (labels.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        No labels yet. Add one from any task&apos;s Labels field; it&apos;s then available in every project here.
      </p>
    );
  }
  return (
    <ul className='divide-y' aria-label='Labels'>
      {labels.map((l) => (
        <LabelRow key={l.id} label={l} canDelete={canDelete} />
      ))}
    </ul>
  );
}

function LabelRow({ label, canDelete }: Readonly<{ label: ManagedLabel; canDelete: boolean }>) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const save = (change: { name?: string; color?: string | null }, undo: () => void) =>
    start(async () => {
      const result = await updateLabel({ labelId: label.id, ...change });
      if (result.error !== undefined) {
        undo();
        toast.error(result.error, { position: 'top-center' });
      }
    });

  const commitName = () => {
    const next = name.trim();
    if (!next) return setName(label.name);
    if (next !== label.name) save({ name: next }, () => setName(label.name));
  };

  return (
    <li className='flex items-center gap-2 py-2'>
      <Select
        value={color ?? NONE}
        onValueChange={(v) => {
          const next = v === NONE ? null : v;
          setColor(next);
          save({ color: next }, () => setColor(label.color));
        }}>
        <SelectTrigger aria-label={`Colour of ${label.name}`} className='h-8 w-14 px-2'>
          <span className={cn('size-3 rounded-full', statusDotClass(color))} aria-hidden />
          <SelectValue className='sr-only' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span className='flex items-center gap-2'>
              <span className='size-2.5 rounded-full bg-muted-foreground/40' aria-hidden />
              None
            </span>
          </SelectItem>
          {STATUS_COLOR_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              <span className='flex items-center gap-2 capitalize'>
                <span className={cn('size-2.5 rounded-full', statusDotClass(key))} aria-hidden />
                {key}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={`Name of ${label.name}`}
        value={name}
        maxLength={40}
        className='h-8 flex-1'
        disabled={pending}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setName(label.name);
        }}
      />
      <span className='w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums'>
        {label.taskCount} {label.taskCount === 1 ? 'task' : 'tasks'}
      </span>
      {canDelete && (
        <>
          <Button
            variant='ghost'
            size='icon'
            className='size-8 text-muted-foreground hover:text-destructive'
            aria-label={`Delete ${label.name}`}
            onClick={() => setConfirming(true)}>
            <Trash2 className='size-4' />
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{label.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  {label.taskCount > 0
                    ? `It's on ${label.taskCount} ${label.taskCount === 1 ? 'task' : 'tasks'}, which will lose it. The tasks stay.`
                    : 'No task uses it.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className='bg-destructive text-white hover:bg-destructive/90'
                  onClick={() =>
                    start(async () => {
                      const result = await deleteLabel({ labelId: label.id });
                      if (result.error !== undefined) toast.error(result.error, { position: 'top-center' });
                      else toast.success(`Deleted “${label.name}”`, { position: 'top-center' });
                    })
                  }>
                  Delete label
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}
