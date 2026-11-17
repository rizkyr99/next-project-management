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
});
