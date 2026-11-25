'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setGuestProjects } from '../guest-actions';

/** Owners and admins choose which projects a guest (client) can see. */
export function GuestProjectsDialog({
  workspaceId,
  guest,
  projects,
  open,
  onOpenChange,
}: Readonly<{
  workspaceId: string;
  guest: { id: string; name: string | null; email: string; projects?: { id: string; name: string }[] } | null;
  projects: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  useResetOnOpen(open, () => setChosen(guest?.projects?.map((p) => p.id) ?? []));

  // Archived projects a guest still has stay listed, so saving doesn't drop them silently.
  const options = [
    ...projects,
    ...(guest?.projects ?? []).filter((p) => !projects.some((a) => a.id === p.id)),
  ];
  const name = guest?.name ?? guest?.email ?? 'this guest';

  const save = () =>
    start(async () => {
      if (!guest) return;
      const result = await setGuestProjects({ workspaceId, memberId: guest.id, projectIds: chosen });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success(`Updated what ${name} can see`, { position: 'top-center' });
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projects shared with {name}</DialogTitle>
          <DialogDescription>
            Guests see only these projects and can comment on them. Unticking one removes their access at once.
          </DialogDescription>
        </DialogHeader>
        <div role='group' aria-label='Projects' className='max-h-64 space-y-1 overflow-y-auto rounded-md border p-2'>
          {options.map((p) => (
            <label key={p.id} className='flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted'>
              <Checkbox
                checked={chosen.includes(p.id)}
                onCheckedChange={(on) => setChosen((c) => (on ? [...c, p.id] : c.filter((id) => id !== p.id)))}
              />
              <span className='truncate'>{p.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || chosen.length === 0}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
