import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 45000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['json', { outputFile: '../docs/frontend/interaction-results.json' }]],
  outputDir: './test-results',
  use: { baseURL: 'http://localhost:4173/preview/', viewport: { width: 1440, height: 1100 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://localhost:4173/preview/', reuseExistingServer: true },
});
