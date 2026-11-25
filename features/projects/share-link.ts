// Safe for the browser: no Node APIs here (tokens are made in share-token.ts).

/** Rejects anything that can't be a token we issued, before touching the DB. */
export function isWellFormedShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const sharePath = (token: string) => `/share/${token}`;
