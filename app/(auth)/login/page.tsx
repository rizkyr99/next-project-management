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
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const { callbackURL: raw } = await searchParams;
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
      <LoginForm callbackURL={callbackURL} />
      <SocialLoginDivider />
      <SocialLoginButtons callbackURL={callbackURL} />
    </AuthPageContainer>
  );
}
