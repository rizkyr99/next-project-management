import { formatBytes, PLAN_DETAILS, TRIAL_DAYS, TRIAL_REMINDER_DAYS } from '@/lib/plans';

/**
 * E5: the help centre's articles. Plain content, rendered by /help and
 * /help/[slug]; prices, limits and the trial come from lib/plans.ts so the
 * help can't drift from the product.
 */

export interface HelpSection {
  heading: string;
  paragraphs?: string[];
  /** Numbered steps, when the section is a procedure. */
  steps?: string[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  /** One sentence for the index and the page description. */
  summary: string;
  sections: HelpSection[];
}

const free = PLAN_DETAILS.free;
const pro = PLAN_DETAILS.pro;

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    summary: 'Set up a workspace, start your first project and bring your team in.',
    sections: [
      {
        heading: 'Your workspace',
        paragraphs: [
          'A workspace is your studio’s space in Tide: its people, projects and plan. You create one when you sign up, and it starts with a short “Getting started” project that shows you around. Delete it whenever you like.',
          `Every new workspace begins with ${TRIAL_DAYS} days of Pro, so you can try working with clients before deciding on a plan.`,
        ],
      },
      {
        heading: 'Start a project',
        steps: [
          'Click + next to Projects in the sidebar.',
          'Give it a name. To skip the setup, choose a template under Start from and pick a start date.',
          'Click Create project. Add tasks at the bottom of any column, and drag cards between columns as work moves.',
        ],
        paragraphs: [
          'Every project can be shown as a board, a list or a table: switch with the buttons under its name. Columns are yours to rename, recolour and reorder from their ⋯ menu.',
        ],
      },
      {
        heading: 'Bring in your team',
        steps: [
          'Open Settings, then Members.',
          'Enter a teammate’s email, choose Member or Admin, and click Send invite.',
          'They get an email with a link that works for 7 days. You can also copy the link and send it yourself.',
        ],
        paragraphs: [
          'Members work on every project. Admins can also invite and remove people, and manage share links. Only the owner handles billing.',
        ],
      },
      {
        heading: 'Find your way around',
        paragraphs: [
          'Home shows what’s overdue and due this week across every project, which projects need a look and what clients said recently. My tasks lists everything assigned to you.',
          'Press ⌘K (Ctrl K on Windows) to search tasks, projects and comments. Open any task to see its details beside the board, and copy its link to share exactly that task.',
        ],
      },
    ],
  },
  {
    slug: 'clients',
    title: 'Working with clients',
    summary: 'Invite clients to their projects, decide what they see, and get work approved.',
    sections: [
      {
        heading: 'Invite a client',
        steps: [
          'Open Settings, then Members.',
          'Enter the client’s email and choose Guest (client) as the role.',
          'Tick the projects that are theirs, and click Send invite.',
        ],
        paragraphs: [
          'Clients are free: they never count as team members. You can change which projects a client sees later from the member list. Inviting clients is part of Pro.',
        ],
      },
      {
        heading: 'What a client sees',
        paragraphs: [
          'Only the projects shared with them. On those, they see the board and the tasks, the comments and files you’ve shared, approval requests, and anything they add themselves.',
          'They never see your other clients, other projects, your internal comments or files, the activity log, or your team’s settings.',
        ],
      },
      {
        heading: 'Internal or shared with the client',
        paragraphs: [
          'Once a project has a client, your team’s comments start internal. When you post one meant for the client, choose Client can see above the comment box. To change a comment later, use its Share comment with client or Make comment internal button.',
          'Files work the same way: they start internal, and the eye button next to a file shares it with the client. Anything the client posts or uploads is always visible to them.',
        ],
      },
      {
        heading: 'Ask for approval',
        steps: [
          'Open the task and click Request approval.',
          'Add a short note about what to look at, and click Send to client.',
          'The client gets an email, and can approve or request changes, with a note, from the task.',
        ],
        paragraphs: [
          'The card shows “Awaiting approval” until they answer, then “Approved” or “Changes requested”. You can withdraw a request while it’s waiting, and every round stays in the task’s history.',
        ],
      },
      {
        heading: 'Share a read-only link',
        paragraphs: [
          'For people who won’t sign in, open the project’s ⋯ menu, choose Share link… and click Create link. Anyone with the link can see the board, but not comments, files or who’s assigned. Owners and admins can replace the link or turn it off at any time.',
        ],
      },
    ],
  },
  {
    slug: 'templates',
    title: 'Project templates',
    summary: 'Start each job from a template, or save one of your own.',
    sections: [
      {
        heading: 'Start from a template',
        steps: [
          'Click + next to Projects, and name the project.',
          'Under Start from, pick Website build, Brand identity, Content calendar or one of your own.',
          'Choose a start date. The first due date lands on that day, and the rest keep their spacing.',
        ],
        paragraphs: [
          'The new project gets the template’s columns, tasks, checklists, priorities and labels. Labels are matched to your workspace’s by name, and missing ones are created.',
        ],
      },
      {
        heading: 'Save your own',
        paragraphs: [
          'When a project works well, open its ⋯ menu and choose Save as template…. Assignees, comments, approvals and files aren’t copied, only the shape of the work. Saving your own templates is part of Pro; the built-in ones are free.',
          'Your templates are listed under Settings, then Templates. The person who saved one, or an owner or admin, can delete it; projects already started from it don’t change.',
        ],
      },
    ],
  },
  {
    slug: 'billing',
    title: 'Plans, billing and the trial',
    summary: `What Free and Pro include, how the ${TRIAL_DAYS}-day trial works, and how billing follows your team.`,
    sections: [
      {
        heading: 'Free and Pro',
        paragraphs: [
          `Free is for a team of up to ${free.maxMembers} with unlimited projects and tasks, boards, labels, checklists, the built-in templates and ${formatBytes(free.storageBytes)} of files.`,
          `Pro is $${pro.priceMonthly} per team member per month. It adds client guests, approvals, share links, your own templates, unlimited team members and ${formatBytes(pro.storageBytes)} of files. Clients are always free.`,
        ],
      },
      {
        heading: 'The free trial',
        paragraphs: [
          `A new workspace gets ${TRIAL_DAYS} days of Pro, with no card. The sidebar counts down, and the owner gets an email ${TRIAL_REMINDER_DAYS} days before it ends and another when it does. Each person gets one trial.`,
          'If you don’t upgrade, the workspace moves to Free and nothing is deleted. Clients you invited keep their access, share links keep working and open approvals can still be answered; you just can’t add new Pro things until you upgrade.',
        ],
      },
      {
        heading: 'Upgrade',
        steps: [
          'Open Settings, then Billing. Only the workspace owner can upgrade.',
          'Click Upgrade to Pro and pay through Stripe.',
          'You’re billed for each team member. When people join or leave, the next invoice adjusts, prorated. Clients don’t count.',
        ],
      },
      {
        heading: 'Change or cancel',
        paragraphs: [
          'The owner can update the card, download invoices or cancel from Settings, then Billing, then Manage billing. Cancelling keeps Pro until the end of the paid month, then the workspace moves to Free, with nothing deleted.',
        ],
      },
    ],
  },
];

export function helpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
