const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.LIVE_URL || 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar-SY',
  },
  webServer: process.env.LIVE_URL
    ? undefined
    : {
        command: 'node scripts/serve.cjs',
        url: 'http://127.0.0.1:8765',
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chromium',
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'webkit-mobile',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
