import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import { siteUrl } from '@/lib/site';
import { WorkspaceInviteEmail, workspaceInviteText } from '@/emails/workspace-invite';
import { PasswordResetEmail, passwordResetText } from '@/emails/password-reset';
import { VerifyEmail, verifyEmailText } from '@/emails/verify-email';

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's shared test sender only delivers to the Resend account owner. It's
// fine for local development, while production must set EMAIL_FROM to an
// address on a verified domain (enforced by lib/env.ts).
const SANDBOX_FROM = 'Tide <onboarding@resend.dev>';

export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || SANDBOX_FROM;
}

export const APP_URL = siteUrl();

/**
 * RFC 2606 / RFC 6761 reserved names can never receive mail. Sending to them
 * (e.g. from E2E runs) only produces bounces that damage the sending
 * domain's reputation, so they're skipped outright.
 */
export function isReservedTestAddress(email: string): boolean {
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return (
    /(^|\.)example\.(com|net|org)$/.test(domain) ||
    /\.(test|example|invalid|localhost)$/.test(domain) ||
    domain === 'localhost'
  );
}

/**
 * Sends a workspace invite. It never throws: an email failure must not undo
 * an invite that was already saved, so callers get `{ sent: false }` and can
 * show the invite link instead.
 */
export async function sendWorkspaceInviteEmail({
  to,
  inviterName,
  workspaceName,
  role,
  inviteUrl,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: 'admin' | 'member';
  inviteUrl: string;
}): Promise<{ sent: boolean }> {
  const props = { inviterName, workspaceName, role, inviteUrl, appUrl: APP_URL };

  if (isReservedTestAddress(to)) {
    console.info('[email] skipped invite to reserved test address');
    return { sent: false };
  }

  try {
    const html = await render(WorkspaceInviteEmail(props));
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to,
      // Subjects are plain text, so no escaping is needed.
      subject: `${inviterName} invited you to ${workspaceName} on Tide`,
      html,
      text: workspaceInviteText(props),
    });
    if (error) throw new Error(`Resend: ${error.name ?? ''} ${error.message}`);
    return { sent: true };
  } catch (err) {
    console.error('[email] invite send failed:', err);
    Sentry.captureException(err, { tags: { area: 'email', template: 'workspace-invite' } });
    return { sent: false };
  }
}

/**
 * Sends a password reset link. Never throws (the request endpoint answers
 * the same way whether or not the address exists), but failures go to
 * Sentry so a broken mail setup doesn't go unnoticed.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<{ sent: boolean }> {
  if (isReservedTestAddress(to)) {
    console.info('[email] skipped password reset to reserved test address');
    return { sent: false };
  }
  const props = { name, resetUrl, appUrl: APP_URL };
  try {
    const html = await render(PasswordResetEmail(props));
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to,
      subject: 'Reset your Tide password',
      html,
      text: passwordResetText(props),
    });
    if (error) throw new Error(`Resend: ${error.name ?? ''} ${error.message}`);
    return { sent: true };
  } catch (err) {
    console.error('[email] password reset send failed:', err);
    Sentry.captureException(err, { tags: { area: 'email', template: 'password-reset' } });
    return { sent: false };
  }
}

/** Sends the email-verification link. Never throws; failures go to Sentry. */
export async function sendVerificationEmail({
  to,
  name,
  verifyUrl,
}: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<{ sent: boolean }> {
  if (isReservedTestAddress(to)) {
    console.info('[email] skipped verification to reserved test address');
    return { sent: false };
  }
  const props = { name, verifyUrl, appUrl: APP_URL };
  try {
    const html = await render(VerifyEmail(props));
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to,
      subject: 'Confirm your email for Tide',
      html,
      text: verifyEmailText(props),
    });
    if (error) throw new Error(`Resend: ${error.name ?? ''} ${error.message}`);
    return { sent: true };
  } catch (err) {
    console.error('[email] verification send failed:', err);
    Sentry.captureException(err, { tags: { area: 'email', template: 'verify-email' } });
    return { sent: false };
  }
}
