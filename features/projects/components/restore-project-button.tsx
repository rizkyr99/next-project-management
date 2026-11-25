'use client';

import { Button } from '@/components/ui/button';
import { ArchiveRestore } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { setProjectArchived } from '../actions';

/** Brings an archived project back to the sidebar. */
export function RestoreProjectButton({
  projectId,
  projectName,
  size = 'sm',
}: Readonly<{ projectId: string; projectName: string; size?: 'sm' | 'default' }>) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant='outline'
      size={size}
      disabled={pending}
      aria-label={`Restore ${projectName}`}
      onClick={() =>
        start(async () => {
          const result = await setProjectArchived({ projectId, archived: false });
          if (result.error !== undefined) toast.error(result.error, { position: 'top-center' });
          else toast.success(`Restored ${projectName}`, { position: 'top-center' });
        })
      }>
      <ArchiveRestore />
      {pending ? 'Restoring…' : 'Restore'}
    </Button>
  );
}
