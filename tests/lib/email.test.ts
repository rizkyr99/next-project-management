import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

import { emailFrom, isReservedTestAddress, sendWorkspaceInviteEmail } from '@/lib/email';

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
