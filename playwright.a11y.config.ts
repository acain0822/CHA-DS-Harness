import { defineConfig } from '@playwright/test';

// Same Storybook build as the visual tests. Doesn't need baselines, so it runs on any OS.
export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:6008', browserName: 'chromium' },
  webServer: {
    command: 'npx http-server storybook-static -p 6008 -s',
    port: 6008,
    reuseExistingServer: !process.env.CI,
  },
});
