import { defineConfig, devices } from '@playwright/test';
import { E2E_CRON_SECRET } from './e2e/helpers/cron';

export default defineConfig({
  testDir: './e2e',
  // Refuses to run if DATABASE_URL points at the production Neon branch.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 2,
  // CI: failures inline on the PR, plus the HTML report as an artifact.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /cron\.spec\.ts/,
    },
    {
      // The daily job is global (it expires invites, clears call presence and
      // auth tokens, and reminds everyone with due tasks), so its spec runs
      // alone, after every other spec, instead of mutating their data mid-run.
      name: 'jobs',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /cron\.spec\.ts/,
      dependencies: ['chromium'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Never reuse an already-running server: it may point at a different
    // (e.g. production) database than the one global-setup verified.
    reuseExistingServer: false,
    // The dev server compiles on first request; CI runners are slow to start.
    timeout: 180_000,
    // The cron spec calls /api/cron/daily with this test-only secret.
    env: { CRON_SECRET: E2E_CRON_SECRET },
  },
});
