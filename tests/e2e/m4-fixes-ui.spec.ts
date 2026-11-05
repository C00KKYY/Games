/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * M4 integration-review fixes (UI): "Reset progress" on the SDK data module, honest credits that fit, the first room
 * framed clear of the clipboard, the warden bubble never over the room panel / toasts / the current target, and the
 * controls overlay bottom left without covering the ferry, the clipboard, the build bar or the bubble.
 *
 * Game time is stepped explicitly (?capture=1 + window.__step) – deterministic and independent of SwiftShader speed.
 * While sampling many frames the canvas render is switched off (DOM layers only); screenshots render again.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { setup, gotoGame } from './helpers';

type Win = Record<string, any>;
type R = [number, number, number, number]; // l, t, r, b
const CG = 'https://game.crazygames.com/';
/** screenshots: M4FIX_SHOTS (absolute dir) or test-results/ (git-ignored) */
const SHOTS = process.env.M4FIX_SHOTS ?? 'test-results/m4-fixes-ui';

// ---------------------------------------------------------------------------------------------------------- helpers
async function serveOnCrazyGames(page: Page, baseURL: string) {
  const base = baseURL.replace(/\/$/, '');
  await page.route(/^https:\/\/game\.crazygames\.com\//, async route => {
    const u = new URL(route.request().url());
    try { await route.fulfill({ response: await route.fetch({ url: base + u.pathname + u.search }) }); } catch { await route.abort().catch(() => undefined); }
  });
}
async function waitBoot(page: Page) {
  await page.waitForFunction(() => { const g = window as unknown as Win; return !!g.__ctx && !!g.__game && !!document.getElementById('boot')?.classList.contains('gone'); }, null, { timeout: 60_000 });
}
const roomsAt = (page: Page) => page.evaluate(() => ((window as unknown as Win).__sim.rooms as { type: string; x: number; y: number }[]).map(r => `${r.type}@${r.x},${r.y}`).sort());
const step = (page: Page, n: number) => page.evaluate(k => (window as unknown as Win).__step(k), n);
/** canvas render off/on: sampling hundreds of frames only needs the DOM layers */
const renderOff = (page: Page) => page.evaluate(() => { const a = (window as unknown as Win).__game.app; a.__render ??= a.render; a.render = () => undefined; });
const renderOn = (page: Page) => page.evaluate(() => { const a = (window as unknown as Win).__game.app; if (a.__render) a.render = a.__render; a.render(); });
const area = (a: R, b: R) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await renderOn(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 90_000 });
}
/** fresh game in capture mode; the horn is tapped on the first honk when `horn` is set */
async function fresh(page: Page, lang: string) {
  await setup(page);
  await gotoGame(page, `capture=1&lang=${lang}`, 0);
  await step(page, 2);
}

/**
 * In-page sampler: steps `n` frames one by one and measures, after every frame, the warden bubble against the open room
 * panel, every toast and the current tutorial target (the hand's aim, screen px) – plus the controls overlay against the
 * target, the clipboard, the build bar and the bubble. Returns overlap samples (area > 0.5 px²) with a description.
 */
