import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found' };

/** Anything outside a workspace that doesn't exist (and workspaces you're not in). */
export default function NotFound() {
  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center'>
      <Logo />
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold'>This page could not be found</h1>
        <p className='max-w-[44ch] text-muted-foreground'>
          The link may be mistyped, or the page was deleted. If it was shared with you, ask for a new link.
        </p>
      </div>
      <Button asChild>
        <Link href='/'>Go to Tide</Link>
      </Button>
    </main>
  );
}
