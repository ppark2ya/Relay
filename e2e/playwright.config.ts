import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'DB_PATH=./relay-test.db ./relay-e2e',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 10_000,
    },
    {
      command: 'bun run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      cwd: '../web',
      timeout: 30_000,
    },
  ],
});
