/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * G2 single-file playtest build (Brief §13.3): dist-single/index.html (SINGLEFILE=1 npx vite build) must run when opened
 * from disk (file://). Not part of `npm run qa`; run by hand:
 *   SR_SPEC=singlefile.spec.ts SF_FILE=<abs path of the html> npx playwright test -c tools/selfreview/pw.config.ts --workers=1
 * Two cases: offline (the CrazyGames SDK tag fails → the platform's timeout fallback) and with the SDK mock answering.
 * Checks: the canvas renders, the tutorial appears, the first tap unlocks audio and the sounds decode from the inlined
 * data: URLs, no request leaves the page except the SDK tag, 0 pageerrors and 0 console errors.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SDK_URL, screenshotVariance } from '../../tests/e2e/helpers';

const FILE = resolve(process.env.SF_FILE ?? 'dist-single/index.html');
const MOCK = readFileSync(new URL('../../tests/fixtures/sdk-mock.js', import.meta.url), 'utf8');
const SHOTS = process.env.SR_OUT ?? 'test-results/singlefile';

for (const mode of ['offline', 'sdk-mock'] as const) {
  test(`single-file build runs from file:// (${mode}) @ 907x510`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 907, height: 510 });
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      requests.push(url);
      if (url === SDK_URL && mode === 'sdk-mock') return route.fulfill({ contentType: 'application/javascript', body: MOCK });
      return route.abort('internetdisconnected');
    });
    const t0 = Date.now();
    await page.goto(pathToFileURL(FILE).href);
    await page.waitForFunction(() => !!document.getElementById('boot')?.classList.contains('gone') && !!(window as any).__ctx, null, { timeout: 60_000 });
    const bootMs = Date.now() - t0;
    await page.waitForFunction(() => !!document.querySelector('.tu-ring.on') && !!document.querySelector('.tu-bub.on'), null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const variance = await screenshotVariance(page);
    await page.screenshot({ path: `${SHOTS}/singlefile-${mode}-start.png`, timeout: 90_000 });
    const before = await page.evaluate(() => { const g = window as any; const d = g.__audio.debug(); return { loaded: d.loaded.length, present: d.present.length, ctx: d.ctxState, sdk: (g.__sdkCalls ?? []).map((c: any) => c.n), icons: [...document.querySelectorAll('img')].filter(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length, brokenIcons: [...document.querySelectorAll('img')].filter(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0 && (i as HTMLImageElement).src).map(i => (i as HTMLImageElement).src.slice(0, 40)) }; });
    // the first tap (on the ring: the honking ferry) unlocks audio
    const ring = await page.evaluate(() => { const r = document.querySelector('.tu-ring.on') as HTMLElement; const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(r.style.transform)!; return { x: +m[1], y: +m[2] }; });
    await page.mouse.click(ring.x, ring.y);
    await page.waitForFunction(() => (window as any).__audio.debug().ctxState === 'running', null, { timeout: 15_000 });
    await page.waitForFunction(() => { const d = (window as any).__audio.debug(); return d.loaded.length >= d.present.length; }, null, { timeout: 120_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => { const g = window as any; const d = g.__audio.debug(); return { loaded: d.loaded.length, present: d.present.length, missing: d.present.filter((p: string) => !d.loaded.includes(p)), loops: d.loops.map((l: any) => l.id), ctx: d.ctxState, tapped: g.__sim.ferry.tapped, step: g.__sim.tutorial.step, plays: ((g.__audioLog ?? []) as any[]).filter(e => !e.skip).map(e => e.id).slice(0, 12), storage: g.__platform?.storageKind?.() ?? null }; });
    await page.screenshot({ path: `${SHOTS}/singlefile-${mode}-after-tap.png`, timeout: 90_000 });
    console.log(`[singlefile ${mode}] boot ${bootMs} ms, variance ${variance.toFixed(0)}, icons ok ${before.icons}, broken ${before.brokenIcons.length}, sdk calls [${before.sdk.join(',')}], audio before tap ${before.loaded}/${before.present} (${before.ctx}), after ${after.loaded}/${after.present} (${after.ctx}) missing [${after.missing.join(',')}], loops [${after.loops.join(',')}], plays [${after.plays.join(',')}], horn tapped ${after.tapped}, tutorial step ${after.step}, storage ${after.storage}, requests [${requests.join(', ')}], errors ${errors.length}`);
    expect(variance, 'the canvas renders (not a flat colour)').toBeGreaterThan(100);
    expect(before.brokenIcons, 'UI icons load from the inlined data: URLs').toEqual([]);
    expect(after.ctx).toBe('running');
    // musicInspection is only requested when the inspection starts (M5), everything else loads after the first tap
    expect(after.missing.filter((id: string) => id !== 'musicInspection'), 'every sound decodes from the single file').toEqual([]);
    expect(after.step, 'the first tap reached the game (tutorial step 1 "horn" done)').toBeGreaterThanOrEqual(1);
    expect(requests.filter(u => u !== SDK_URL), 'nothing but the SDK tag leaves the page').toEqual([]);
    // offline: the browser itself logs the failed SDK script request ("Failed to load resource") – not a game error
    const own = errors.filter(e => !(mode === 'offline' && /Failed to load resource/.test(e)));
    console.log(`[singlefile ${mode}] errors: ${JSON.stringify(errors)}`);
    expect(own).toEqual([]);
  });
}
