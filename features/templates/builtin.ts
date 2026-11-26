import { BUILTIN_PREFIX, type TemplateData, type TemplateSummary, type TemplateTask } from './shape';

/**
 * Templates every workspace can start from. Ids are stable ("builtin:…"),
 * since a choice in an open dialog refers to them; contents can change.
 */

type Builtin = TemplateSummary & { data: TemplateData };

const task = (
  title: string,
  column: number,
  days: number | null,
  extra: Partial<Omit<TemplateTask, 'title' | 'column' | 'due'>> = {},
): TemplateTask => ({
  title,
  column,
  due: days === null ? null : { days, time: null },
  description: null,
  priority: 'medium',
  labels: [],
  checklist: [],
  ...extra,
});

const STUDIO_COLUMNS = [
  { name: 'To Do', color: null, isDefault: true },
  { name: 'In Progress', color: 'blue', isDefault: false },
  { name: 'Client review', color: 'yellow', isDefault: false },
  { name: 'Done', color: 'green', isDefault: false },
] satisfies TemplateData['columns'];

const website: TemplateData = {
  columns: STUDIO_COLUMNS,
  labels: [
    { name: 'Design', color: 'purple' },
    { name: 'Development', color: 'blue' },
    { name: 'Copy', color: 'orange' },
    { name: 'Client feedback', color: 'yellow' },
  ],
  tasks: [
    task('Kickoff call', 0, 0, {
      priority: 'high',
      description: 'Agree goals, audience, scope and dates. Note who signs off on the client side.',
      checklist: ['Send the agenda', 'Confirm decision-makers', 'Collect logins and brand assets', 'Share notes after the call'],
    }),
    task('Sitemap and content plan', 0, 5, {
      labels: ['Copy'],
      checklist: ['List every page', 'Decide who writes each page', 'Agree the navigation'],
    }),
    task('Wireframes', 0, 10, { labels: ['Design'], checklist: ['Homepage', 'Key inner pages', 'Mobile layouts'] }),
    task('Visual design', 0, 20, {
      priority: 'high',
      labels: ['Design'],
      checklist: ['Homepage design', 'Inner page templates', 'Component states', 'Client sign-off'],
    }),
    task('Copywriting', 0, 20, { labels: ['Copy'] }),
    task('Build', 0, 35, {
      priority: 'high',
      labels: ['Development'],
      checklist: ['Set up hosting and repo', 'Build templates', 'Add content', 'Forms and analytics'],
    }),
    task('Testing and fixes', 0, 40, {
      labels: ['Development'],
      checklist: ['Browsers and phones', 'Accessibility pass', 'Page speed', 'Broken links'],
    }),
    task('Client review round', 0, 42, { labels: ['Client feedback'] }),
    task('Launch', 0, 45, {
      priority: 'urgent',
      checklist: ['Point the domain', 'Redirects from the old site', 'Submit the sitemap', 'Announce'],
    }),
    task('Handover and training', 0, 50, { description: 'Walk the client through editing the site; send logins and a short guide.' }),
  ],
};

const brand: TemplateData = {
  columns: STUDIO_COLUMNS,
  labels: [
    { name: 'Research', color: 'gray' },
    { name: 'Design', color: 'purple' },
    { name: 'Client feedback', color: 'yellow' },
  ],
  tasks: [
    task('Discovery workshop', 0, 0, {
      priority: 'high',
      labels: ['Research'],
      checklist: ['Brand questionnaire', 'Workshop', 'Summary of findings'],
    }),
    task('Competitor and market review', 0, 5, { labels: ['Research'] }),
    task('Moodboards', 0, 8, { labels: ['Design'] }),
    task('Logo concepts', 0, 15, {
      priority: 'high',
      labels: ['Design'],
      checklist: ['Three directions', 'Present to client', 'Pick one direction'],
    }),
    task('Logo refinement', 0, 22, { labels: ['Design', 'Client feedback'] }),
    task('Colour and type system', 0, 25, { labels: ['Design'] }),
    task('Brand guidelines', 0, 32, {
      labels: ['Design'],
      checklist: ['Logo usage', 'Colour', 'Typography', 'Imagery and tone of voice'],
    }),
    task('Final files and handover', 0, 35, {
      priority: 'high',
      checklist: ['Logo files (SVG, PNG, PDF)', 'Fonts and licences', 'Guidelines PDF'],
    }),
  ],
};

const content: TemplateData = {
  columns: [
    { name: 'Ideas', color: 'gray', isDefault: true },
    { name: 'Writing', color: 'blue', isDefault: false },
    { name: 'Client review', color: 'yellow', isDefault: false },
    { name: 'Scheduled', color: 'purple', isDefault: false },
    { name: 'Published', color: 'green', isDefault: false },
  ],
  labels: [
    { name: 'Blog', color: 'blue' },
    { name: 'Social', color: 'pink' },
    { name: 'Newsletter', color: 'orange' },
  ],
  tasks: [
    task('Plan the month', 0, 0, {
      priority: 'high',
      checklist: ['Review last month’s results', 'Pick themes', 'Agree dates with the client'],
    }),
    task('Blog post 1', 0, 7, { labels: ['Blog'], checklist: ['Draft', 'Images', 'SEO check'] }),
    task('Social posts, week 1', 0, 3, { labels: ['Social'] }),
    task('Social posts, week 2', 0, 10, { labels: ['Social'] }),
    task('Newsletter', 0, 14, { labels: ['Newsletter'], checklist: ['Draft', 'Test send', 'Schedule'] }),
    task('Blog post 2', 0, 21, { labels: ['Blog'], checklist: ['Draft', 'Images', 'SEO check'] }),
    task('Social posts, week 3', 0, 17, { labels: ['Social'] }),
    task('Social posts, week 4', 0, 24, { labels: ['Social'] }),
    task('Monthly report', 0, 30, { description: 'What went out, what worked, and what to try next month.' }),
  ],
};

export const BUILTIN_TEMPLATES: Builtin[] = [
  {
    id: `${BUILTIN_PREFIX}website`,
    name: 'Website build',
    description: 'From kickoff to launch and handover, over about seven weeks.',
    taskCount: website.tasks.length,
    data: website,
  },
  {
    id: `${BUILTIN_PREFIX}brand`,
    name: 'Brand identity',
    description: 'Discovery, logo, colour and type, and guidelines, over about five weeks.',
    taskCount: brand.tasks.length,
    data: brand,
  },
  {
    id: `${BUILTIN_PREFIX}content`,
    name: 'Content calendar',
    description: 'A month of blog, social and newsletter work for one client.',
    taskCount: content.tasks.length,
    data: content,
  },
];

export function builtinTemplate(id: string): Builtin | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
