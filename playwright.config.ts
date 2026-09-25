import { defineConfig, devices } from '@playwright/test';

const ADMIN_URL = 'http://127.0.0.1:3001';

/**
 * End-to-end configuration.
 *
 * M1 covers only the ui-kit: that both apps boot and the design system renders
 * at the 390px viewport the spec requires. The acceptance suite in spec
 * section 6 (apply as rider, apply as merchant, review and approve) arrives
 * with the flows it tests, in M4 to M6.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: ADMIN_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Spec ground rule 7: a mid-range Android phone is the primary target.
      name: 'mobile-390',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
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
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
