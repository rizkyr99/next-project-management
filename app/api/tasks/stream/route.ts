import { z } from 'zod';
import { projectSnapshot } from '@/features/tasks/snapshot';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';
import { pollingStream } from '@/lib/sse';

export const dynamic = 'force-dynamic';
// Must be a literal (Next reads it statically); see lib/sse.ts.
export const maxDuration = 300;

/**
 * Tells an open board when anything on it changed, so it refreshes.
 *
 * Every event carries the project's snapshot as its id. When the client
 * reconnects (the stream recycles every few minutes, or the tab was hidden),
 * it passes the last snapshot it saw, as Last-Event-ID or `?since=`, and
 * hears about changes it missed straight away.
 */
export async function GET(request: Request) {
  let projectId: string;
  let since: string | null;
  try {
    const { searchParams } = new URL(request.url);
    const requested = z.uuid().parse(searchParams.get('projectId'));
    projectId = (await requireProjectAccess(requested, { allowGuests: true })).project.id;
    since = request.headers.get('last-event-id') || searchParams.get('since') || null;
  } catch (error) {
    return toErrorResponse(error);
  }

  let last = since;
  const check = async (send: { event: (data: unknown, id?: string) => void }) => {
    const snap = await projectSnapshot(projectId);
    if (last === null) {
      // First connection: this is the baseline the page was rendered from.
      send.event({ type: 'snapshot' }, snap);
    } else if (snap !== last) {
      send.event({ type: 'tasks_changed', projectId }, snap);
    }
    last = snap;
  };

  return pollingStream({ intervalMs: 5_000, label: 'tasks', onOpen: check, onTick: check });
}
