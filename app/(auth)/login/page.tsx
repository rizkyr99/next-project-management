import { safeCallbackPath } from '@/lib/safe-redirect';
import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { SocialLoginDivider } from '../components/social-login-divider';
import { LoginForm } from './components/login-form';
import { SocialLoginButtons } from './components/social-login-buttons';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string | string[]; deleted?: string; reset?: string }>;
}) {
  const { callbackURL: raw, deleted, reset } = await searchParams;
  const callbackURL = safeCallbackPath(raw);
  const query = callbackURL === '/' ? '' : `?callbackURL=${encodeURIComponent(callbackURL)}`;

  return (
    <AuthPageContainer>
      <AuthPageHeader
        title='Welcome back!'
        subtitle="Don't have an account?"
        linkText='Register'
        linkHref={`/register${query}`}
      />
      {deleted === '1' && (
        <p role='status' className='rounded-md border bg-muted/50 px-3 py-2 text-sm'>
          Your account has been deleted.
        </p>
      )}
      {reset === '1' && (
        <p role='status' className='rounded-md border bg-muted/50 px-3 py-2 text-sm'>
          Your password has been changed. Log in with your new password.
        </p>
      )}
      <LoginForm callbackURL={callbackURL} />
      <SocialLoginDivider />
      <SocialLoginButtons callbackURL={callbackURL} />
    </AuthPageContainer>
  );
}