async function sample(page: Page, n: number, tag: string) {
  return page.evaluate(([k, tg]) => {
    const g = window as unknown as Win;
    // laid out and not visibility:hidden – opacity is ignored on purpose: CSS fade-ins run on wall-clock time and stand
    // still while this loop runs, a panel / toast that is fading in already covers its area
    const rect = (el: Element | null): R | null => {
      if (!el || !(el as HTMLElement).checkVisibility?.({ visibilityProperty: true })) return null;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 ? [b.left, b.top, b.right, b.bottom] : null;
    };
    const ar = (a: R, b: R) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const bad: string[] = [];
    let bubbleFrames = 0, ctlFrames = 0, panelFrames = 0, toastFrames = 0, miniFrames = 0, awayFrames = 0;
    for (let i = 0; i < k; i++) {
      g.__step(1);
      const bub = document.querySelector('.tu-bub.on') ? rect(document.querySelector('.tu-bub')) : null;
      const a = g.__tutorial.aim();
      const target: R | null = a ? [a.x - a.r, a.y - a.r, a.x + a.r, a.y + a.r] : null;
      const pn = rect(document.querySelector('.pn:not([hidden])'));
      const toasts = [...document.querySelectorAll('.ov-toast')].map(rect).filter((x): x is R => !!x);
      const ctl = document.querySelector('.tu-ctl.on') ? rect(document.querySelector('.tu-ctl')) : null;
      const clip = rect(document.querySelector('.cb-card')) ?? rect(document.querySelector('.cb-chip'));
      const bar = rect(document.querySelector('[data-hud="bottom"]'));
      const at = `${tg} f${i} step ${g.__sim.tutorial.step} aim ${a?.key ?? '-'}`;
      if (pn) panelFrames++;
      if (g.__tutorial.away()) awayFrames++;
      if (toasts.length) toastFrames++;
      if (bub) {
        bubbleFrames++;
        if (g.__tutorial.mini()) miniFrames++;
        if (pn && ar(bub, pn) > 0.5) bad.push(`${at}: bubble ${bub.map(Math.round)} over panel ${pn.map(Math.round)}`);
        for (const t of toasts) if (ar(bub, t) > 0.5) bad.push(`${at}: bubble ${bub.map(Math.round)} over toast ${t.map(Math.round)}`);
        if (target && ar(bub, target) > 0.5) bad.push(`${at}: bubble ${bub.map(Math.round)} over target ${target.map(Math.round)}`);
      }
      if (ctl) {
        ctlFrames++;
        const ctlTarget = a?.key === 'ferry' || a?.key === 'ghost' ? target : null;
        if (ctlTarget && ar(ctl, ctlTarget) > 0.5) bad.push(`${at}: controls ${ctl.map(Math.round)} over target ${ctlTarget.map(Math.round)}`);
        if (clip && ar(ctl, clip) > 0.5) bad.push(`${at}: controls over clipboard`);
        if (bar && ar(ctl, bar) > 0.5) bad.push(`${at}: controls over build bar`);
        if (bub && ar(ctl, bub) > 0.5) bad.push(`${at}: controls ${ctl.map(Math.round)} over bubble ${bub.map(Math.round)}`);
      }
    }
    return { bad, bubbleFrames, ctlFrames, panelFrames, toastFrames, miniFrames, awayFrames };
  }, [n, tag] as const);
}

// ---------------------------------------------------------------------------------------------------------- 1 reset
test.describe('M4 fix: Reset progress', () => {
  test('crazygames.com (SDK data module): build, Settings → Reset → confirm → fresh world, no save slot left in the data module', async ({ page, baseURL }) => {
    await setup(page, { mock: { persist: true } });
    await serveOnCrazyGames(page, baseURL!);
    await page.goto(CG);
    await waitBoot(page);
    expect(await page.evaluate(() => (window as unknown as Win).__save.state().saveState)).toBe('ok');
    expect(await page.evaluate(() => (window as unknown as Win).__platform.storageKind())).not.toBe('local-fallback');
    const built = await page.evaluate(() => { const g = window as unknown as Win; return g.__ctx.cmd.build(g.__sim, 'wash', 1, 13, 3, 3).ok as boolean; });
    expect(built).toBe(true);
    await page.evaluate(() => { const g = window as unknown as Win; g.__save.flush(); g.__sim.coins += 1; g.__save.flush(); });
    expect(await page.evaluate(() => Object.keys((window as unknown as Win).__sdkMock.store).sort())).toEqual(['rrl_save_a', 'rrl_save_b']);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rrl')))).toEqual([]);

    await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
    await page.locator('.ov-modal [data-fid="reset"]').click();
    await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), page.locator('.ov-modal [data-fid="reset-yes"]').click()]);
    await waitBoot(page);
    // the persisted mock data module (sessionStorage mirror) survived the reload – minus the save slots
    const after = await page.evaluate(() => ({ store: Object.keys((window as unknown as Win).__sdkMock.store), loaded: (window as unknown as Win).__save.state().loaded }));
    expect(after.store.filter(k => k.startsWith('rrl_save'))).toEqual([]);
    expect(after.loaded).toBe('none');
    expect(await roomsAt(page)).not.toContain('wash@1,13');
    expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.active)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------- 2 credits
