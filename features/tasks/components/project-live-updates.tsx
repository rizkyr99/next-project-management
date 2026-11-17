'use client';

import { useTaskStream } from '../hooks/use-task-stream';

/** Refreshes the project page (board, list or table) when others change it. */
export function ProjectLiveUpdates({ projectId, snapshot }: { projectId: string; snapshot: string }) {
  useTaskStream(projectId, snapshot);
  return null;
}
