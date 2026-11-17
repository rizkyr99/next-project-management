import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface DigestItem {
  text: string;
  url: string;
}

export interface DailyDigestEmailProps {
  name: string;
  items: DigestItem[];
  /** Unread notifications in the period, including any not listed. */
  total: number;
  notificationsUrl: string;
  appUrl: string;
  preferencesUrl: string;
}

/** Opt-in daily summary of unread notifications (P3.4). */
export function DailyDigestEmail({ name, items, total, notificationsUrl, appUrl, preferencesUrl }: DailyDigestEmailProps) {
  const more = total - items.length;
  return (
    <EmailLayout
      preview={`${total} unread notification${total === 1 ? '' : 's'} on Tide`}
      appUrl={appUrl}
      preferencesUrl={preferencesUrl}
      footerNote='You received this because you turned on the daily digest in your Tide email preferences.'>
      <Heading as='h1' style={heading}>
        Your daily summary
      </Heading>
      <Text style={text}>
        Hi {name}, you have {total} unread notification{total === 1 ? '' : 's'} since your last
        summary.
      </Text>
      <Section style={{ margin: '0 0 24px' }}>
        {items.map((item, i) => (
          <Text key={i} style={row}>
            <Link href={item.url} style={rowLink}>
              {item.text}
            </Link>
          </Text>
        ))}
        {more > 0 && <Text style={muted}>…and {more} more.</Text>}
      </Section>
      <Button href={notificationsUrl} style={button}>
        View all notifications
      </Button>
    </EmailLayout>
  );
}

export function dailyDigestText(props: DailyDigestEmailProps): string {
  const more = props.total - props.items.length;
  return [
    `Hi ${props.name}, you have ${props.total} unread notification${props.total === 1 ? '' : 's'} on Tide:`,
    '',
    ...props.items.map((i) => `- ${i.text}: ${i.url}`),
    ...(more > 0 ? [`…and ${more} more.`] : []),
    '',
    `View all: ${props.notificationsUrl}`,
    `Manage email preferences: ${props.preferencesUrl}`,
  ].join('\n');
}

DailyDigestEmail.PreviewProps = {
  name: 'Ada',
  items: [
    { text: 'Grace assigned you to Ship the landing page', url: 'https://tide.example.com/x' },
    { text: 'Fix the login bug is due on Nov 18', url: 'https://tide.example.com/y' },
  ],
  total: 3,
  notificationsUrl: 'https://tide.example.com/notifications',
  appUrl: 'https://tide.example.com',
  preferencesUrl: 'https://tide.example.com/settings/notifications',
} satisfies DailyDigestEmailProps;

export default DailyDigestEmail;

const row = { fontSize: '14px', lineHeight: '20px', margin: '0 0 10px' };
const rowLink = { color: '#18181b', textDecoration: 'none' };
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
