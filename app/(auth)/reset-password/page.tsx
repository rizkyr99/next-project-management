import { Button } from '@/components/ui/button';
import Link from 'next/link';
import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { ResetPasswordForm } from './reset-password-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reset password' };

/**
 * The email link goes to Better Auth's /api/auth/reset-password/:token, which
 * checks the token and redirects here with ?token= (or ?error=INVALID_TOKEN).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const { token, error } = await searchParams;
  const validToken = typeof token === 'string' && token.length > 0 && !error ? token : null;

  return (
    <AuthPageContainer>
      <AuthPageHeader
        title='Choose a new password'
        subtitle='Remembered it?'
        linkText='Back to login'
        linkHref='/login'
      />
      {validToken ? (
        <ResetPasswordForm token={validToken} />
      ) : (
        <div role='alert' className='space-y-3 rounded-lg border p-4 text-sm'>
          <p className='font-medium'>This reset link is invalid or has expired.</p>
          <p className='text-muted-foreground'>Links work once and expire after 1 hour.</p>
          <Button asChild variant='outline' size='sm'>
            <Link href='/forgot-password'>Request a new link</Link>
          </Button>
        </div>
      )}
    </AuthPageContainer>
  );
}
