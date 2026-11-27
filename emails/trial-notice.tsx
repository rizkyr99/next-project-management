import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface TrialNoticeEmailProps {
  /** `ending`: a few days before the trial ends; `ended`: once it has. */
  kind: 'ending' | 'ended';
  ownerName: string;
  workspaceName: string;
  /** "December 10" */
  endsOn: string;
  /** "$18 a month (3 team members × $6)" */
  priceLine: string;
  billingUrl: string;
  appUrl: string;
}

function copy({ kind, workspaceName, endsOn }: TrialNoticeEmailProps) {
  return kind === 'ending'
    ? {
        subject: `Your Tide Pro trial for ${workspaceName} ends on ${endsOn}`,
        heading: 'Your Pro trial ends soon',
        lead: `${workspaceName}'s Pro trial ends on ${endsOn}. Upgrade to keep inviting clients, asking for approvals, sharing links and saving your own templates.`,
        after:
          'If you don’t upgrade, the workspace moves to Free. Nothing is deleted: clients you’ve invited keep their access and existing share links keep working; you just can’t add new ones.',
      }
    : {
        subject: `Your Tide Pro trial for ${workspaceName} has ended`,
        heading: 'Your Pro trial has ended',
        lead: `${workspaceName} is now on the Free plan. Everything you made is still there, and clients you invited can still see their projects.`,
        after: 'Upgrade to Pro any time to invite more clients, ask for approvals, share links and save templates again.',
      };
}

export function trialNoticeSubject(props: TrialNoticeEmailProps) {
  return copy(props).subject;
}

/** E2: the trial-ending and trial-ended emails to a workspace's owner. All props are escaped by React. */
export function TrialNoticeEmail(props: TrialNoticeEmailProps) {
  const c = copy(props);
  return (
    <EmailLayout
      preview={c.lead}
      appUrl={props.appUrl}
      brand={props.workspaceName}
      footerNote='You received this because you own this workspace on Tide.'>
      <Heading as='h1' style={heading}>
        {c.heading}
      </Heading>
      <Text style={text}>Hi {props.ownerName},</Text>
      <Text style={text}>{c.lead}</Text>
      <Text style={text}>Pro is {props.priceLine}. Your clients are always free.</Text>
      <Button href={props.billingUrl} style={button}>
        Upgrade to Pro
      </Button>
      <Text style={muted}>{c.after}</Text>
      <Link href={props.billingUrl} style={rawLink}>
        {props.billingUrl}
      </Link>
    </EmailLayout>
  );
}

export function trialNoticeText(props: TrialNoticeEmailProps): string {
  const c = copy(props);
  return [
    `Hi ${props.ownerName},`,
    '',
    c.lead,
    '',
    `Pro is ${props.priceLine}. Your clients are always free.`,
    '',
    `Upgrade: ${props.billingUrl}`,
    '',
    c.after,
  ].join('\n');
}

TrialNoticeEmail.PreviewProps = {
  kind: 'ending',
  ownerName: 'Ada',
  workspaceName: 'Northwind Studio',
  endsOn: 'December 10',
  priceLine: '$18 a month (3 team members × $6)',
  billingUrl: 'https://tide.example.com/workspaces/northwind/settings?tab=billing',
  appUrl: 'https://tide.example.com',
} satisfies TrialNoticeEmailProps;

export default TrialNoticeEmail;

const heading = { fontSize: '22px', fontWeight: 700, color: '#18181b', margin: '0 0 12px' };
const text = { fontSize: '15px', lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' };
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
