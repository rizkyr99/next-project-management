import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Workspace App <onboarding@resend.dev>';
const APP_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export async function sendWorkspaceInviteEmail({
  to,
  inviterName,
  workspaceName,
  workspaceSlug,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  workspaceSlug: string;
}) {
  const workspaceUrl = `${APP_URL}/workspaces/${workspaceSlug}`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${inviterName} added you to ${workspaceName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px">You've been added to a workspace</h2>
        <p style="color:#555;margin:0 0 24px">
          <strong>${inviterName}</strong> added you to <strong>${workspaceName}</strong>.
        </p>
        <a href="${workspaceUrl}"
           style="display:inline-block;padding:12px 24px;background:#000;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">
          Open workspace
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">
          If you didn't expect this, you can ignore this email.
        </p>
      </div>
    `,
  });
}
