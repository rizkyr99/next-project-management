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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setUrlParams } from '@/features/tasks/use-task-filters';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { Bookmark, BookmarkPlus, Check, ChevronDown, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createSavedView, deleteSavedView } from '../actions';
import { currentView, PRESET_VIEWS, viewQuery, viewUpdates, type ViewOption } from '../query';
import { MAX_SAVED_VIEWS_PER_PROJECT } from '../schema';

/**
 * D3: built-in and saved views of a project. A built-in view sets the
 * filters; a saved one (yours only) brings back the layout, filters and sort.
 */
export function ViewsMenu({
  projectId,
  saved,
  approvals,
}: {
  projectId: string;
  saved: ViewOption[];
  /** The project uses client approvals: offer "Waiting on client". */
  approvals: boolean;
}) {
  const params = useSearchParams();
  const presets = PRESET_VIEWS.filter((v) => !v.approvals || approvals);
  const current = currentView(saved, presets, params);
  const canSave = viewQuery(params) !== '' && !saved.some((v) => v.id === current?.id);
  const [saving, setSaving] = useState(false);
  const [, startDelete] = useTransition();

  const remove = (view: ViewOption) =>
    startDelete(async () => {
      const result = await deleteSavedView({ viewId: view.id });
      if (result.error !== undefined) toast.error(result.error, { position: 'top-center' });
      else toast.success(`Deleted “${view.name}”`, { position: 'top-center' });
    });

  const item = (view: ViewOption, kind: 'saved' | 'preset') => (
    <DropdownMenuItem key={view.id} onSelect={() => setUrlParams(viewUpdates(view.query, kind))}>
      <Check className={current?.id === view.id ? '' : 'invisible'} aria-hidden />
      <span className='truncate'>{view.name}</span>
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm' className='h-8 max-w-48' aria-label={`Views: ${current?.name ?? 'none'}`}>
            <Bookmark />
            <span className='truncate'>{current?.name ?? 'Views'}</span>
            <ChevronDown className='opacity-60' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-60'>
          <DropdownMenuGroup>
            <DropdownMenuLabel className='text-xs text-muted-foreground'>Built in</DropdownMenuLabel>
            {presets.map((v) => item(v, 'preset'))}
          </DropdownMenuGroup>
          {saved.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className='text-xs text-muted-foreground'>Your views</DropdownMenuLabel>
              {saved.map((v) => item(v, 'saved'))}
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canSave} onSelect={() => setSaving(true)}>
            <BookmarkPlus />
            Save current view…
          </DropdownMenuItem>
          {saved.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Trash2 />
                Delete a view
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className='w-52'>
                {saved.map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    variant='destructive'
                    aria-label={`Delete ${v.name}`}
                    onSelect={() => remove(v)}>
                    <span className='truncate'>{v.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveViewDialog
        projectId={projectId}
        query={viewQuery(params)}
        full={saved.length >= MAX_SAVED_VIEWS_PER_PROJECT}
        open={saving}
        onOpenChange={setSaving}
      />
    </>
  );
}

function SaveViewDialog({
  projectId,
  query,
  full,
  open,
  onOpenChange,
}: {
  projectId: string;
  query: string;
  full: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [isPending, startTransition] = useTransition();
  useResetOnOpen(open, () => setName(''));

  const save = () =>
    startTransition(async () => {
      const result = await createSavedView({ projectId, name, query });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(`Saved “${result.view.name}”`, { position: 'top-center' });
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>
            Keeps this layout, its filters and sort under a name in the Views menu. Only you see your views.
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !full) save();
          }}>
          <div className='space-y-2'>
            <Label htmlFor='saved-view-name'>View name</Label>
            <Input
              id='saved-view-name'
              value={name}
              maxLength={60}
              placeholder='e.g. Design review'
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {full && (
              <p role='alert' className='text-xs text-destructive'>
                You have {MAX_SAVED_VIEWS_PER_PROJECT} views here, the most a project can have. Delete one first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={!name.trim() || full || isPending}>
              {isPending ? 'Saving…' : 'Save view'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
