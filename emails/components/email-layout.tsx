import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

/**
 * Shared frame for every transactional email: wordmark, content card, footer.
 * Inline styles only, because many email clients strip <style> blocks.
 */
export function EmailLayout({
  preview,
  appUrl,
  children,
  footerNote,
  preferencesUrl,
}: {
  /** Inbox preview text (the grey line after the subject). */
  preview: string;
  appUrl: string;
  children: ReactNode;
  /** Why the recipient got this email. */
  footerNote: string;
  /** Notification emails link to the page where they can be turned off. */
  preferencesUrl?: string;
}) {
  return (
    <Html lang='en'>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={wordmark}>tide</Text>
          <Section style={card}>{children}</Section>
          <Hr style={hr} />
          <Text style={footer}>{footerNote}</Text>
          {preferencesUrl && (
            <Text style={footer}>
              <Link href={preferencesUrl} style={footerLink}>
                Manage email preferences
              </Link>
            </Text>
          )}
          <Text style={footer}>
            Sent by <Link href={appUrl} style={footerLink}>Tide</Link>, project management for small
            teams.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: '#f4f4f5',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '32px 0',
};
const container = { maxWidth: '480px', margin: '0 auto', padding: '0 16px' };
const wordmark = {
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-1px',
  color: '#18181b',
  margin: '0 0 16px',
};
const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e4e7',
  borderRadius: '12px',
  padding: '32px 28px',
};
const hr = { borderColor: '#e4e4e7', margin: '28px 0 16px' };
const footer = { color: '#71717a', fontSize: '12px', lineHeight: '18px', margin: '0 0 6px' };
const footerLink = { color: '#71717a', textDecoration: 'underline' };
