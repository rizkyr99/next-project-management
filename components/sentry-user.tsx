'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/** Tags browser errors and replays with the signed-in user's ID (never their email). */
export function SentryUser({ id }: { id: string }) {
  useEffect(() => {
    Sentry.setUser({ id });
    return () => Sentry.setUser(null);
  }, [id]);
  return null;
}
