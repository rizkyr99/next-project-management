import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { siteUrl } from '@/lib/site';

const resend = new Resend(process.env.RESEND_API_KEY);

// TODO(P1.2): move to EMAIL_FROM once a sending domain is verified in Resend.
// The resend.dev sandbox sender only delivers to the Resend account owner.
const FROM = 'Tide <onboarding@resend.dev>';

export const APP_URL = siteUrl();

/** Names and workspace titles are user input: never interpolate them raw into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const inviter = escapeHtml(inviterName);
  const ws = escapeHtml(workspaceName);
  const roleLabel = role === 'admin' ? 'an admin' : 'a member';

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      // Subjects are plain text, so they don't need HTML escaping.
      subject: `${inviterName} invited you to ${workspaceName} on Tide`,
      text: `${inviterName} invited you to join ${workspaceName} on Tide as ${roleLabel}.\n\nAccept the invite: ${inviteUrl}\n\nThis link expires in 7 days. If you didn't expect this, you can ignore this email.`,
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px">You're invited to ${ws}</h2>
        <p style="color:#555;margin:0 0 24px">
          <strong>${inviter}</strong> invited you to join <strong>${ws}</strong> on Tide as ${roleLabel}.
        </p>
        <a href="${escapeHtml(inviteUrl)}"
           style="display:inline-block;padding:12px 24px;background:#000;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">
          Accept invite
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">
          This link expires in 7 days. If you didn't expect this, you can ignore this email.
        </p>
      </div>
    `,
    });
    if (error) throw new Error(`Resend: ${error.name ?? ''} ${error.message}`);
    return { sent: true };
  } catch (err) {
    console.error('[email] invite send failed:', err);
    Sentry.captureException(err, { tags: { area: 'email', template: 'workspace-invite' } });
    return { sent: false };
  }
}
