'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STATUS_COLOR_KEYS, statusDotClass } from '@/features/projects/status-colors';
import { cn } from '@/lib/utils';
import { Check, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createLabel } from '../actions';
import { MAX_LABELS_PER_TASK, type LabelInfo } from '../schema';
import { LabelChip } from './label-chip';

/**
 * Pick a task's labels from the workspace's, or create one by typing a new
 * name. Changes are applied at once through `onChange` (the sheet saves them).
 */
export function LabelPicker({
  projectId,
  available,
  selectedIds,
  onChange,
}: Readonly<{
  projectId: string;
  available: LabelInfo[];
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Labels created here, shown before the page's data includes them.
  const [created, setCreated] = useState<LabelInfo[]>([]);
  const [creating, startCreate] = useTransition();

  const all = [...available, ...created.filter((c) => !available.some((a) => a.id === c.id))];
  const selected = selectedIds.map((id) => all.find((l) => l.id === id)).filter((l): l is LabelInfo => Boolean(l));
  const q = query.trim();
  const matches = all.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  const exact = all.some((l) => l.name.toLowerCase() === q.toLowerCase());

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) return onChange(selectedIds.filter((x) => x !== id));
    if (selectedIds.length >= MAX_LABELS_PER_TASK) {
      toast.error(`A task can have up to ${MAX_LABELS_PER_TASK} labels.`, { position: 'top-center' });
      return;
    }
    onChange([...selectedIds, id]);
  };

  const create = () =>
    startCreate(async () => {
      const color = STATUS_COLOR_KEYS[all.length % STATUS_COLOR_KEYS.length];
      const result = await createLabel({ projectId, name: q, color });
      if (result.error !== undefined || !result.label) {
        toast.error(result.error ?? 'Could not create the label.', { position: 'top-center' });
        return;
      }
      const made = result.label;
      setCreated((prev) => [...prev, made]);
      setQuery('');
      toggle(made.id);
    });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          aria-label={selected.length ? `Labels: ${selected.map((l) => l.name).join(', ')}. Edit labels` : 'Add labels'}
          className='h-auto min-h-8 justify-start px-2 font-normal'>
          {selected.length ? (
            <span className='flex flex-wrap gap-1'>
              {selected.map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
            </span>
          ) : (
            <span className='text-muted-foreground'>Add labels</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-64 p-2' align='start'>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && !exact && !creating) {
              e.preventDefault();
              create();
            }
          }}
          placeholder='Find or create a label…'
          aria-label='Find or create a label'
          maxLength={40}
          className='h-8'
        />
        <div role='group' aria-label='Labels' className='mt-2 max-h-56 space-y-0.5 overflow-y-auto'>
          {matches.map((l) => {
            const on = selectedIds.includes(l.id);
            return (
              <button
                key={l.id}
                type='button'
                role='menuitemcheckbox'
                aria-checked={on}
                onClick={() => toggle(l.id)}
                className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted'>
                <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(l.color))} aria-hidden />
                <span className='flex-1 truncate'>{l.name}</span>
                {on && <Check className='size-3.5 text-primary' aria-hidden />}
              </button>
            );
          })}
          {q && !exact && (
            <button
              type='button'
              disabled={creating}
              onClick={create}
              className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60'>
              <Plus className='size-3.5' aria-hidden />
              <span className='truncate'>
                Create “<span className='font-medium'>{q}</span>”
              </span>
            </button>
          )}
          {!q && all.length === 0 && (
            <p className='px-2 py-1.5 text-xs text-muted-foreground'>No labels yet. Type a name to create one.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
