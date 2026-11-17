'use client';

import { Button } from '@/components/ui/button';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * A missing project or page inside a workspace you belong to: shown inside the
 * app shell, so the sidebar and header stay usable.
 */
export default function WorkspaceNotFound() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center'>
      <SearchX className='size-8 text-muted-foreground' aria-hidden />
      <div className='space-y-1'>
        <h1 className='text-lg font-semibold'>This page could not be found</h1>
        <p className='max-w-[44ch] text-sm text-muted-foreground'>
          It may have been deleted, or the link is wrong. Projects only appear to members of their
          workspace.
        </p>
      </div>
      <Button asChild variant='outline'>
        <Link href={`/workspaces/${workspaceSlug}`}>Back to workspace</Link>
      </Button>
    </div>
  );
}
