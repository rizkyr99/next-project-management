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
  // Sender on a domain verified in Resend, e.g. "Tide <notifications@tide.example.com>".
  // Optional locally (falls back to Resend's test sender, which only reaches
  // the account owner) but required in production; see the refinement below.
  EMAIL_FROM: z
    .string()
    .trim()
    .regex(
      /^(?:[^<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/,
      'must be "Name <address@domain>" or "address@domain"',
    )
    .refine((v) => !/@resend\.dev>?$/i.test(v), {
      message: "must be on your verified domain, not Resend's resend.dev test sender",
    })
    .optional(),

  // Optional. Secret for /api/cron/daily (Vercel Cron sends it as a Bearer
  // token). Without it the cron route refuses every call.
  CRON_SECRET: z.string().trim().min(16, 'must be at least 16 characters').optional(),

  // Set by Vercel: "production" | "preview" | "development".
  VERCEL_ENV: z.string().optional(),

  // Shown on /privacy and /terms as the contact for privacy and legal
  // requests. Required in production (see below); optional elsewhere.
  NEXT_PUBLIC_CONTACT_EMAIL: z.email().optional(),

  // Optional. Public base URL used in emails. Falls back to BETTER_AUTH_URL.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
}).superRefine((env, ctx) => {
  // The legal pages name this as the way to reach the operator; without it
  // they'd point to an address that isn't anywhere on the site.
  if (env.VERCEL_ENV === 'production' && !env.NEXT_PUBLIC_CONTACT_EMAIL) {
    ctx.addIssue({
      code: 'custom',
      path: ['NEXT_PUBLIC_CONTACT_EMAIL'],
      message: 'required in production (contact address shown on /privacy and /terms)',
    });
  }
  if (env.VERCEL_ENV === 'production' && !env.EMAIL_FROM) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_FROM'],
      message: 'required in production (sender on your verified Resend domain)',
    });
  }
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
