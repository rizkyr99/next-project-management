import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/db/drizzle';
import { userPreferences } from '@/db/schema';
import { ResendVerificationButton } from '@/features/account/components/verify-email-banner';
import { EmailPreferencesForm } from '@/features/notifications/components/email-preferences-form';
import { getSession } from '@/lib/auth-session';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Email notifications' };

/** Linked from the footer of every notification email. */
export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackURL=%2Fsettings%2Fnotifications');

  const [row] = await db
    .select({
      emailOnAssign: userPreferences.emailOnAssign,
      emailOnMention: userPreferences.emailOnMention,
      emailDigest: userPreferences.emailDigest,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);
  const prefs = row ?? { emailOnAssign: true, emailOnMention: true, emailDigest: false };
  const verified = session.user.emailVerified;

  return (
    <div className='max-w-2xl mx-auto py-8 px-4 space-y-6'>
      <div>
        <Link
          href='/'
          className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4'>
          <ArrowLeft className='size-4' />
          Back to dashboard
        </Link>
        <h1 className='text-2xl font-semibold'>Email notifications</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Choose what Tide emails you about. In-app notifications (the bell) are always on.
        </p>
      </div>

      {!verified && (
        <div role='status' className='flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm'>
          <p className='flex-1 min-w-0'>
            Tide only emails verified addresses. Verify <span className='font-medium'>{session.user.email}</span>{' '}
            to receive any of these.
          </p>
          <ResendVerificationButton email={session.user.email} size='sm' />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Email me</CardTitle>
          <CardDescription>Sent to {session.user.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailPreferencesForm initial={prefs} />
        </CardContent>
      </Card>
    </div>
  );
}
