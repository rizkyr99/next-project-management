import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import { WorkspaceInviteEmail, workspaceInviteText } from '@/emails/workspace-invite';

const props = {
  inviterName: 'Ada Lovelace',
  workspaceName: 'Analytical Engines',
  role: 'admin' as const,
  inviteUrl: 'https://tide.example.com/invite/abc123',
  appUrl: 'https://tide.example.com',
};

describe('WorkspaceInviteEmail', () => {
  it('renders the inviter, workspace, role and a working link', async () => {
    const html = await render(WorkspaceInviteEmail(props));
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Analytical Engines');
    expect(html).toContain('an admin');
    expect(html).toContain('href="https://tide.example.com/invite/abc123"');
    expect(html).toContain('Accept invite');
  });

  it('escapes user-controlled names so they cannot inject markup', async () => {
    const html = await render(
      WorkspaceInviteEmail({
        ...props,
        inviterName: '<img src=x onerror=alert(1)>',
        workspaceName: '<a href="https://phish.example">Click</a>',
      }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<a href="https://phish.example">');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('has a plain-text part with the link', () => {
    const text = workspaceInviteText(props);
    expect(text).toContain('Ada Lovelace invited you to join Analytical Engines on Tide as an admin.');
    expect(text).toContain('https://tide.example.com/invite/abc123');
  });
});
