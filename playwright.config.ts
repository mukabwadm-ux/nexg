import { defineConfig, devices } from '@playwright/test';

import { ADMIN_STATE } from './e2e/auth-state';

const ADMIN_URL = 'http://127.0.0.1:3001';
const WEB_URL = 'http://127.0.0.1:3000';

/**
 * End-to-end configuration.
 *
 * Split by app, because the two suites need different base URLs
 * and a single `testDir` could only ever serve one of them.
 *
 * That was not a tidiness problem. `apps/web/tests/
 * location-consent.spec.ts` — the spy suite that proves nothing
 * touches `navigator.geolocation` without a click, the one the
 * web app's ESLint config calls "worth two guards" — sat outside
 * `testDir` and so had never run. Vitest picked it up instead,
 * where a Playwright file cannot even be collected, and the
 * failure read like a misconfiguration rather than a guard that
 * was switched off. The rule it enforces is the one whose cost
 * is permanent, so it is now a project in its own right.
 *
 * Both suites run at both viewports. Ground rule 7 makes the
 * mid-range Android the primary target, and the location layer
 * renders a different chip and a different sheet there.
 */
const VIEWPORTS = [
  /* Spec ground rule 7: a mid-range Android phone is the primary target. */
  { name: 'mobile-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
];

export default defineConfig({
  /*
   * 60s, against a default of 30.
   *
   * The consent specs deliberately sit still for 3 seconds per
   * route — a prompt fired from a timer is exactly what they are
   * looking for, so the wait is the test. Add a production page
   * that takes two or three seconds to settle under four
   * parallel workers and 30s is not a generous budget, it is a
   * coin toss: the suite passed at `--workers=1` and failed
   * three routes at four. A suite that flakes under its own
   * default parallelism is one people learn to re-run rather
   * than read.
   */
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    /*
     * Everything in the admin app sits behind the middleware, so
     * the session is established once and reused. Without it the
     * ui-kit spec just redirected to /sign-in and failed on a
     * heading that could never render.
     */
    {
      name: 'admin-setup',
      testDir: './e2e/admin',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
    ...VIEWPORTS.flatMap((v) => [
      {
        name: `admin-${v.name}`,
        testDir: './e2e/admin',
        testIgnore: /auth\.setup\.ts/,
        dependencies: ['admin-setup'],
        use: { ...v.use, baseURL: ADMIN_URL, storageState: ADMIN_STATE },
      },
      {
        name: `web-${v.name}`,
        testDir: './e2e/web',
        use: { ...v.use, baseURL: WEB_URL },
      },
    ]),
  ],

  webServer: [
    {
      command: 'pnpm --filter @nexg/admin start',
      url: ADMIN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @nexg/web start',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
