import { defineConfig, devices } from '@playwright/test'

const appPort = 5295

export default defineConfig({
  testDir: './tests/pwa',
  fullyParallel: false,
  reporter: 'list',
  timeout: 90_000,
  globalTimeout: 360_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${appPort}`,
    serviceWorkers: 'allow',
  },
  webServer: [
    {
      command: 'npm run emulators:pwa-e2e',
      url: 'http://127.0.0.1:9295/',
      env: { XDG_CONFIG_HOME: `${process.cwd()}/.runtime/firebase-config` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build:pwa-e2e && vite preview --outDir dist-pwa-e2e --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
