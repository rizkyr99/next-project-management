import { Button } from '@/components/ui/button';
import { ResendVerificationButton } from '@/features/account/components/verify-email-banner';
import { getSession } from '@/lib/auth-session';
import { CheckCircle2, MailWarning } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AuthPageContainer from '../components/auth-page-container';

export const metadata: Metadata = { title: 'Email verification' };

const ERRORS: Record<string, string> = {
  token_expired: 'This verification link has expired.',
  invalid_token: 'This verification link is invalid.',
  user_not_found: 'This verification link is for an account that no longer exists.',
  unauthorized: "This link is for a different account than the one you're signed in to.",
};

/** Where verification links land (Better Auth verifies, then redirects here). */
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  const message = typeof error === 'string' ? (ERRORS[error] ?? ERRORS.invalid_token) : null;

  return (
    <AuthPageContainer>
      <div className='flex flex-col items-center space-y-4 text-center'>
        <div className='text-4xl font-extrabold text-primary'>tide</div>
        {message ? (
          <div role='alert' className='space-y-3'>
            <MailWarning className='mx-auto size-8 text-muted-foreground' />
            <h1 className='text-xl font-bold'>{message}</h1>
            {session && !session.user.emailVerified ? (
              <>
                <p className='text-sm text-muted-foreground'>We can send a fresh link to {session.user.email}.</p>
                <ResendVerificationButton email={session.user.email} />
              </>
            ) : session?.user.emailVerified ? (
              <p className='text-sm text-muted-foreground'>Your email is already verified, so there&apos;s nothing to do.</p>
            ) : (
              <p className='text-sm text-muted-foreground'>Log in and use “Resend email” on the banner to get a new link.</p>
            )}
            <Button asChild variant='outline'>
              <Link href={session ? '/' : '/login'}>{session ? 'Go to Tide' : 'Log in'}</Link>
            </Button>
          </div>
        ) : (
          <div role='status' className='space-y-3'>
            <CheckCircle2 className='mx-auto size-8 text-green-600' />
            <h1 className='text-xl font-bold'>Your email is verified</h1>
            <p className='text-sm text-muted-foreground'>
              Teammates can now invite you, and Tide can email you about your work.
            </p>
            <Button asChild>
              <Link href={session ? '/' : '/login'}>Continue to Tide</Link>
            </Button>
          </div>
        )}
      </div>
    </AuthPageContainer>
  );
}
