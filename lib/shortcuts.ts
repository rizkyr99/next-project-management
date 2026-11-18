/**
 * Keyboard shortcuts: what exists (for the help dialog and ⌘K hints), and
 * the events that connect a key press to the component that acts on it.
 */

export const SHORTCUT_EVENTS = {
  addTask: 'tide:add-task',
  newProject: 'tide:new-project',
  openCommand: 'tide:open-command',
  openShortcuts: 'tide:open-shortcuts',
} as const;

export function emit(event: (typeof SHORTCUT_EVENTS)[keyof typeof SHORTCUT_EVENTS]) {
  window.dispatchEvent(new Event(event));
}

/**
 * "Add a task" may be asked for before the board has mounted (e.g. from the
 * list view, which switches to the board first). The default column takes
 * the request when it mounts, or at once if it's already there.
 */
let addTaskRequested = false;
export function requestAddTask() {
  addTaskRequested = true;
  emit(SHORTCUT_EVENTS.addTask);
}
export function takeAddTaskRequest() {
  const requested = addTaskRequested;
  addTaskRequested = false;
  return requested;
}

/** Single-key shortcuts must never fire while someone is typing or in a dialog. */
export function shouldIgnoreKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"]')) return true;
  return false;
}

export type Shortcut = { keys: string[]; label: string };

export const SHORTCUT_GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['⌘', 'K'], label: 'Search and actions' },
      { keys: ['?'], label: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Go to',
    shortcuts: [
      { keys: ['G', 'H'], label: 'Home' },
      { keys: ['G', 'M'], label: 'My tasks' },
      { keys: ['G', 'A'], label: 'Activity' },
      { keys: ['G', 'S'], label: 'Workspace settings' },
      { keys: ['G', 'N'], label: 'Notifications' },
      { keys: ['G', 'B'], label: 'Billing' },
    ],
  },
  {
    title: 'In a project',
    shortcuts: [
      { keys: ['C'], label: 'Add a task' },
      { keys: ['/'], label: 'Filter tasks' },
      { keys: ['Enter'], label: 'Open the focused task' },
      { keys: ['Esc'], label: 'Close the task' },
    ],
  },
];

/** Where each G-shortcut goes, within a workspace. */
export function goToTarget(key: string, workspaceSlug: string): string | null {
  const base = `/workspaces/${workspaceSlug}`;
  switch (key.toLowerCase()) {
    case 'h': return base;
    case 'm': return `${base}/my-tasks`;
    case 'a': return `${base}/activity`;
    case 's': return `${base}/settings`;
    case 'n': return '/notifications';
    case 'b': return '/settings/billing';
    default: return null;
  }
}
