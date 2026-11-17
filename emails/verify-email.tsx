import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

export interface VerifyEmailProps {
  name: string;
  verifyUrl: string;
  appUrl: string;
}

/** Sent on sign-up (and on "Resend") to confirm the address belongs to the user. */
export function VerifyEmail({ name, verifyUrl, appUrl }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview='Confirm your email for Tide'
      appUrl={appUrl}
      footerNote="You received this because this address was used to sign up for Tide. If that wasn't you, ignore this email and the account stays unverified.">
      <Heading as='h1' style={heading}>
        Confirm your email
      </Heading>
      <Text style={text}>
        Hi {name}, confirm this address so teammates can invite you and Tide can email you about your
        work.
      </Text>
      <Button href={verifyUrl} style={button}>
        Verify email
      </Button>
      <Text style={muted}>
        This link expires in 24 hours. If the button doesn&apos;t work, paste this into your browser:
      </Text>
      <Link href={verifyUrl} style={rawLink}>
        {verifyUrl}
      </Link>
    </EmailLayout>
  );
}

export function verifyEmailText({ name, verifyUrl }: VerifyEmailProps): string {
  return [
    `Hi ${name},`,
    '',
    `Confirm your email for Tide: ${verifyUrl}`,
    '',
    "This link expires in 24 hours. If you didn't sign up for Tide, ignore this email.",
  ].join('\n');
}

VerifyEmail.PreviewProps = {
  name: 'Ada',
  verifyUrl: 'https://tide.example.com/api/auth/verify-email?token=sample&callbackURL=%2Femail-verified',
  appUrl: 'https://tide.example.com',
} satisfies VerifyEmailProps;

export default VerifyEmail;

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
