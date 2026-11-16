import { createHash, randomBytes } from 'node:crypto';

/** How long an invite link stays valid. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invite tokens are 32 random bytes, base64url-encoded (43 chars). Only the
 * SHA-256 hash is stored (`workspace_invite.token`), so a database leak does
 * not leak usable invite links. A fast hash is fine here: the token has 256
 * bits of entropy, so there is nothing to brute-force.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

/** Rejects anything that can't be a token we issued, before touching the DB. */
export function isWellFormedInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired' | 'declined';

export type InviteState =
  | { kind: 'valid' }
  | { kind: 'wrong_account'; inviteEmail: string }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'accepted' }
  | { kind: 'declined' };

/**
 * Decides what a viewer can do with an invite. `sessionEmail` is null when
 * logged out: a valid invite is still 'valid' so the page can offer sign-in.
 */
export function evaluateInvite(
  invite: { status: InviteStatus; email: string; expiresAt: Date },
  sessionEmail: string | null,
  now = new Date(),
): InviteState {
  if (invite.status === 'accepted') return { kind: 'accepted' };
  if (invite.status === 'revoked') return { kind: 'revoked' };
  if (invite.status === 'declined') return { kind: 'declined' };
  if (invite.status === 'expired' || invite.expiresAt.getTime() <= now.getTime()) {
    return { kind: 'expired' };
  }
  if (sessionEmail !== null && sessionEmail.toLowerCase() !== invite.email.toLowerCase()) {
    return { kind: 'wrong_account', inviteEmail: invite.email };
  }
  return { kind: 'valid' };
}

/** "jane.doe@acme.com" -> "ja…@acme.com", for showing on a page anyone with the link can open. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}…@${domain}`;
}

