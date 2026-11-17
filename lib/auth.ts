import { db } from '@/db/drizzle';
import { account, session, user, verification } from '@/db/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { after } from 'next/server';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  // Better Auth's own rate limiter (on in production) identifies clients by
  // IP. Use the same header as lib/rate-limit.ts: on Vercel `x-real-ip` is
  // set by the platform. Without this it read x-forwarded-for, so every E2E
  // user in a production build shared one sign-up limit (3 per 10 s).
  advanced: {
    ipAddress: { ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'] },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  emailAndPassword: {
    enabled: true,
    // P3.1: password reset. Links expire after an hour and work once;
    // resetting signs the user out on every device.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Send after the response: awaiting the email here would make
      // "account exists" responses measurably slower than "no account",
      // leaking which addresses are registered.
      // Imported lazily so the mailer stays out of the proxy bundle.
      after(async () => {
        const { sendPasswordResetEmail } = await import('@/lib/email');
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl: url });
      });
    },
  },
  // P3.2: email verification, as a soft gate. Unverified users can use the
  // app but can't accept invites from /invites or get email notifications
  // (see the banner in the workspace layout). Google accounts arrive
  // verified.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      // Always land on our confirmation page (it also explains bad or
      // expired links), whatever callback the sign-up form passed.
      const verifyUrl = new URL(url);
      verifyUrl.searchParams.set('callbackURL', '/email-verified');
      after(async () => {
        const { sendVerificationEmail } = await import('@/lib/email');
        await sendVerificationEmail({ to: user.email, name: user.name, verifyUrl: verifyUrl.toString() });
      });
    },
  },
});
