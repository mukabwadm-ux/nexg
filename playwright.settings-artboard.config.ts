import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/web',
  testMatch: 'merchant-settings-artboard.spec.ts',
  timeout: 60000,
  workers: 1,
  retries: 0,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/settings-artboard-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:3141',
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
});
