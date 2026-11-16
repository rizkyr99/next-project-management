import { safeCallbackPath } from '@/lib/safe-redirect';
import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { SocialLoginDivider } from '../components/social-login-divider';
import { SocialLoginButtons } from '../login/components/social-login-buttons';
import { RegisterForm } from './components/register-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({
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
        title='Create an account'
        subtitle='Already have an account?'
        linkText='Login'
        linkHref={`/login${query}`}
      />
      <RegisterForm callbackURL={callbackURL} />
      <SocialLoginDivider />
      <SocialLoginButtons callbackURL={callbackURL} />
    </AuthPageContainer>
  );
}
