import 'server-only';
import { randomBytes } from 'node:crypto';

/** Share-link tokens: 32 random bytes, base64url (43 chars), like invites. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}
