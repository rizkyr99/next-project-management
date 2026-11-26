import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import { WorkspaceInviteEmail, workspaceInviteSubject, workspaceInviteText } from '@/emails/workspace-invite';

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

  it('puts the studio, not Tide, at the top', async () => {
    const html = await render(WorkspaceInviteEmail(props));
    expect(html).toContain('via Tide');
  });

  it('speaks to a client about the studio and the shared work', async () => {
    const guest = { ...props, role: 'guest' as const, projectNames: ['Website', 'Logo'] };
    expect(workspaceInviteSubject(guest)).toBe('Analytical Engines shared Website and Logo with you');
    const html = await render(WorkspaceInviteEmail(guest));
    expect(html).toContain('Ada Lovelace at Analytical Engines shared their work with this address');
    expect(html).not.toContain('Tide workspace');
  });

  it('keeps the member subject', () => {
    expect(workspaceInviteSubject(props)).toBe('Ada Lovelace invited you to Analytical Engines on Tide');
  });
});
