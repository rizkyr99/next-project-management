import { randomBytes } from 'node:crypto';

/** Share-link tokens: 32 random bytes, base64url (43 chars), like invites. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Rejects anything that can't be a token we issued, before touching the DB. */
export function isWellFormedShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const sharePath = (token: string) => `/share/${token}`;
