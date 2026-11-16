import { describe, expect, it } from 'vitest';
import {
  INVITE_TTL_MS,
  evaluateInvite,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  isWellFormedInviteToken,
  maskEmail,
} from '@/lib/invite-token';
import { safeCallbackPath } from '@/lib/safe-redirect';

describe('invite tokens', () => {
  it('generates a 43-char base64url token and stores only its sha256 hash', () => {
    const { token, hash } = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInviteToken(token)).toBe(hash);
  });

  it('never repeats tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken().token));
    expect(tokens.size).toBe(200);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isWellFormedInviteToken(generateInviteToken().token)).toBe(true);
    expect(isWellFormedInviteToken('')).toBe(false);
    expect(isWellFormedInviteToken('short')).toBe(false);
    expect(isWellFormedInviteToken('a'.repeat(42) + '!')).toBe(false);
    expect(isWellFormedInviteToken("' or 1=1 --" + 'a'.repeat(32))).toBe(false);
  });

  it('expires invites after 7 days', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(inviteExpiry(now).getTime() - now.getTime()).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('evaluateInvite', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const pending = {
    status: 'pending' as const,
    email: 'jane@acme.com',
    expiresAt: new Date('2026-06-05T00:00:00Z'),
  };

  it('is valid for the invited email, case-insensitively', () => {
    expect(evaluateInvite(pending, 'jane@acme.com', now)).toEqual({ kind: 'valid' });
    expect(evaluateInvite(pending, 'Jane@ACME.com', now)).toEqual({ kind: 'valid' });
  });

  it('is valid while logged out, so the page can offer sign-in', () => {
    expect(evaluateInvite(pending, null, now)).toEqual({ kind: 'valid' });
  });

  it('rejects a different signed-in account', () => {
    expect(evaluateInvite(pending, 'mallory@evil.com', now)).toEqual({
      kind: 'wrong_account',
      inviteEmail: 'jane@acme.com',
    });
  });

  it('treats a past expiresAt as expired even while status is still pending', () => {
    expect(
      evaluateInvite({ ...pending, expiresAt: new Date('2026-06-01T11:59:59Z') }, 'jane@acme.com', now),
    ).toEqual({ kind: 'expired' });
  });

  it.each(['accepted', 'revoked', 'declined', 'expired'] as const)(
    'reports %s regardless of who is viewing',
    (status) => {
      expect(evaluateInvite({ ...pending, status }, 'mallory@evil.com', now)).toEqual({ kind: status });
    },
  );
});

describe('maskEmail', () => {
  it('keeps the domain and the first two characters', () => {
    expect(maskEmail('jane.doe@acme.com')).toBe('ja…@acme.com');
    expect(maskEmail('j@acme.com')).toBe('j…@acme.com');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});

describe('safeCallbackPath', () => {
  it('uses the first value of a repeated param', () => {
    expect(safeCallbackPath(['/invite/abc', '/invites'])).toBe('/invite/abc');
    expect(safeCallbackPath(['//evil.com', '/invites'])).toBe('/');
    expect(safeCallbackPath([])).toBe('/');
  });

  it('allows same-origin relative paths', () => {
    expect(safeCallbackPath('/invite/abc')).toBe('/invite/abc');
    expect(safeCallbackPath('/invites?x=1')).toBe('/invites?x=1');
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/%09/evil.com'.replace('%09', '\t'),
    'javascript:alert(1)',
    'evil.com',
    '',
    null,
    undefined,
  ])(
    'falls back for %s',
    (value) => {
      expect(safeCallbackPath(value)).toBe('/');
    },
  );
});
