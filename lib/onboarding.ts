import { db } from '@/db/drizzle';
import { project, task, taskStatus } from '@/db/schema';

export const GETTING_STARTED_NAME = 'Getting started';

/**
 * A short project every new workspace starts with: each task teaches one
 * thing by asking you to do it. Returned as queries (not awaited) so it's
 * written in the same db.batch as the workspace itself.
 *
 * These inserts deliberately log no activity: the first-run checklist on the
 * workspace home counts *your* first project and task from the activity log.
 */
export function gettingStartedQueries(workspaceId: string, now = new Date()) {
  const projectId = crypto.randomUUID();
  const todo = crypto.randomUUID();
  const doing = crypto.randomUUID();
  const done = crypto.randomUUID();
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const tasks: {
    title: string;
    description: string;
    statusId: string;
    priority: 'low' | 'medium' | 'high';
    dueDate?: Date;
  }[] = [
    {
      title: 'Open a task to see its details',
      statusId: todo,
      priority: 'high',
      description:
        'Click a card (or focus it and press **Enter**) to open it beside the board.\n\n' +
        'From here you can change the status, priority, due date and assignees, write a description in **Markdown**, and comment. ' +
        'Type **@** in a comment to mention a teammate.\n\n' +
        'The page address now ends in `?task=…`. Copy it to share exactly this task.',
    },
    {
      title: 'Drag this card to In Progress',
      statusId: todo,
      priority: 'medium',
      description:
        'Drag cards between columns to change their status, or up and down to reorder them.\n\n' +
        'From the keyboard: focus a card, press **Space** to pick it up, use the **arrow keys** to move it, and **Space** again to drop it.',
    },
    {
      title: 'Assign this task to yourself',
      statusId: todo,
      priority: 'medium',
      description:
        'Open this task and pick yourself under **Assignees**.\n\n' +
        'Everything assigned to you, across all projects, shows up in **My tasks** in the sidebar.',
    },
    {
      title: 'Search with ⌘K (Ctrl K on Windows)',
      statusId: todo,
      priority: 'low',
      description: 'Search finds tasks, projects and comments across the whole workspace. Try searching for “invite”.',
    },
    {
      title: 'Invite a teammate',
      statusId: todo,
      priority: 'high',
      dueDate: inDays(3),
      description:
        'Open **Settings → Members** and invite someone by email. They get a link that works for 7 days.\n\n' +
        'Members can work on every project; admins can also invite and remove people.',
    },
    {
      title: 'Make this board your own',
      statusId: doing,
      priority: 'low',
      description:
        'Rename, recolour or delete a column from its **⋯** menu, and add columns on the right.\n\n' +
        'When you’re done with this project, delete it from the **⋯** menu next to its name.',
    },
    {
      title: 'Create your workspace',
      statusId: done,
      priority: 'low',
      description: 'You already did this one.',
    },
  ];

  const order: Record<string, number> = {};
  return [
    db.insert(project).values({
      id: projectId,
      name: GETTING_STARTED_NAME,
      description: 'A quick tour: each task shows you one thing.',
      workspaceId,
    }),
    db.insert(taskStatus).values([
      { id: todo, projectId, name: 'To Do', order: 1, isDefault: true },
      { id: doing, projectId, name: 'In Progress', order: 2, color: 'blue' },
      { id: done, projectId, name: 'Done', order: 3, color: 'green' },
    ]),
    db.insert(task).values(
      tasks.map((t) => {
        order[t.statusId] = (order[t.statusId] ?? 0) + 1;
        return { ...t, projectId, order: order[t.statusId] };
      }),
    ),
  ] as const;
}
