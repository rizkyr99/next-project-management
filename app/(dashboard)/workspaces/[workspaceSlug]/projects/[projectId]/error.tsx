'use client';

import { RouteError } from '@/components/route-error';
import { useParams } from 'next/navigation';

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <RouteError
      error={error}
      reset={reset}
      title='Something went wrong loading this project'
      backHref={`/workspaces/${workspaceSlug}`}
      backLabel='Back to workspace'
    />
  );
}
