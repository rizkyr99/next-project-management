import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { serverEnvSchema } from '@/lib/env';

/**
 * Every variable lib/env.ts knows must be documented in the README's table
 * and listed in .env.example, so a new setting can't ship undocumented.
 */
const keys = Object.keys(serverEnvSchema.shape);
const readme = readFileSync('README.md', 'utf8');
const example = readFileSync('.env.example', 'utf8');

/** Set by the platform, not by people: documented, but not in .env.example. */
const PLATFORM = new Set(['VERCEL_ENV']);

describe('environment variable docs', () => {
  it.each(keys)('%s is in the README table', (key) => {
    expect(readme).toContain(`\`${key}\``);
  });

  it.each(keys.filter((k) => !PLATFORM.has(k)))('%s is in .env.example', (key) => {
    expect(example).toMatch(new RegExp(`^#?\\s*${key}=`, 'm'));
  });
});
