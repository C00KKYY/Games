import { defineConfig } from '@playwright/test';
// PW_PORT: run the preview on another port (parallel agents / a server that is already up); default 4173
const PORT = Number(process.env.PW_PORT ?? 4173);
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'qa/playwright-results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  webServer: { command: `npx vite build && npx vite preview --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
});
