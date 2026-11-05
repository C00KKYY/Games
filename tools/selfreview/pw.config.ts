import { defineConfig } from '@playwright/test';
// self-review runner (Brief §13.1), not part of `npm run qa`: PW_PORT=<port of a running vite preview>
const PORT = Number(process.env.PW_PORT ?? 4173);
export default defineConfig({
  testDir: '.',
  testMatch: 'selfreview.spec.ts',
  timeout: 3_600_000,
  workers: 1,
  reporter: [['list']],
  outputDir: process.env.SR_TMP ?? '../../test-results/selfreview',
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    deviceScaleFactor: 1,
  },
});
