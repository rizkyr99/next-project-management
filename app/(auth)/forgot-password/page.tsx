import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { ForgotPasswordForm } from './forgot-password-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthPageContainer>
      <AuthPageHeader
        title='Forgot your password?'
        subtitle='Remembered it?'
        linkText='Back to login'
        linkHref='/login'
      />
      <ForgotPasswordForm />
    </AuthPageContainer>
  );
}
