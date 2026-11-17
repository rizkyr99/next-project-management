'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import './globals.css';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it brings its own <html>, styles and copy instead of
 * Next.js's bare default page.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='en'>
      <body className='bg-background text-foreground antialiased'>
        <main
          role='alert'
          className='flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center font-sans'>
          <h1 className='text-2xl font-semibold'>Tide couldn’t load</h1>
          <p className='max-w-[44ch] text-muted-foreground'>
            Something went wrong on our side. Try again; if it keeps happening, let us know the code
            below.
          </p>
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={reset}
              className='rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'>
              Try again
            </button>
            {/* A full reload on purpose, in case the client app itself is what broke. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href='/' className='rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted'>
              Go to Tide
            </a>
          </div>
          {error.digest && <p className='text-xs text-muted-foreground'>Error code: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
