import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  appUrl: string;
}

/** Sent when someone asks to reset the password for this address. */
export function PasswordResetEmail({ name, resetUrl, appUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview='Reset your Tide password'
      appUrl={appUrl}
      footerNote="You received this because someone asked to reset the password for this address on Tide. If it wasn't you, ignore this email; your password stays the same.">
      <Heading as='h1' style={heading}>
        Reset your password
      </Heading>
      <Text style={text}>
        Hi {name}, use the button below to choose a new password. Changing it signs you out on every
        device.
      </Text>
      <Button href={resetUrl} style={button}>
        Choose a new password
      </Button>
      <Text style={muted}>
        This link expires in 1 hour and works once. If the button doesn&apos;t work, paste this into
        your browser:
      </Text>
      <Link href={resetUrl} style={rawLink}>
        {resetUrl}
      </Link>
    </EmailLayout>
  );
}

export function passwordResetText({ name, resetUrl }: PasswordResetEmailProps): string {
  return [
    `Hi ${name},`,
    '',
    `Choose a new Tide password: ${resetUrl}`,
    '',
    "This link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays the same.",
  ].join('\n');
}

PasswordResetEmail.PreviewProps = {
  name: 'Ada',
  resetUrl: 'https://tide.example.com/api/auth/reset-password/sample-token?callbackURL=%2Freset-password',
  appUrl: 'https://tide.example.com',
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;

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
