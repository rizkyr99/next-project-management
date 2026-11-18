import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { tagSentryUser } from '@/lib/sentry-user';

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  tagSentryUser(session?.user);
  return session;
});
