import { describe, expect, it } from 'vitest';
import { checkServerEnv } from '@/lib/env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require',
  BETTER_AUTH_SECRET: 'a'.repeat(64),
  BETTER_AUTH_URL: 'https://tide.example.com',
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRO_PRICE_ID: 'price_pro',
  STRIPE_BUSINESS_PRICE_ID: 'price_biz',
  RESEND_API_KEY: 're_123',
};

describe('checkServerEnv', () => {
  it('accepts a complete environment', () => {
    const result = checkServerEnv(valid);
    expect(result.ok).toBe(true);
  });

  it('treats NEXT_PUBLIC_APP_URL as optional but validates it when set', () => {
    expect(checkServerEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'https://tide.example.com' }).ok).toBe(true);
    expect(checkServerEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'not a url' }).ok).toBe(false);
  });

  it('reports every missing variable by name', () => {
    const result = checkServerEnv({ ...valid, STRIPE_SECRET_KEY: undefined, RESEND_API_KEY: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join('\n')).toContain('STRIPE_SECRET_KEY: missing');
    expect(result.problems.join('\n')).toContain('RESEND_API_KEY: missing');
  });

  it('counts blank values (FOO=) as missing', () => {
    const result = checkServerEnv({ ...valid, GOOGLE_CLIENT_SECRET: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join('\n')).toContain('GOOGLE_CLIENT_SECRET: missing');
  });

  it('rejects values in the wrong format', () => {
    const result = checkServerEnv({
      ...valid,
      DATABASE_URL: 'mysql://nope',
      BETTER_AUTH_SECRET: 'short',
      STRIPE_WEBHOOK_SECRET: 'sk_test_wrong_field',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.problems.join('\n');
    expect(text).toContain('DATABASE_URL');
    expect(text).toContain('BETTER_AUTH_SECRET');
    expect(text).toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('never echoes secret values in problem messages', () => {
    const secret = 'sk_live_SUPERSECRET_but_in_wrong_var';
    const result = checkServerEnv({ ...valid, RESEND_API_KEY: secret });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join('\n')).not.toContain('SUPERSECRET');
  });
});

describe('EMAIL_FROM', () => {
  it('is optional outside production', () => {
    expect(checkServerEnv(valid).ok).toBe(true);
    expect(checkServerEnv({ ...valid, VERCEL_ENV: 'preview' }).ok).toBe(true);
  });

  it('is required in production', () => {
    const result = checkServerEnv({ ...valid, VERCEL_ENV: 'production' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join('\n')).toContain('EMAIL_FROM');
    expect(
      checkServerEnv({
        ...valid,
        VERCEL_ENV: 'production',
        EMAIL_FROM: 'Tide <notifications@tide.ramarizdev.web.id>',
        NEXT_PUBLIC_CONTACT_EMAIL: 'hello@tide.ramarizdev.web.id',
      }).ok,
    ).toBe(true);
  });

  it.each(['Tide <notifications@tide.example.com>', 'notifications@tide.example.com'])(
    'accepts %s',
    (from) => {
      expect(checkServerEnv({ ...valid, EMAIL_FROM: from }).ok).toBe(true);
    },
  );

  it.each(['Tide', 'Tide <notifications>', 'Tide <onboarding@resend.dev>', 'a@b'])(
    'rejects %s',
    (from) => {
      expect(checkServerEnv({ ...valid, EMAIL_FROM: from }).ok).toBe(false);
    },
  );
});

describe('NEXT_PUBLIC_CONTACT_EMAIL', () => {
  const prod = { VERCEL_ENV: 'production', EMAIL_FROM: 'Tide <notifications@tide.ramarizdev.web.id>' };

  it('is required in production (the legal pages name it as the contact)', () => {
    const result = checkServerEnv({ ...valid, ...prod });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join('\n')).toContain('NEXT_PUBLIC_CONTACT_EMAIL');
  });

  it('must be an email address, and is optional outside production', () => {
    expect(checkServerEnv({ ...valid, ...prod, NEXT_PUBLIC_CONTACT_EMAIL: 'not-an-email' }).ok).toBe(false);
    expect(checkServerEnv({ ...valid, ...prod, NEXT_PUBLIC_CONTACT_EMAIL: 'hello@tide.ramarizdev.web.id' }).ok).toBe(true);
    expect(checkServerEnv({ ...valid, VERCEL_ENV: 'preview' }).ok).toBe(true);
  });
});
