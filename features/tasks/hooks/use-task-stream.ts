'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useTaskStream(projectId: string) {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource(`/api/tasks/stream?projectId=${projectId}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'tasks_changed') {
          router.refresh();
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => es.close();
  }, [projectId, router]);
}
