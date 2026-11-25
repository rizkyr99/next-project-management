import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface WorkspaceInviteEmailProps {
  inviterName: string;
  workspaceName: string;
  role: 'admin' | 'member' | 'guest';
  /** Guest invites: the projects being shared. */
  projectNames?: string[];
  inviteUrl: string;
  appUrl: string;
}

/** "Website" / "Website and Logo" / "Website, Logo and 2 more". */
export function listProjects(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'a project';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

function invitation({ inviterName, workspaceName, role, projectNames = [] }: WorkspaceInviteEmailProps) {
  if (role === 'guest') {
    return {
      lead: `${inviterName} from ${workspaceName} shared ${listProjects(projectNames)} with you on Tide.`,
      detail: 'You can follow progress and comment there. You won’t see anything else in their workspace.',
    };
  }
  const roleLabel = role === 'admin' ? 'an admin' : 'a member';
  return { lead: `${inviterName} invited you to join ${workspaceName} on Tide as ${roleLabel}.`, detail: null };
}

/**
 * Sent when someone is invited to a workspace. All props are user-controlled
 * text: React escapes them, so names can't inject markup.
 */
export function WorkspaceInviteEmail(props: WorkspaceInviteEmailProps) {
  const { workspaceName, role, inviteUrl, appUrl } = props;
  const { lead, detail } = invitation(props);
  return (
    <EmailLayout
      preview={lead}
      appUrl={appUrl}
      footerNote="You received this because someone invited this address to a Tide workspace. If you didn't expect it, you can ignore this email; nothing happens unless you accept.">
      <Heading as='h1' style={heading}>
        {role === 'guest' ? `${workspaceName} shared work with you` : `Join ${workspaceName}`}
      </Heading>
      <Text style={text}>{lead}</Text>
      {detail && <Text style={text}>{detail}</Text>}
      <Button href={inviteUrl} style={button}>
        Accept invite
      </Button>
      <Text style={muted}>
        This link expires in 7 days and only works for this email address. If the button doesn&apos;t
        work, paste this into your browser:
      </Text>
      <Link href={inviteUrl} style={rawLink}>
        {inviteUrl}
      </Link>
    </EmailLayout>
  );
}

/** Plain-text part, for clients that don't render HTML (and better spam scores). */
export function workspaceInviteText(props: WorkspaceInviteEmailProps): string {
  const { lead, detail } = invitation(props);
  return [
    lead,
    ...(detail ? ['', detail] : []),
    '',
    `Accept the invite: ${props.inviteUrl}`,
    '',
    "This link expires in 7 days and only works for this email address. If you didn't expect this, you can ignore it.",
  ].join('\n');
}

// Lets `npx react-email dev` preview the template with sample data.
WorkspaceInviteEmail.PreviewProps = {
  inviterName: 'Ada Lovelace',
  workspaceName: 'Analytical Engines',
  role: 'member',
  inviteUrl: 'https://tide.example.com/invite/sample-token',
  appUrl: 'https://tide.example.com',
} satisfies WorkspaceInviteEmailProps;

export default WorkspaceInviteEmail;

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
