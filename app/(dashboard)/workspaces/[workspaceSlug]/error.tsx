'use client';

import { RouteError } from '@/components/route-error';

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title='Something went wrong loading this workspace'
      backHref='/home'
      backLabel='Go to my workspaces'
    />
  );
}
