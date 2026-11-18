'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';

/**
 * Inside a <Link>: a small spinner while the page it points to is loading,
 * so the item you clicked shows it's working. Shows only after a short
 * delay, so fast navigations don't flicker.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden
      data-pending={pending}
      className='ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground opacity-0 transition-opacity data-[pending=true]:opacity-100 data-[pending=true]:delay-150 motion-reduce:animate-none'
    />
  );
}
