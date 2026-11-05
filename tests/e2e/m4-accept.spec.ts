/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * M4 acceptance – build budgets, the long bot session and audio muting (Brief §12.2 A4/A6, §12.8 G, §12.4 C4).
 *
 * Covered elsewhere (not repeated here): A1/A1b/A7 tests/e2e/m0-infra.spec.ts; A5/A5b and the save round trip
 * tests/e2e/m4-save.spec.ts; H4 (hash after save → load before the first tick, offline clamp, time jumps)
 * tests/unit/save*.test.ts; G levels (SFX peak/RMS, music/ambience LUFS) and "no click at the loop point" (RMS jump across
 * every loop seam < 6 dB, measured from the shipped MP3s in qa/audio/levels.json) tests/unit/audio-assets.test.ts; mute
 * precedence in the mixer tests/unit/audio-runtime.test.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { setup, gotoGame, SDK_URL } from './helpers';
import { instr, hook, type Win } from './accept-kit';
import { INITIAL, INITIAL_MUSIC } from '../../src/audio/manifest';

const DIST = join(process.cwd(), 'dist');
const MB = 1_000_000; // decimal megabytes: the stricter reading of "8 MB" / "3 MB"

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------- A4
test.describe('A4 build budgets', () => {
  test('A4 dist ≤ 8 MB, < 1500 files; no absolute or foreign URL in src=, href=, url(, fetch(, import( (w3.org namespaces allowed)', async () => {
    expect(existsSync(join(DIST, 'index.html')), 'dist/ built (playwright webServer runs vite build)').toBe(true);
    const files = walk(DIST);
    const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
    console.log(`[A4] dist: ${files.length} files, ${(bytes / MB).toFixed(2)} MB`);
    expect(bytes, 'A4: size ≤ 8 MB').toBeLessThanOrEqual(8 * MB);
    expect(files.length, 'A4: < 1500 files').toBeLessThan(1500);
    // grep (only these five constructs, as the brief says), over every text file of the build
    const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest']);
    const ABS = String.raw`(?:[a-z][a-z0-9+.-]*:)?\/\/[^"'\`\s)>]*|\/(?!\/)[^"'\`\s)>]*`; // scheme://…, //host…, or root-absolute /path
    const pats: [string, RegExp][] = [
      ['src=', new RegExp(String.raw`\bsrc\s*=\s*["'\`]?\s*(${ABS})`, 'gi')],
      ['href=', new RegExp(String.raw`\bhref\s*=\s*["'\`]?\s*(${ABS})`, 'gi')],
      ['url(', new RegExp(String.raw`\burl\(\s*["']?\s*(${ABS})`, 'gi')],
      ['fetch(', new RegExp(String.raw`\bfetch\(\s*["'\`]\s*(${ABS})`, 'gi')],
      ['import(', new RegExp(String.raw`\bimport\(\s*["'\`]\s*(${ABS})`, 'gi')],
    ];
    const hits: string[] = [];
    let scanned = 0, allowedSdk = 0;
    for (const f of files) {
      if (!TEXT.has(extname(f).toLowerCase())) continue;
      scanned++;
      const body = readFileSync(f, 'utf8');
      for (const [what, re] of pats) for (const m of body.matchAll(re)) {
        const u = m[1];
        if (!u || u === '/' && what !== 'src=' && what !== 'href=') continue;
        if (/^https?:\/\/www\.w3\.org\//i.test(u)) continue; // XML/SVG namespaces
        // the one platform script the brief requires (§11.1: the CrazyGames SDK v3 is loaded from CrazyGames; every
        // test routes it to the local mock, A7 proves nothing else leaves localhost)
        if (u === SDK_URL && f.endsWith('index.html')) { allowedSdk++; continue; }
        hits.push(`${relative(DIST, f)}: ${what} ${u}  …${body.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 20).replace(/\s+/g, ' ')}…`);
      }
    }
    console.log(`[A4] grep: ${scanned} text files scanned, SDK tag allowed ${allowedSdk}×, ${hits.length} hits`);
    expect(scanned).toBeGreaterThan(5);
    expect(allowedSdk, 'the SDK tag is the only exception and it is there').toBe(1);
    expect(hits, 'A4: absolute/foreign URLs').toEqual([]);
  });

  test('A4 initial download ≤ 3 MB: every byte requested before the first gameplayStart', async ({ page }) => {
    await page.addInitScript(() => { performance.setResourceTimingBufferSize(5000); });
    // §8.4 probe: from the moment the audio runtime exists until phase 2 is queued, musicDay must be neither queued nor loaded
    await page.addInitScript(() => {
      const g = window as any;
      g.__p2 = { early: false, seen: 0 };
      const iv = setInterval(() => {
        const a = g.__audio; if (!a) return;
        const d = a.debug(); g.__p2.seen++;
        if (d.phase2At < 0 && (a.mixer.loading.has('musicDay') || a.mixer.buffers.has('musicDay'))) g.__p2.early = true;
        if (d.phase2At >= 0) clearInterval(iv);
      }, 4);
    });
    await setup(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as Win).__sdkCalls?.some((c: any) => c.n === 'gameplayStart'), null, { timeout: 30_000 });
    await page.waitForTimeout(3000); // let the requests that started before gameplayStart finish (sizes are known at responseEnd)
    const r = await page.evaluate(() => {
      const gs = (window as unknown as Win).__sdkCalls.find((c: any) => c.n === 'gameplayStart').at as number;
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const res = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => new URL(e.name).origin === location.origin);
      const before = res.filter(e => e.startTime <= gs);
      return { gs, navBytes: nav.encodedBodySize, before: before.map(e => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize || e.transferSize, start: Math.round(e.startTime) })), all: res.length };
    });
    // the browser's numbers, cross-checked against the file sizes on disk (whichever is larger counts)
    const disk = (p: string) => { const f = join(DIST, decodeURIComponent(p).replace(/^\//, '') || 'index.html'); return existsSync(f) && statSync(f).isFile() ? statSync(f).size : 0; };
    const total = Math.max(r.navBytes, disk('/index.html')) + r.before.reduce((s, e) => s + Math.max(e.bytes, disk(e.path)), 0);
    const top = [...r.before].sort((a, b) => Math.max(b.bytes, disk(b.path)) - Math.max(a.bytes, disk(a.path))).slice(0, 6).map(e => `${e.path.split('/').pop()} ${(Math.max(e.bytes, disk(e.path)) / 1000).toFixed(0)} kB`);
    console.log(`[A4] gameplayStart at ${r.gs} ms; ${r.before.length + 1} of ${r.all + 1} requests started before it: ${(total / MB).toFixed(2)} MB (largest: ${top.join(', ')})`);
    expect(r.before.length).toBeGreaterThan(3);
    expect(total, 'A4: initial ≤ 3 MB').toBeLessThanOrEqual(3 * MB);
    // Brief §8.4: before gameplayStart only the tutorial sounds + music loop 1 in low quality; the rest – the full day
    // loop too – after it (phase 2 starts on the first gameplayStart). Waits until musicDay has been requested, so the
    // check is never vacuous, and compares with the moment phase 2 was queued (not only with gameplayStart: on a slow
    // machine even the boot bundle is requested after gameplayStart).
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/musicDay.mp3')), null, { timeout: 30_000 });
    const au = await page.evaluate(() => {
      const gs = (window as unknown as Win).__sdkCalls.find((c: any) => c.n === 'gameplayStart').at as number;
      return { gs, phase2At: (window as unknown as Win).__audio.debug().phase2At as number, audio: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => /\/audio\/[^/]+\.mp3$/.test(e.name)).map(e => ({ id: e.name.split('/').pop()!.slice(0, -4), start: Math.round(e.startTime) })) };
    });
    const p2 = await page.evaluate(() => (window as unknown as Win).__p2 as { early: boolean; seen: number });
    expect(p2.seen, 'audio runtime probed before phase 2').toBeGreaterThan(0);
    expect(p2.early, '§8.4: musicDay is not queued with the boot bundle').toBe(false);
    const initial = new Set<string>([...INITIAL, ...INITIAL_MUSIC]);
    const md = au.audio.find(a => a.id === 'musicDay')!;
    console.log(`[A4] audio: gameplayStart ${au.gs} ms, phase 2 queued at ${Math.round(au.phase2At)} ms, musicDay requested at ${md.start} ms; before gameplayStart: ${au.audio.filter(a => a.start <= au.gs).map(a => a.id).join(', ') || '–'}`);
    // phase 2 starts on gameplayStart, or after 3 s when the SDK never reports one (offline fallback, src/audio/audio.ts)
    expect(au.phase2At, 'phase 2 starts after gameplayStart').toBeGreaterThanOrEqual(Math.min(au.gs, 3000));
    expect(md.start, '§8.4: musicDay is requested with phase 2, not with the boot bundle').toBeGreaterThanOrEqual(Math.floor(au.phase2At));
    expect(au.audio.filter(a => a.start <= au.gs && !initial.has(a.id)).map(a => a.id), '§8.4: nothing but the initial bundle before gameplayStart').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- A6
/**
 * A6 "0 console errors and 0 pageerrors in a 10-min bot session". §12.2 does not say game time; where the brief means
 * wall-clock time it says so (C3 "über 10 min Echtzeit"), and its 1× game time IS real time (§4.2 "Echtzeit bei 1×").
 * Both readings are covered: the casual bot plays for 10 real minutes (normal ticker, rendering on) at 2× speed, and the
 * test also requires ≥ 10 min of game time (SwiftShader frames are slow and dt is capped at 0.1 s per frame, so 2× keeps
 * game time ahead of the wall clock). Saving is off in bot sessions (sandbox), so the session cannot leak into others.
 */
test.describe('A6 long bot session', () => {
  test('A6 0 console errors and 0 pageerrors in a 10-minute casual-bot session (10 min wall clock and ≥ 10 min game time)', async ({ page }) => {
    const WALL_MS = 10 * 60_000;
    test.setTimeout(WALL_MS + 240_000);
    const errors: string[] = [], warnings: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); else if (m.type() === 'warning') warnings.push(m.text()); });
    const guard = await setup(page);
    await gotoGame(page, 'bot=casual&speed=2', 0);
    const t0 = Date.now();
    const marks: string[] = [];
    while (Date.now() - t0 < WALL_MS) {
      await page.waitForTimeout(30_000);
      const s = await page.evaluate(() => { const w = (window as unknown as Win).__sim; return { rt: w.rtMs, rooms: w.rooms.length, released: w.stats.released, coins: Math.round(w.coins) }; });
      marks.push(`${Math.round((Date.now() - t0) / 1000)}s: game ${Math.round(s.rt / 1000)}s, ${s.rooms} rooms, ${s.released} released`);
    }
    // keep going until the game clock has passed 10 min too (it normally already has)
    await page.waitForFunction(() => (window as unknown as Win).__sim.rtMs >= 600_000, null, { timeout: 180_000 });
    const end = await page.evaluate(() => { const g = window as unknown as Win, w = g.__sim; return { rt: w.rtMs, rooms: w.rooms.map((r: any) => r.type), released: w.stats.released, tutorialDone: w.tutorial.done, invariants: w.events.filter((e: any) => e.type === 'invariant').length }; });
    console.log(`[A6] ${marks.join(' | ')}`);
    console.log(`[A6] end: wall ${Math.round((Date.now() - t0) / 1000)} s, game ${Math.round(end.rt / 1000)} s, rooms ${end.rooms.join(',')}, released ${end.released}; console warnings ${warnings.length}${warnings.length ? ' (' + [...new Set(warnings)].slice(0, 3).join(' / ') + ')' : ''}`);
    expect(Date.now() - t0, '10 min of wall-clock time').toBeGreaterThanOrEqual(WALL_MS);
    expect(end.rt, '≥ 10 min of game time').toBeGreaterThanOrEqual(600_000);
    expect(end.tutorialDone && end.released > 0 && end.rooms.length > 4, 'the bot really played').toBe(true);
    expect(guard.foreign).toEqual([]);
    expect(errors, 'A6: console errors + pageerrors').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- G
const dbg = (page: Page) => page.evaluate(() => {
  const d = (window as unknown as Win).__audio.debug();
  return { ctx: d.ctxState as string, muted: d.muted as boolean, reasons: d.reasons as string[], target: d.targets.master as number, master: d.master as number | null };
});
/** a UI sound right now: logged by the mixer, skipped with 'muted' while muted (dedupe-safe: a fresh id each time) */
const tryPlay = (page: Page, id: string) => page.evaluate(n => { const g = window as unknown as Win; g.__audio.mixer.play(n, { src: 'ui' }); const l = g.__audioLog as any[]; return l[l.length - 1]; }, id);
/** wait until the master gain has ramped (setTargetAtTime, 12–50 ms time constants) */
const settle = (page: Page) => page.waitForTimeout(500);
async function unlockedGame(page: Page, mock: Record<string, unknown> = {}) {
  await page.addInitScript(instr);
  await setup(page, { mock });
  await gotoGame(page, '', 500);
  await hook(page);
  // the first tap (the honking ferry) unlocks the AudioContext (Brief §8.4)
  const ring = await page.evaluate(() => { const r = document.querySelector('.tu-ring.on') as HTMLElement | null; const m = r && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(r.style.transform); return m ? { x: +m[1], y: +m[2] } : null; });
  await page.mouse.click(ring?.x ?? 640, ring?.y ?? 400);
  await page.waitForFunction(() => (window as unknown as Win).__audio.debug().ctxState === 'running', null, { timeout: 10_000 });
  await settle(page);
}

test.describe('G audio muting', () => {
  test('G mute via SDK (muteAudio wins over the in-game toggle), via ad (BASIC: no ad API ever called – the ad reason is exercised directly), via hidden tab (no gameplayStop)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await unlockedGame(page);
    let d = await dbg(page);
    expect(d).toMatchObject({ ctx: 'running', muted: false, target: 1 });
    expect(d.master!).toBeGreaterThan(0.9);
    expect((await tryPlay(page, 'click')).skip).toBeUndefined();
    // --- SDK settings.muteAudio (settings change listener)
    await page.evaluate(() => (window as unknown as Win).__sdkMock.setMute(true));
    await settle(page);
    d = await dbg(page);
    expect(d.reasons, 'G: SDK mute').toContain('sdk');
    expect(d.muted).toBe(true);
    expect(d.master!, 'master gain silent').toBeLessThan(0.01);
    expect((await tryPlay(page, 'stamp')).skip, 'a sound while SDK-muted is not played').toBe('muted');
    // the in-game toggle cannot lift it
    await page.evaluate(() => { const c = (window as unknown as Win).__ctx; c.settings.set({ ...c.settings.get(), mute: false }); });
    await settle(page);
    expect((await dbg(page)).muted, 'SDK mute beats settings').toBe(true);
    await page.evaluate(() => (window as unknown as Win).__sdkMock.setMute(false));
    await settle(page);
    d = await dbg(page);
    expect(d.muted).toBe(false);
    expect(d.master!).toBeGreaterThan(0.9);
    // --- ads: the BASIC build has no ad UI and never calls the ad module (Brief §11.2, §12.10), so "muted during an ad"
    //     can only be exercised on the mixer reason the FULL build's adStarted/adFinished callbacks set (audio.setMuted('ad'))
    const build = await page.evaluate(() => { const c = (window as unknown as Win).__ctx; c.openModal('settings'); const v = document.querySelector('.ov-version')?.textContent ?? ''; c.closeModal(); return v; });
    expect(build, 'this is the BASIC build').toMatch(/BASIC/);
    await page.evaluate(() => (window as unknown as Win).__audio.mixer.setReason('ad', true, true));
    await settle(page);
    d = await dbg(page);
    expect(d.reasons).toContain('ad');
    expect(d.master!, 'G: muted while an ad runs').toBeLessThan(0.01);
    expect((await tryPlay(page, 'hire')).skip).toBe('muted');
    await page.evaluate(() => (window as unknown as Win).__audio.mixer.setReason('ad', false, true));
    await settle(page);
    expect((await dbg(page)).muted).toBe(false);
    // --- hidden tab
    const stopsBefore = await page.evaluate(() => (window as unknown as Win).__sdkCalls.filter((c: any) => c.n === 'gameplayStop').length);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await settle(page);
    d = await dbg(page);
    expect(d.reasons, 'G: hidden tab').toContain('hidden');
    expect(d.master!).toBeLessThan(0.01);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await settle(page);
    d = await dbg(page);
    expect(d.muted).toBe(false);
    expect(d.master!).toBeGreaterThan(0.9);
    const calls = await page.evaluate(() => ((window as unknown as Win).__sdkCalls as any[]).map(c => c.n));
    expect(calls.filter(n => n === 'gameplayStop').length - stopsBefore, 'no gameplayStop for a hidden tab').toBe(0);
    expect(calls.filter(n => /^(requestAd|hasAdblock)$/.test(n)), 'BASIC: no ad call').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('G/C4 hidden + CDP frozen lifecycle: rendering pauses, audio is muted, no gameplayStop; everything resumes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await unlockedGame(page);
    // count ticker frames (the Pixi ticker runs the sim, the scene update and the render: Application's TickerPlugin);
    // record what the page sees if the browser really freezes it (listener added after the game's)
    await page.evaluate(() => {
      const g = window as unknown as Win;
      g.__renders = 0; g.__game.app.ticker.add(() => { g.__renders++; });
      g.__frozenAudio = null;
      document.addEventListener('freeze', () => { g.__frozenAudio = g.__audio.debug(); });
    });
    const state = () => page.evaluate(() => { const g = window as unknown as Win; return { frame: g.__fxFrame as number, rt: g.__sim.rtMs as number, renders: g.__renders as number, stops: g.__sdkCalls.filter((c: any) => c.n === 'gameplayStop').length as number, audio: g.__audio.debug() }; });
    const setVis = (hidden: boolean) => page.evaluate(h => {
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await page.waitForTimeout(500);
    const s0 = await state();
    // C4 exactly: visibilityState overridden to hidden + visibilitychange, plus CDP Page.setWebLifecycleState frozen
    const cdp = await page.context().newCDPSession(page);
    await setVis(true);
    const s1 = await state();
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await page.waitForTimeout(2500);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    const s2 = await state();
    const frozen = await page.evaluate(() => (window as unknown as Win).__frozenAudio);
    console.log(`[C4] hidden+frozen 2.5 s: renders ${s1.renders}→${s2.renders}, frames ${s1.frame}→${s2.frame}, game time ${s1.rt}→${s2.rt}; browser freeze event ${frozen ? 'received' : 'not fired (this headless build accepts the CDP call without freezing a visible page)'}`);
    expect(s1.renders, 'it rendered before').toBeGreaterThan(0);
    expect(s2.renders - s1.renders, 'C4: rendering paused').toBeLessThanOrEqual(1);
    expect(s2.frame - s1.frame, 'C4: no frames while hidden').toBeLessThanOrEqual(1);
    expect(s2.audio.muted, 'C4: audio muted').toBe(true);
    expect(s2.audio.reasons).toContain('hidden');
    expect(s2.audio.master, 'master gain silent').toBeLessThan(0.01);
    if (frozen) expect(frozen.muted, 'muted at the freeze event').toBe(true);
    expect(s2.stops - s0.stops, 'C4: no gameplayStop').toBe(0);
    // back: visible → frames run, sound returns, still no gameplayStop
    await setVis(false);
    await page.waitForTimeout(1500);
    const s3 = await state();
    expect(s3.renders, 'rendering resumes').toBeGreaterThan(s2.renders + 2);
    expect(s3.rt, 'the game runs again').toBeGreaterThan(s2.rt);
    expect(s3.audio.muted).toBe(false);
    expect(s3.stops - s0.stops).toBe(0);
    // the page lifecycle 'freeze' / 'resume' events (what Chrome fires when it freezes a background tab) mute on their own
    await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
    await settle(page);
    let d = await dbg(page);
    expect(d.muted, 'freeze event mutes').toBe(true);
    expect(d.master!).toBeLessThan(0.01);
    await page.evaluate(() => document.dispatchEvent(new Event('resume')));
    await settle(page);
    d = await dbg(page);
    expect(d.muted, 'resume (visible) unmutes').toBe(false);
    expect(errors).toEqual([]);
  });

  test('G the mute state lives in the save: toggled in Settings, written to the SDK data module, muted again after a reload (before and after the first tap)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await unlockedGame(page, { persist: true });
    await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
    await page.locator('.ov-modal [data-fid="sw-mute"]').click();
    await settle(page);
    let d = await dbg(page);
    expect(d.muted, 'the Settings toggle mutes').toBe(true);
    expect(d.master!).toBeLessThan(0.01);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as unknown as Win).__sdkMock.dataWrites.length > 0, null, { timeout: 10_000 });
    await page.evaluate(() => (window as unknown as Win).__save.flush());
    // only the save slots hold it – no separate localStorage key for audio
    const ls = await page.evaluate(() => Object.keys(localStorage));
    expect(ls.filter(k => /mute|audio|volume|sound/i.test(k))).toEqual([]);
    const keys = await page.evaluate(() => Object.keys((window as unknown as Win).__sdkMock.store));
    expect(keys.some(k => k.startsWith('rrl_save'))).toBe(true);
    await page.reload();
    await page.waitForFunction(() => { const g = window as unknown as Win; return !!g.__ctx && !!g.__audio && !!document.getElementById('boot')?.classList.contains('gone'); }, null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().loaded), 'the save was loaded').toBe('ok');
    d = await dbg(page);
    expect(d.muted, 'G: muted from the save before any tap').toBe(true);
    expect(await page.evaluate(() => (window as unknown as Win).__ctx.settings.get().mute)).toBe(true);
    await page.mouse.click(640, 400);
    await page.waitForFunction(() => (window as unknown as Win).__audio.debug().ctxState === 'running', null, { timeout: 10_000 });
    await settle(page);
    d = await dbg(page);
    expect(d.muted, 'still muted after the unlock').toBe(true);
    expect(d.master!).toBeLessThan(0.01);
    expect((await tryPlay(page, 'stamp')).skip).toBe('muted');
    expect(errors).toEqual([]);
  });
});
