import { defineConfig, devices } from '@playwright/test'

const appPort = process.env.E2E_PORT ?? '5173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${appPort}` },
  webServer: [
    {
      command: 'npm run emulators',
      url: 'http://127.0.0.1:8080',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_USE_EMULATORS: 'true' },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${appPort}`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_USE_EMULATORS: 'true' },
    },
  ],
})
