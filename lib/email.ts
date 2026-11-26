import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import { siteUrl } from '@/lib/site';
import { WorkspaceInviteEmail, workspaceInviteSubject, workspaceInviteText } from '@/emails/workspace-invite';
import { PasswordResetEmail, passwordResetText } from '@/emails/password-reset';
import { VerifyEmail, verifyEmailText } from '@/emails/verify-email';
import {
  TaskNotificationEmail,
  taskNotificationSubject,
  taskNotificationText,
  type TaskNotificationEmailProps,
} from '@/emails/task-notification';
import { DailyDigestEmail, dailyDigestText, type DailyDigestEmailProps } from '@/emails/daily-digest';
import {
  TrialNoticeEmail,
  trialNoticeSubject,
  trialNoticeText,
  type TrialNoticeEmailProps,
} from '@/emails/trial-notice';
import type { ReactElement } from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's shared test sender only delivers to the Resend account owner. It's
// fine for local development, while production must set EMAIL_FROM to an
// address on a verified domain (enforced by lib/env.ts).
const SANDBOX_FROM = 'Tide <onboarding@resend.dev>';

const MAX_SENDER_NAME = 60;

/**
 * The From header. With `senderName` (a workspace's name) the display name
 * becomes "Acme Studio via Tide", so a client sees who the email is really
 * from, while the address stays our verified one. The name is user-chosen
 * text going into a header, so quotes, backslashes and control characters
 * (CR/LF would start a new header) are removed and it's quoted.
 */
export function emailFrom(senderName?: string): string {
  const from = process.env.EMAIL_FROM?.trim() || SANDBOX_FROM;
  const name = senderName
    ?.replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SENDER_NAME)
    .trim();
  if (!name) return from;
  const address = from.match(/<([^>]+)>\s*$/)?.[1] ?? from;
  return `"${name} via Tide" <${address}>`;
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
  projectNames,
  inviteUrl,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: 'admin' | 'member' | 'guest';
  projectNames?: string[];
  inviteUrl: string;
}): Promise<{ sent: boolean }> {
  const props = { inviterName, workspaceName, role, projectNames, inviteUrl, appUrl: APP_URL };

  if (isReservedTestAddress(to)) {
    console.info('[email] skipped invite to reserved test address');
    return { sent: false };
  }

  try {
    const html = await render(WorkspaceInviteEmail(props));
    const { error } = await resend.emails.send({
      from: emailFrom(workspaceName),
      to,
      // Subjects are plain text, so no escaping is needed.
      subject: workspaceInviteSubject(props),
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

/** Where every notification email's "Manage email preferences" link points. */
export const PREFERENCES_URL = `${APP_URL}/settings/notifications`;

/**
 * Shared send path for notification emails: skips reserved test addresses,
 * never throws, and reports failures to Sentry under `template`.
 */
async function deliver({
  to,
  subject,
  element,
  text,
  template,
  senderName,
}: {
  to: string;
  subject: string;
  element: ReactElement;
  text: string;
  template: string;
  /** The workspace the email is about, shown as "<name> via Tide". */
  senderName?: string;
}): Promise<{ sent: boolean }> {
  if (isReservedTestAddress(to)) {
    console.info(`[email] skipped ${template} to reserved test address`);
    return { sent: false };
  }
  try {
    const html = await render(element);
    const { error } = await resend.emails.send({ from: emailFrom(senderName), to, subject, html, text });
    if (error) throw new Error(`Resend: ${error.name ?? ''} ${error.message}`);
    return { sent: true };
  } catch (err) {
    console.error(`[email] ${template} send failed:`, err);
    Sentry.captureException(err, { tags: { area: 'email', template } });
    return { sent: false };
  }
}

export function sendTaskNotificationEmail(
  to: string,
  props: Omit<TaskNotificationEmailProps, 'appUrl' | 'preferencesUrl'>,
) {
  const full = { ...props, appUrl: APP_URL, preferencesUrl: PREFERENCES_URL };
  const subject = taskNotificationSubject(props);
  return deliver({
    to,
    subject,
    element: TaskNotificationEmail(full),
    text: taskNotificationText(full),
    template: `task-${props.kind}`,
    senderName: props.workspaceName,
  });
}

/** E2: "your Pro trial ends soon" / "has ended", to the workspace owner. Never throws. */
export function sendTrialNoticeEmail(to: string, props: Omit<TrialNoticeEmailProps, 'appUrl'>) {
  const full = { ...props, appUrl: APP_URL };
  return deliver({
    to,
    subject: trialNoticeSubject(full),
    element: TrialNoticeEmail(full),
    text: trialNoticeText(full),
    template: `trial-${props.kind}`,
    senderName: props.workspaceName,
  });
}

export function sendDailyDigestEmail(
  to: string,
  props: Omit<DailyDigestEmailProps, 'appUrl' | 'preferencesUrl' | 'notificationsUrl'>,
) {
  const full = {
    ...props,
    appUrl: APP_URL,
    preferencesUrl: PREFERENCES_URL,
    notificationsUrl: `${APP_URL}/notifications`,
  };
  return deliver({
    to,
    subject: `Your Tide summary: ${props.total} unread notification${props.total === 1 ? '' : 's'}`,
    element: DailyDigestEmail(full),
    text: dailyDigestText(full),
    template: 'daily-digest',
  });
}
