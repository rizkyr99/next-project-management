import AuthPageContainer from '../components/auth-page-container';
import { AuthPageHeader } from '../components/auth-page-header';
import { SocialLoginDivider } from '../components/social-login-divider';
import { LoginForm } from './components/login-form';
import { SocialLoginButtons } from './components/social-login-buttons';

export default function LoginPage() {
  return (
    <AuthPageContainer>
      <AuthPageHeader />
      <LoginForm />
      <SocialLoginDivider />
      <SocialLoginButtons />
    </AuthPageContainer>
  );
}
