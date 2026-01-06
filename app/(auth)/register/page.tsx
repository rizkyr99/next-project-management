import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { SocialLoginDivider } from '../components/social-login-divider';
import { SocialLoginButtons } from '../login/components/social-login-buttons';
import { RegisterForm } from './components/register-form';

export default function RegisterPage() {
  return (
    <AuthPageContainer>
      <AuthPageHeader
        title='Create an account'
        subtitle='Already have an account?'
        linkText='Login'
        linkHref='/login'
      />
      <RegisterForm />
      <SocialLoginDivider />
      <SocialLoginButtons />
    </AuthPageContainer>
  );
}
