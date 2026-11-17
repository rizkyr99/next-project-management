'use client';

import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Body of an error.tsx boundary: reports to Sentry, says what failed in plain
 * words, and offers a retry plus a way out. The digest lets support find the
 * matching server log.
 */
export function RouteError({
  error,
  reset,
  title,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  backHref: string;
  backLabel: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role='alert' className='flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center'>
      <AlertTriangle className='size-8 text-destructive' aria-hidden />
      <div className='space-y-1'>
        <h1 className='text-lg font-semibold'>{title}</h1>
        <p className='max-w-[46ch] text-sm text-muted-foreground'>
          This is usually temporary. Try again, and if it keeps happening, let us know the code below.
        </p>
      </div>
      <div className='flex gap-2'>
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant='outline'>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
      {error.digest && <p className='text-xs text-muted-foreground'>Error code: {error.digest}</p>}
    </div>
  );
}
