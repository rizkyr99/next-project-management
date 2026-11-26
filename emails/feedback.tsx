import { Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface FeedbackEmailProps {
  fromName: string;
  fromEmail: string;
  workspaceName: string | null;
  /** Full URL of the page they were on, if any. */
  pageUrl: string | null;
  message: string;
  appUrl: string;
}

export function feedbackSubject({ fromName, message }: Pick<FeedbackEmailProps, 'fromName' | 'message'>) {
  const first = message.trim().split('\n')[0];
  return `Feedback from ${fromName}: ${first.length > 60 ? `${first.slice(0, 59)}…` : first}`;
}

/** E5: in-app feedback, to the team behind Tide. Reply goes to the sender. All props are escaped by React. */
export function FeedbackEmail(props: FeedbackEmailProps) {
  return (
    <EmailLayout
      preview={props.message.slice(0, 120)}
      appUrl={props.appUrl}
      footerNote='Sent from the feedback button in Tide. Replying goes to the person who sent it.'>
      <Heading as='h1' style={heading}>
        Feedback from {props.fromName}
      </Heading>
      <Text style={meta}>
        {props.fromEmail}
        {props.workspaceName ? `, in ${props.workspaceName}` : ''}
      </Text>
      <Text style={quote}>{props.message}</Text>
      {props.pageUrl && (
        <Text style={meta}>
          On <Link href={props.pageUrl}>{props.pageUrl}</Link>
        </Text>
      )}
    </EmailLayout>
  );
}

export function feedbackText(props: FeedbackEmailProps): string {
  return [
    `Feedback from ${props.fromName} <${props.fromEmail}>${props.workspaceName ? `, in ${props.workspaceName}` : ''}`,
    '',
    props.message,
    '',
    ...(props.pageUrl ? [`On ${props.pageUrl}`] : []),
  ].join('\n');
}

export default FeedbackEmail;

const heading = { fontSize: '20px', fontWeight: 700, color: '#18181b', margin: '0 0 4px' };
const meta = { fontSize: '13px', lineHeight: '20px', color: '#71717a', margin: '0 0 16px' };
const quote = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#3f3f46',
  whiteSpace: 'pre-wrap' as const,
  borderLeft: '3px solid #e4e4e7',
  padding: '2px 0 2px 12px',
  margin: '0 0 16px',
};
