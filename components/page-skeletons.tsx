import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholders shaped like the real pages, so content replaces them
 * without jumping. Each matches its page's padding and widths.
 */

function Status({ label }: { label: string }) {
  return <span className='sr-only' role='status'>{`Loading ${label}…`}</span>;
}

/** Workspace home: greeting, three stat cards, recent projects. */
export function WorkspaceHomeSkeleton() {
  return (
    <div className='flex-1 max-w-5xl space-y-8 p-6 md:p-8'>
      <Status label='workspace' />
      <div className='space-y-2'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-4 w-80' />
      </div>
      <div className='grid gap-4 sm:grid-cols-3'>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className='h-28 rounded-xl' />
        ))}
      </div>
      <div className='space-y-3'>
        <Skeleton className='h-5 w-40' />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className='h-14 rounded-lg' />
        ))}
      </div>
    </div>
  );
}

/** Project: title block and view switcher, then board columns with cards. */
export function ProjectSkeleton() {
  const cards = [3, 2, 2, 1];
  return (
    <div className='flex h-full flex-col'>
      <Status label='project' />
      <div className='space-y-2 border-b px-4 py-2'>
        <Skeleton className='h-6 w-48' />
        <Skeleton className='h-4 w-72' />
        <Skeleton className='h-9 w-56 rounded-lg' />
      </div>
      <div className='flex flex-1 items-start gap-4 overflow-hidden p-4'>
        {cards.map((n, i) => (
          <div key={i} className='w-64 shrink-0 space-y-2 rounded-lg bg-muted p-2'>
            <Skeleton className='h-6 w-28 bg-background/70' />
            {Array.from({ length: n }, (_, j) => (
              <Skeleton key={j} className='h-[4.5rem] rounded-md bg-background/70' />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** My tasks: header bar, then table rows. */
export function MyTasksSkeleton() {
  return (
    <div className='flex flex-1 flex-col'>
      <Status label='your tasks' />
      <div className='space-y-2 border-b px-4 py-4'>
        <Skeleton className='h-6 w-28' />
        <Skeleton className='h-4 w-80' />
      </div>
      <div className='space-y-2 p-4'>
        <Skeleton className='h-9 w-full max-w-sm' />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className='h-11 w-full' />
        ))}
      </div>
    </div>
  );
}

/** Activity: title, then avatar + two-line entries. */
export function ActivitySkeleton() {
  return (
    <div className='flex-1 max-w-3xl space-y-6 p-6 md:p-8'>
      <Status label='activity' />
      <div className='space-y-2'>
        <Skeleton className='h-8 w-32' />
        <Skeleton className='h-4 w-72' />
      </div>
      <div className='space-y-4'>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className='flex items-start gap-3'>
            <Skeleton className='size-7 shrink-0 rounded-full' />
            <div className='flex-1 space-y-1.5'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-3 w-24' />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings: title, tabs, then two cards. */
export function SettingsSkeleton() {
  return (
    <div className='flex-1'>
      <div className='max-w-3xl space-y-6 p-4 md:p-8'>
        <Status label='settings' />
        <div className='space-y-2'>
          <Skeleton className='h-8 w-28' />
          <Skeleton className='h-4 w-64' />
        </div>
        <Skeleton className='h-9 w-72 rounded-lg' />
        <Skeleton className='h-56 rounded-xl' />
        <Skeleton className='h-32 rounded-xl' />
      </div>
    </div>
  );
}
