import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    {
      command: 'npm run emulators',
      url: 'http://127.0.0.1:8080',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_USE_EMULATORS: 'true' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_USE_EMULATORS: 'true' },
    },
  ],
})