test.describe('M4 fix: credits', () => {
  for (const [w, h] of [[800, 450], [1920, 1080]] as const) {
    for (const lang of ['en', 'de']) {
      test(`credits are true and fit @ ${w}x${h} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await setup(page);
        await gotoGame(page, `lang=${lang}&nosave`, 300);
        await page.evaluate(() => (window as unknown as Win).__ctx.openModal('settings'));
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const card = document.querySelector('.ov-card')!, body = document.querySelector<HTMLElement>('.ov-body')!;
          const sec = [...document.querySelectorAll('.ov-sec')].at(-1)!;
          sec.scrollIntoView({ block: 'end' });
          const ps = [...sec.querySelectorAll('p')];
          const cr = card.getBoundingClientRect();
          const spill = ps.filter(p => p.scrollWidth > p.clientWidth + 1 || p.getBoundingClientRect().right > cr.right + 0.5 || p.getBoundingClientRect().left < cr.left - 0.5).map(p => p.textContent);
          const sizes = ps.map(p => parseFloat(getComputedStyle(p).fontSize));
          return {
            text: ps.map(p => p.textContent).join('\n'),
            card: [cr.left, cr.top, cr.right, cr.bottom], spill, minFont: Math.min(...sizes),
            bodyScrollX: body.scrollWidth - body.clientWidth, overflowY: getComputedStyle(body).overflowY,
            lastVisible: (() => { const b = ps.at(-1)!.getBoundingClientRect(), bb = body.getBoundingClientRect(); return b.bottom <= bb.bottom + 1 && b.top >= bb.top - 1; })(),
          };
        });
        console.log(`[credits ${w}x${h} ${lang}] card ${r.card.map(Math.round)} min font ${r.minFont}px\n${r.text}`);
        expect(r.text).toContain('dklon');
        expect(r.text).toContain('CC BY 3.0');
        expect(r.text).toContain('opengameart.org/content/whistles');
        expect(r.text).toContain('HoliznaCC0');
        expect(r.text).toContain('Kenney');
        expect(r.text).not.toMatch(/ZzFX/i);
        expect(r.text).not.toMatch(/music were made|Musik wurden/);
        expect(r.card[0]).toBeGreaterThanOrEqual(0); expect(r.card[1]).toBeGreaterThanOrEqual(0);
        expect(r.card[2]).toBeLessThanOrEqual(w); expect(r.card[3]).toBeLessThanOrEqual(h);
        expect(r.spill).toEqual([]);
        expect(r.bodyScrollX).toBeLessThanOrEqual(0);
        expect(r.minFont).toBeGreaterThanOrEqual(12);
        expect(r.lastVisible, 'the last credits line can be scrolled into view').toBe(true);
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/credits-${w}x${h}-${lang}.png`, timeout: 60_000 });
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------- 3 framing
/** every painted HUD block that may cover the world */
const hudRects = (page: Page) => page.evaluate(() => {
  const out: { what: string; r: R }[] = [];
  const add = (what: string, el: Element | null) => {
    if (!el || !(el as HTMLElement).checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) return;
    const b = el.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) out.push({ what, r: [b.left, b.top, b.right, b.bottom] });
  };
  document.querySelectorAll('[data-hud]').forEach(e => add(`[data-hud=${(e as HTMLElement).dataset.hud}]`, e));
  add('.cb-card', document.querySelector('.cb-card')); add('.cb-chip', document.querySelector('.cb-chip'));
  if (document.querySelector('.tu-bub.on')) add('.tu-bub', document.querySelector('.tu-bub'));
  if (document.querySelector('.tu-ctl.on')) add('.tu-ctl', document.querySelector('.tu-ctl'));
  document.querySelectorAll('.ov-toast').forEach(e => add('.ov-toast', e));
  add('.pn', document.querySelector('.pn:not([hidden])'));
  return out;
});

test.describe('M4 fix: first room framed clear of the HUD', () => {
  const cases = [
    { w: 907, h: 510, lang: 'en' }, { w: 907, h: 510, lang: 'de' },
    { w: 1280, h: 720, lang: 'en' }, { w: 1280, h: 720, lang: 'de' },
    { w: 800, h: 450, lang: 'en' }, { w: 800, h: 450, lang: 'de' },
  ];
  for (const c of cases) {
    test(`one-tap Wash Hut ghost, built hut and plaque fully visible, under no HUD element @ ${c.w}x${c.h} ${c.lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: c.w, height: c.h });
      await fresh(page, c.lang);
      await renderOff(page);
      // the first ferry honks → tap it → the one-tap ghost appears
      for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.querySelector('.tu-ghost.on'))); i++) {
        await page.evaluate(() => { const g = window as unknown as Win; if (g.__sim.ferry.state === 'arriving' && !g.__sim.ferry.tapped) g.__ctx.cmd.tapHorn(g.__sim); g.__step(15); });
      }
      await step(page, 45); // controls overlay / bubble settle
      const ghost = await page.evaluate(() => {
        const g = window as unknown as Win, cam = g.__game.cam, T = 32;
        const a = cam.worldToScreen(1 * T, 13 * T), b = cam.worldToScreen(4 * T, 16 * T);
        const el = document.querySelector('.tu-ghost.on')?.getBoundingClientRect(), lb = document.querySelector('.tu-ghost-lbl.on')?.getBoundingClientRect();
        return { world: [a.x, a.y, b.x, b.y] as R, dom: el ? [el.left, el.top, el.right, el.bottom] as R : null, plaque: lb ? [lb.left, lb.top, lb.right, lb.bottom] as R : null, inset: cam.inset, zoom: cam.zoom };
      });
      const hud1 = await hudRects(page);
      console.log(`[frame ${c.w}x${c.h} ${c.lang}] inset ${JSON.stringify(ghost.inset)} zoom ${ghost.zoom.toFixed(3)} ghost ${ghost.world.map(Math.round)} plaque ${ghost.plaque?.map(Math.round)}`);
      expect(ghost.dom, 'one-tap ghost shown').not.toBeNull();
      expect(ghost.plaque, 'ghost price plaque shown').not.toBeNull();
      for (const [name, r] of [['ghost (world)', ghost.world], ['ghost (DOM)', ghost.dom!], ['plaque', ghost.plaque!]] as [string, R][]) {
        expect(r[0], `${name} left on screen`).toBeGreaterThanOrEqual(0); expect(r[1], `${name} top`).toBeGreaterThanOrEqual(0);
        expect(r[2], `${name} right`).toBeLessThanOrEqual(c.w); expect(r[3], `${name} bottom`).toBeLessThanOrEqual(c.h);
        expect(hud1.filter(x => area(x.r, r) > 0.5).map(x => `${x.what} ${x.r.map(Math.round)}`), `${name} under HUD`).toEqual([]);
      }
      await shot(page, `wash-ghost-${c.w}x${c.h}-${c.lang}`);
      await renderOff(page);
      // tap the ghost → construction → built
      await page.locator('.tu-ghost.on').click();
      for (let i = 0; i < 60 && !(await page.evaluate(() => ((window as unknown as Win).__sim.rooms as any[]).some(r => r.type === 'wash' && r.built))); i++) await step(page, 30);
      await step(page, 20);
      const hut = await page.evaluate(() => {
        const g = window as unknown as Win, cam = g.__game.cam, T = 32;
        const r = (g.__sim.rooms as any[]).find(x => x.type === 'wash');
        // the hut incl. its back wall / roof sign that stands above the floor rect (1.2 tiles)
        const a = cam.worldToScreen(r.x * T, (r.y - 1.2) * T), b = cam.worldToScreen((r.x + r.w) * T, (r.y + r.h) * T);
        return { built: !!r.built, rect: [a.x, a.y, b.x, b.y] as R };
      });
      expect(hut.built).toBe(true);
      const hud2 = await hudRects(page);
      expect(hut.rect[0]).toBeGreaterThanOrEqual(0); expect(hut.rect[1]).toBeGreaterThanOrEqual(0);
      expect(hut.rect[2]).toBeLessThanOrEqual(c.w); expect(hut.rect[3]).toBeLessThanOrEqual(c.h);
      expect(hud2.filter(x => area(x.r, hut.rect) > 0.5).map(x => `${x.what} ${x.r.map(Math.round)}`), 'built Wash Hut under HUD').toEqual([]);
      await shot(page, `wash-built-${c.w}x${c.h}-${c.lang}`);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------- 4 + 7 bubble / controls
const BUBBLE_SIZES = [
  { name: '844x390 touch', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, lang: 'en' },
  { name: '800x450', viewport: { width: 800, height: 450 }, isMobile: false, hasTouch: false, lang: 'en' },
  { name: '907x510 DE', viewport: { width: 907, height: 510 }, isMobile: false, hasTouch: false, lang: 'de' },
  { name: '1280x720', viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false, lang: 'en' },
];
for (const sz of BUBBLE_SIZES) {
  test.describe(`M4 fix: tutorial layers @ ${sz.name}`, () => {
    test.use({ viewport: sz.viewport, isMobile: sz.isMobile, hasTouch: sz.hasTouch });
    test(`bubble never over the room panel, a toast or the target; controls overlay bottom left and clear (steps 1–4) @ ${sz.name}`, async ({ page }) => {
      test.setTimeout(420_000);
      const tag = sz.name.replace(/\s+/g, '-');
      await fresh(page, sz.lang);
      await renderOff(page);
      const all: string[] = [];
      const stats = { bubble: 0, ctl: 0, panel: 0, toast: 0, mini: 0, away: 0 };
      const run = async (n: number, what: string) => {
        const r = await sample(page, n, what);
        all.push(...r.bad);
        stats.bubble += r.bubbleFrames; stats.ctl += r.ctlFrames; stats.panel += r.panelFrames; stats.toast += r.toastFrames; stats.mini += r.miniFrames; stats.away += r.awayFrames;
      };
      const toast = (k: string) => page.evaluate(key => { const c = (window as unknown as Win).__ctx; c.toast(c.t(key, { day: 1, earned: c.fmt(1240), wages: c.fmt(85), released: 3 }), { kind: 'info', icon: 'coin', ms: 2500 }); }, k);
      // controls overlay placement at the start
      const slot0 = await page.evaluate(() => (window as unknown as Win).__tutorial.ctlSlot());
      const ctl0 = await page.evaluate(() => { const b = document.querySelector('.tu-ctl')!.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
      console.log(`[layers ${sz.name}] controls overlay slot ${slot0} at ${ctl0.map(Math.round)}`);
      await shot(page, `step1-horn-${tag}`);
      await renderOff(page);
      // step 1: the honking ferry (with a toast on top)
      await run(60, 'horn');
      await toast('overlays.toast.dayEnd');
      await run(60, 'horn+toast');
      for (let i = 0; i < 30 && (await page.evaluate(() => (window as unknown as Win).__sim.ferry.state !== 'arriving')); i++) await run(15, 'ferry-wait');
      await page.evaluate(() => { const g = window as unknown as Win; g.__ctx.cmd.tapHorn(g.__sim); });
      for (let i = 0; i < 40 && (await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step < 1)); i++) await run(15, 'horn→wash');
      expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step)).toBe(1);
      // step 2: one-tap ghost, then the long way (Rooms menu → Wash Hut card), back to the ghost, tap it
      await run(40, 'wash ghost');
      await shot(page, `step2-wash-${tag}`);
      await renderOff(page);
      await page.evaluate(() => (window as unknown as Win).__ctx.menu.set('rooms'));
      await run(40, 'wash rooms menu');
      await toast('overlays.toast.unpaid');
      await run(30, 'wash rooms menu+toast');
      await page.evaluate(() => (window as unknown as Win).__ctx.menu.set(null));
      await run(20, 'wash ghost again');
      await page.locator('.tu-ghost.on').click();
      for (let i = 0; i < 80 && (await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step < 2)); i++) await run(15, 'wash building');
      expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step)).toBe(2);
      // step 3: Earl showers, walks to the gate → stamp (game speed 3 for the long wait)
      await page.evaluate(() => { (window as unknown as Win).__sim.speed = 3; });
      await shot(page, `step3-stamp-${tag}`);
      await renderOff(page);
      for (let i = 0; i < 200 && (await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step < 3)); i++) {
        await run(15, 'stamp');
        await page.evaluate(() => { const g = window as unknown as Win; if (g.__sim.agents.some((a: any) => a.state === 'atGate')) g.__ctx.cmd.stamp(g.__sim); });
      }
      expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step)).toBe(3);
      await page.evaluate(() => { (window as unknown as Win).__sim.speed = 1; });
      // step 4: the canteen, then its room panel (the upgrade button is the target) – with a toast while it is open
      await run(30, 'upgrade canteen');
      await page.evaluate(() => { const g = window as unknown as Win; const c = (g.__sim.rooms as any[]).find(r => r.type === 'canteen'); g.__ctx.selection.set({ kind: 'room', id: c.id }); });
      await run(60, 'upgrade panel');
      await toast('overlays.toast.dayEnd');
      await run(60, 'upgrade panel+toast');
      await shot(page, `step4-panel-${tag}`);
      await renderOff(page);
      await run(10, 'upgrade panel after shot');
      console.log(`[layers ${sz.name}] frames: bubble ${stats.bubble}, controls ${stats.ctl}, panel open ${stats.panel}, toast ${stats.toast}, mini bubble ${stats.mini}, bubble stepped aside ${stats.away}; overlap samples ${all.length}`);
      if (all.length) console.log(all.slice(0, 20).join('\n'));
      expect(stats.panel, 'panel frames sampled').toBeGreaterThan(50);
      expect(stats.toast, 'toast frames sampled').toBeGreaterThan(50);
      expect(stats.ctl, 'controls overlay frames sampled').toBeGreaterThan(50);
      expect(all).toEqual([]);
      expect(slot0, 'controls overlay starts on the left').toMatch(/^(bl|bla|lc):/);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------- 7b one Skip
test.describe('M4 fix: one Skip on screen', () => {
  test('wide: the clipboard hides its Skip while the bubble shows one; Skip at 3 s → the clipboard shows the Wash Hut goal at once', async ({ page }) => {
    await fresh(page, 'en');
    await step(page, 10);
    const vis = (sel: string) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0), sel);
    expect(await vis('.tu-bub.on .tu-skip')).toBe(true);
    expect(await vis('.cb-skip')).toBe(false);
    expect(await page.locator('.tu-skip').getAttribute('aria-label')).toBeTruthy();
    for (let i = 0; i < 6 && (await page.evaluate(() => (window as unknown as Win).__sim.rtMs < 3000)); i++) await step(page, 15);
    await page.locator('.tu-skip').click();
    await step(page, 2);
    expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.skipped)).toBe(true);
    await expect(page.locator('.cb-goal-txt')).toContainText('Wash Hut');
    expect(await vis('.tu-bub.on')).toBe(false);
  });
  test('compact 800×450: the expanded clipboard card brings its own Skip back (the bubble steps aside); collapsed → bubble again', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 450 });
    await fresh(page, 'en');
    await step(page, 10);
    const vis = (sel: string) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0), sel);
    expect(await vis('.tu-bub.on')).toBe(true);
    await page.locator('.cb-chip').click();
    await step(page, 4);
    expect(await vis('.cb-skip')).toBe(true);
    expect(await vis('.tu-bub.on')).toBe(false);
    await page.keyboard.press('Escape');
    await step(page, 4);
    expect(await vis('.tu-bub.on')).toBe(true);
    expect(await vis('.cb-skip')).toBe(false);
  });
});
