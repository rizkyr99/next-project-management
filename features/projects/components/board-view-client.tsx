'use client';

import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';
import { BoardView } from './board-view';

const BoardViewLazy = dynamic(
  () => import('./board-view').then((mod) => mod.BoardView),
  {
    ssr: false,
    loading: () => (
      <div className='w-full h-full flex items-start gap-4 p-4'>
        <Skeleton className='bg-muted w-64 h-32 rounded-lg space-y-2 shrink-0' />
        <Skeleton className='bg-muted w-64 h-32 rounded-lg space-y-2 shrink-0' />
        <Skeleton className='bg-muted w-64 h-32 rounded-lg space-y-2 shrink-0' />
      </div>
    ),
  },
);

type Props = ComponentProps<typeof BoardView>;

/** The board syncs itself from fresh server data (no remount key needed). */
export default function BoardViewClient(props: Props) {
  return <BoardViewLazy {...props} />;
}
