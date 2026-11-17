/**
 * Task deep links: the open task lives in the URL as `?task=<id>`, so a task
 * can be shared, bookmarked, and opened from search, activity or "My tasks".
 */
export const TASK_PARAM = 'task';

export function projectHref(workspaceSlug: string, projectId: string) {
  return `/workspaces/${workspaceSlug}/projects/${projectId}`;
}

export function taskHref(workspaceSlug: string, projectId: string, taskId: string) {
  return `${projectHref(workspaceSlug, projectId)}?${TASK_PARAM}=${encodeURIComponent(taskId)}`;
}

/**
 * Open or close the task sheet on the current page without a server round
 * trip. Next.js syncs `history.pushState` with `useSearchParams`, and the
 * browser's Back button closes the sheet again.
 */
function setTaskParam(taskId: string | null, mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  if (taskId) url.searchParams.set(TASK_PARAM, taskId);
  else url.searchParams.delete(TASK_PARAM);
  if (url.href === window.location.href) return;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

/** The task this page pushed onto history, so closing can pop it instead. */
let pushedTaskId: string | null = null;

export function openTask(taskId: string) {
  pushedTaskId = taskId;
  setTaskParam(taskId, 'push');
}

/**
 * Close the sheet. If we opened it with a history entry, go back so the
 * Back button doesn't land on the same task again; a deep-linked task
 * (pasted URL, search result) just drops the param.
 */
export function closeTask() {
  const current = new URL(window.location.href).searchParams.get(TASK_PARAM);
  if (current && current === pushedTaskId) {
    pushedTaskId = null;
    window.history.back();
    return;
  }
  pushedTaskId = null;
  setTaskParam(null, 'replace');
}
