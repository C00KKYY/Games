import { test, expect } from '@playwright/test';
import { setup, screenshotVariance } from './helpers';

test('Test 0: WebGL2 available under SwiftShader', async ({ page }) => {
  await page.goto('about:blank');
  const ok = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  expect(ok).toBe(true);
});

test('A7: only localhost requests (SDK routed to mock)', async ({ page }) => {
  const g = await setup(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __sdkCalls?: { n: string }[] }).__sdkCalls?.some(c => c.n === 'gameplayStart'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(g.foreign).toEqual([]);
});

for (const variant of ['normal', 'delayed', 'aborted'] as const) {
  test(`A1/A1b: loading screen visible at 100/300 ms (${variant})`, async ({ page }) => {
    await setup(page, { sdkDelayMs: variant === 'delayed' ? 5000 : 0, sdkAbort: variant === 'aborted' });
    const nav = page.goto('/', { waitUntil: 'commit' });
    await nav;
    await page.waitForTimeout(100);
    const v1 = await screenshotVariance(page);
    await page.waitForTimeout(200);
    const v2 = await screenshotVariance(page);
    expect(await page.locator('#boot').isVisible()).toBe(true);
    expect(v1).toBeGreaterThan(30);
    expect(v2).toBeGreaterThan(30);
  });
}
