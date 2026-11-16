import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import { siteUrl } from '@/lib/site';
import { WorkspaceInviteEmail, workspaceInviteText } from '@/emails/workspace-invite';

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
