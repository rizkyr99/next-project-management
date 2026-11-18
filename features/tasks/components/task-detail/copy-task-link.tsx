'use client';

import { Button } from '@/components/ui/button';
import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TASK_PARAM } from '../../task-link';

/** Copies a link that opens this task, for pasting into chat or email. */
export function CopyTaskLink({ taskId }: Readonly<{ taskId: string }>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(reset);
  }, [copied]);

  const copy = async () => {
    // Just the task: no view or filters from this page.
    const url = `${window.location.origin}${window.location.pathname}?${TASK_PARAM}=${encodeURIComponent(taskId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied', { position: 'top-center' });
    } catch {
      toast.error('Couldn’t copy. Copy the address from your browser instead.', { position: 'top-center' });
    }
  };

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='size-8 shrink-0 text-muted-foreground'
      aria-label={copied ? 'Link copied' : 'Copy link to task'}
      title='Copy link to task'
      onClick={copy}>
      {copied ? <Check /> : <Link2 />}
    </Button>
  );
}
