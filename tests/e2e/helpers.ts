import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const MOCK = readFileSync(new URL('../fixtures/sdk-mock.js', import.meta.url), 'utf8');

export interface Guard { foreign: string[] }

/** Route SDK to the local mock and record every non-localhost request (A7). */
export async function setup(page: Page, opts: { sdkDelayMs?: number; sdkAbort?: boolean; mock?: Record<string, unknown> } = {}): Promise<Guard> {
  const guard: Guard = { foreign: [] };
  if (opts.mock) await page.addInitScript(c => { (window as unknown as { __sdkMockConfig: unknown }).__sdkMockConfig = c; }, opts.mock);
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url === SDK_URL) {
      if (opts.sdkAbort) return route.abort();
      if (opts.sdkDelayMs) await new Promise(r => setTimeout(r, opts.sdkDelayMs));
      return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    }
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    guard.foreign.push(url);
    return route.abort();
  });
  return guard;
}

/** pixel variance of a PNG screenshot buffer, computed in-page */
export async function screenshotVariance(page: Page): Promise<number> {
  const buf = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++; }
    const m = s / n; return s2 / n - m * m;
  }, buf.toString('base64'));
}

/**
 * Navigate to the game (relative URL → works with any baseURL) and wait until the HUD is mounted, the loading
 * screen is gone and the web fonts are loaded. `settleMs` lets throttled DOM writes (≤ 10/s) and the 0.5 s camera
 * inset refresh catch up before measuring.
 */
export async function gotoGame(page: Page, query = '', settleMs = 800): Promise<void> {
  await page.goto('/' + (query && !query.startsWith('?') ? '?' + query : query));
  await page.waitForFunction(() => {
    const g = window as unknown as Record<string, unknown>;
    return !!g.__ctx && !!g.__game && !!document.getElementById('boot')?.classList.contains('gone') && document.fonts.status === 'loaded';
  }, null, { timeout: 60_000 });
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}
