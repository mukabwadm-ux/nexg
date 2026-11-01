import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/web',
  testMatch: 'merchant-settings.spec.ts',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3024',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'settings-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 1024 } },
    },
    {
      name: 'settings-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --port 3024',
    cwd: './apps/web',
    url: 'http://127.0.0.1:3024/merchant-preview/settings',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
