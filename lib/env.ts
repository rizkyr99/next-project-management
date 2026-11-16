import { z } from 'zod';

/**
 * The server's environment contract. A missing or malformed value fails a
 * production build on Vercel (next.config.ts) and stops a production server
 * from starting (instrumentation.ts), instead of surfacing later as a broken
 * checkout, login or email.
 *
 * Keep .env.example in sync with this file.
 */
const nonEmpty = (hint: string) => z.string().trim().min(1, `required: ${hint}`);

export const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),

  BETTER_AUTH_SECRET: z
    .string()
    .trim()
    .min(32, 'must be at least 32 characters; generate one with `openssl rand -hex 32`'),
  BETTER_AUTH_URL: z.url('must be the absolute base URL, e.g. https://app.example.com'),
  GOOGLE_CLIENT_ID: nonEmpty('Google OAuth client ID'),
  GOOGLE_CLIENT_SECRET: nonEmpty('Google OAuth client secret'),

  STRIPE_SECRET_KEY: z.string().trim().regex(/^(sk|rk)_(test|live)_/, 'must be a Stripe secret key (sk_test_… / sk_live_…)'),
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith('whsec_', 'must be a Stripe webhook secret (whsec_…)'),
  STRIPE_PRO_PRICE_ID: z.string().trim().startsWith('price_', 'must be a Stripe price ID (price_…)'),
  STRIPE_BUSINESS_PRICE_ID: z.string().trim().startsWith('price_', 'must be a Stripe price ID (price_…)'),

  RESEND_API_KEY: z.string().trim().startsWith('re_', 'must be a Resend API key (re_…)'),

  // Optional. Public base URL used in emails. Falls back to BETTER_AUTH_URL.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Empty strings count as missing (e.g. `FOO=` in a .env file). */
function withoutBlanks(source: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
}

export type EnvCheck =
  | { ok: true; env: ServerEnv }
  | { ok: false; problems: string[] };

/** Validates without throwing. Problem lines name the variable but never echo its value. */
export function checkServerEnv(source: Record<string, string | undefined> = process.env): EnvCheck {
  const result = serverEnvSchema.safeParse(withoutBlanks(source));
  if (result.success) return { ok: true, env: result.data };

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    const missing = issue.code === 'invalid_type' && !(key in withoutBlanks(source));
    return `  - ${key}: ${missing ? 'missing' : issue.message}`;
  });
  return { ok: false, problems };
}

export function formatEnvProblems(problems: string[]): string {
  return [
    'Invalid server environment variables:',
    ...problems,
    'See .env.example for what each variable should contain.',
  ].join('\n');
}
