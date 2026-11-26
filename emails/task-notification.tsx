import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface TaskNotificationEmailProps {
  kind: 'assigned' | 'mentioned' | 'approval_requested' | 'approved' | 'changes_requested';
  actorName: string;
  taskTitle: string;
  /** The comment, request message or client's note (shortened). */
  excerpt?: string;
  taskUrl: string;
  appUrl: string;
  preferencesUrl: string;
  /** The studio's workspace: shown as the sender and in the header. */
  workspaceName?: string;
  projectName?: string;
  /**
   * `client` for a guest on the project: someone outside the studio, who
   * gets told who shared the work instead of Tide-internal wording.
   */
  audience?: 'team' | 'client';
}

const COPY = {
  assigned: {
    verb: 'assigned you to',
    heading: 'You have a new task',
    footer: 'You received this because someone assigned you a task on Tide.',
  },
  mentioned: {
    verb: 'mentioned you in',
    heading: 'You were mentioned',
    footer: 'You received this because someone mentioned you in a comment on Tide.',
  },
  approval_requested: {
    verb: 'asked for your approval on',
    heading: 'Your approval is needed',
    footer: 'You received this because a project shared with you on Tide needs your approval.',
  },
  approved: {
    verb: 'approved',
    heading: 'Approved',
    footer: 'You received this because you asked for, or are assigned to, an approval on Tide.',
  },
  changes_requested: {
    verb: 'requested changes to',
    heading: 'Changes requested',
    footer: 'You received this because you asked for, or are assigned to, an approval on Tide.',
  },
} as const;

/** The email's subject line, e.g. "Ada approved Homepage". */
export function taskNotificationSubject(props: Pick<TaskNotificationEmailProps, 'kind' | 'actorName' | 'taskTitle'>) {
  return `${props.actorName} ${COPY[props.kind].verb} ${props.taskTitle}`;
}

type Context = Pick<TaskNotificationEmailProps, 'workspaceName' | 'projectName' | 'audience'>;

/** "In Website redesign, shared by Acme Studio." – where the task lives. */
function contextLine({ workspaceName, projectName, audience }: Context): string | null {
  if (!projectName) return null;
  return audience === 'client' && workspaceName
    ? `In ${projectName}, shared by ${workspaceName}.`
    : `In ${projectName}.`;
}

function footerNote(kind: TaskNotificationEmailProps['kind'], { workspaceName, projectName, audience }: Context) {
  if (audience === 'client' && workspaceName && projectName) {
    return `You received this because ${workspaceName} shared ${projectName} with you on Tide.`;
  }
  return COPY[kind].footer;
}

function buttonLabel(kind: TaskNotificationEmailProps['kind']) {
  return kind === 'approval_requested' ? 'Review and respond' : 'Open task';
}

/** "Ada assigned you to …" / "Ada mentioned you in …". All props are escaped by React. */
export function TaskNotificationEmail(props: TaskNotificationEmailProps) {
  const { kind, actorName, taskTitle, excerpt, taskUrl, appUrl, preferencesUrl, workspaceName } = props;
  const copy = COPY[kind];
  const where = contextLine(props);
  return (
    <EmailLayout
      preview={`${actorName} ${copy.verb} ${taskTitle}`}
      appUrl={appUrl}
      preferencesUrl={preferencesUrl}
      brand={workspaceName}
      footerNote={footerNote(kind, props)}>
      <Heading as='h1' style={heading}>
        {copy.heading}
      </Heading>
      <Text style={where ? textTight : text}>
        <strong>{actorName}</strong> {copy.verb} <strong>{taskTitle}</strong>.
      </Text>
      {where && <Text style={muted24}>{where}</Text>}
      {excerpt && <Text style={quote}>{excerpt}</Text>}
      <Button href={taskUrl} style={button}>
        {buttonLabel(kind)}
      </Button>
      <Text style={muted}>Or paste this into your browser:</Text>
      <Link href={taskUrl} style={rawLink}>
        {taskUrl}
      </Link>
    </EmailLayout>
  );
}

export function taskNotificationText(props: TaskNotificationEmailProps): string {
  const copy = COPY[props.kind];
  const where = contextLine(props);
  return [
    `${props.actorName} ${copy.verb} ${props.taskTitle}.`,
    ...(where ? [where] : []),
    ...(props.excerpt ? ['', `"${props.excerpt}"`] : []),
    '',
    `${buttonLabel(props.kind)}: ${props.taskUrl}`,
    '',
    footerNote(props.kind, props),
    `Manage email preferences: ${props.preferencesUrl}`,
  ].join('\n');
}

TaskNotificationEmail.PreviewProps = {
  kind: 'approval_requested',
  actorName: 'Ada',
  taskTitle: 'Ship the landing page',
  excerpt: 'Final copy and hero image are in. Happy to go live?',
  workspaceName: 'Northwind Studio',
  projectName: 'Website redesign',
  audience: 'client',
  taskUrl: 'https://tide.example.com/workspaces/acme/projects/p?task=t',
  appUrl: 'https://tide.example.com',
  preferencesUrl: 'https://tide.example.com/settings/notifications',
} satisfies TaskNotificationEmailProps;

export default TaskNotificationEmail;

const quote = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#3f3f46',
  borderLeft: '3px solid #e4e4e7',
  padding: '2px 0 2px 12px',
  margin: '0 0 24px',
};
const textTight = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 4px' };
const muted24 = { fontSize: '13px', lineHeight: '20px', color: '#71717a', margin: '0 0 24px' };
const heading = { fontSize: '22px', fontWeight: 700, color: '#18181b', margin: '0 0 12px' };
const text = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 24px' };
const button = {
  backgroundColor: '#18181b',
  color: '#ffffff',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
};
const muted = { fontSize: '13px', lineHeight: '20px', color: '#71717a', margin: '24px 0 6px' };
const rawLink = { fontSize: '13px', color: '#2563eb', wordBreak: 'break-all' as const };
