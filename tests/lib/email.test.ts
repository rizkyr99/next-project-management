import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

import * as Sentry from '@sentry/nextjs';
import {
  emailFrom,
  isReservedTestAddress,
  sendDailyDigestEmail,
  sendPasswordResetEmail,
  sendTaskNotificationEmail,
  sendVerificationEmail,
  sendWorkspaceInviteEmail,
} from '@/lib/email';

const invite = {
  inviterName: 'Ada',
  workspaceName: 'Engines',
  role: 'member' as const,
  inviteUrl: 'https://tide.example.com/invite/abc',
};

describe('isReservedTestAddress', () => {
  it.each(['a@example.com', 'a@sub.example.org', 'a@foo.test', 'a@x.invalid', 'a@localhost', 'a@b.localhost'])(
    'treats %s as undeliverable',
    (email) => expect(isReservedTestAddress(email)).toBe(true),
  );
  it.each(['a@gmail.com', 'a@example.co', 'a@notexample.com', 'a@tide.ramarizdev.web.id'])(
    'treats %s as real',
    (email) => expect(isReservedTestAddress(email)).toBe(false),
  );
});

describe('sendWorkspaceInviteEmail', () => {
  it('never contacts Resend for reserved test addresses', async () => {
    send.mockClear();
    expect(await sendWorkspaceInviteEmail({ ...invite, to: 'e2e+1@example.com' })).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends HTML + text from EMAIL_FROM to real addresses', async () => {
    send.mockClear();
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    vi.stubEnv('EMAIL_FROM', 'Tide <notifications@tide.example.org>');
    expect(await sendWorkspaceInviteEmail({ ...invite, to: 'someone@gmail.com' })).toEqual({ sent: true });
    const arg = send.mock.calls[0][0];
    expect(arg.from).toBe('Tide <notifications@tide.example.org>');
    expect(arg.to).toBe('someone@gmail.com');
    expect(arg.html).toContain('https://tide.example.com/invite/abc');
    expect(arg.text).toContain('https://tide.example.com/invite/abc');
    vi.unstubAllEnvs();
  });

  it('reports failure instead of throwing when Resend errors', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'nope' } });
    expect(await sendWorkspaceInviteEmail({ ...invite, to: 'someone@gmail.com' })).toEqual({ sent: false });
  });

  it("falls back to Resend's test sender when EMAIL_FROM is unset", () => {
    vi.stubEnv('EMAIL_FROM', '');
    expect(emailFrom()).toBe('Tide <onboarding@resend.dev>');
    vi.unstubAllEnvs();
  });
});

describe('sendPasswordResetEmail', () => {
  const reset = { name: 'Ada', resetUrl: 'https://tide.example.com/api/auth/reset-password/tok?callbackURL=%2Freset-password' };

  it('never contacts Resend for reserved test addresses', async () => {
    send.mockClear();
    expect(await sendPasswordResetEmail({ ...reset, to: 'e2e@example.com' })).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the reset link in both the HTML and text parts', async () => {
    send.mockClear();
    send.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
    expect(await sendPasswordResetEmail({ ...reset, to: 'someone@gmail.com' })).toEqual({ sent: true });
    const arg = send.mock.calls[0][0];
    expect(arg.subject).toBe('Reset your Tide password');
    // React escapes & in attributes; the link itself is intact.
    expect(arg.html).toContain('https://tide.example.com/api/auth/reset-password/tok?callbackURL=%2Freset-password');
    expect(arg.text).toContain(reset.resetUrl);
    expect(arg.text).toContain('expires in 1 hour');
  });

  it('reports to Sentry instead of throwing when sending fails', async () => {
    send.mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendPasswordResetEmail({ ...reset, to: 'someone@gmail.com' })).toEqual({ sent: false });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: 'email', template: 'password-reset' },
    });
  });
});

describe('sendVerificationEmail', () => {
  const verify = { name: 'Ada', verifyUrl: 'https://tide.example.com/api/auth/verify-email?token=t&callbackURL=%2Femail-verified' };

  it('never contacts Resend for reserved test addresses', async () => {
    send.mockClear();
    expect(await sendVerificationEmail({ ...verify, to: 'e2e@example.com' })).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the link in both parts', async () => {
    send.mockClear();
    send.mockResolvedValue({ data: { id: 'msg_3' }, error: null });
    expect(await sendVerificationEmail({ ...verify, to: 'someone@gmail.com' })).toEqual({ sent: true });
    const arg = send.mock.calls[0][0];
    expect(arg.subject).toBe('Confirm your email for Tide');
    expect(arg.text).toContain(verify.verifyUrl);
    expect(arg.html).toContain('verify-email?token=t');
  });
});

describe('notification emails', () => {
  it('assignment email links the task and the preferences page, with escaped user text', async () => {
    send.mockClear();
    send.mockResolvedValue({ data: { id: 'm' }, error: null });
    await sendTaskNotificationEmail('someone@gmail.com', {
      kind: 'assigned',
      actorName: 'Ada <script>',
      taskTitle: 'Ship it',
      taskUrl: 'https://tide.example.com/workspaces/a/projects/p?task=t',
    });
    const arg = send.mock.calls[0][0];
    expect(arg.subject).toBe('Ada <script> assigned you to Ship it');
    expect(arg.html).not.toContain('<script>');
    expect(arg.html).toContain('/settings/notifications');
    expect(arg.text).toContain('Manage email preferences:');
  });

  it('digest lists items and summarises the rest', async () => {
    send.mockClear();
    send.mockResolvedValue({ data: { id: 'm' }, error: null });
    await sendDailyDigestEmail('someone@gmail.com', {
      name: 'Ada',
      total: 12,
      items: [{ text: 'Grace assigned you to X', url: 'https://tide.example.com/x' }],
    });
    const arg = send.mock.calls[0][0];
    expect(arg.subject).toBe('Your Tide summary: 12 unread notifications');
    expect(arg.text).toContain('…and 11 more.');
    expect(arg.html).toContain('/notifications');
  });

  it('never emails reserved test addresses', async () => {
    send.mockClear();
    expect(
      await sendDailyDigestEmail('e2e@example.com', { name: 'A', total: 1, items: [] }),
    ).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });
});
