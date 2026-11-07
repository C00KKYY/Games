/* eslint-disable @typescript-eslint/no-explicit-any -- in-page code reads untyped window hooks (__ctx, __sim, __sdkCalls) */
/**
 * M5 UI acceptance (docs/M5_DESIGN.md §12, Brief §3.11–§3.17, §5, §12.3 B1 screens, H6): project board, leads hire
 * dialog, daily mail, inspection forecast / walk / result, transfer + perks, return panel, catch-up chip, save check,
 * off-screen edge hints, event banner, toasts at the night skip, Esc routing, pause pairing, EN/DE, compact + touch.
 * World states are planted through window.__ctx (the UI reads the same fields the sim fills), so this spec tests the UI
 * contract independently of the sim balance. Game time is stepped (?capture=1 + window.__step, 30 frames = 1 s).
 * Screenshots: qa/tmp/m5-ui/<lang>-<size>/<state>.png (gitignored, for review).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, gotoGame } from './helpers';
import { enterM5, plantM5, visible, settleCss, type M5Screen } from './states';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = join(ROOT, 'qa/tmp/m5-ui');
const step = (page: Page, n: number) => page.evaluate(k => (window as any).__step(k), n);
const ctxDo = <T>(page: Page, fn: (ctx: any, w: any) => T) => page.evaluate(`(${fn.toString()})(window.__ctx, window.__ctx.w)`) as Promise<T>;

/** fresh game, tutorial skipped (the M5 HUD only shows after the tutorial), stepped clock */
async function fresh(page: Page, lang = 'en', extra = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const guard = await setup(page);
  await gotoGame(page, `lang=${lang}&capture=1${extra}`, 0);
  await ctxDo(page, (ctx, w) => { if (!w.tutorial.done) ctx.cmd.skipTutorial(w); });
  await step(page, 45);
  return { errors, guard };
}

/** every visible M5 button: aria-label + data-tip; on touch ≥ 44×44; text ≥ 12 px; no "coming soon" anywhere */
async function auditM5(page: Page, touch: boolean) {
  return page.evaluate(t => {
    const out: string[] = [];
    const scope = '.m5p, .m5-card, .m5-rail, .m5-banners, .m5-ret, .m5-edge, .bb-projects, .bb-office, .m5-plaque';
    const vis = (e: Element) => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
    for (const root of document.querySelectorAll(scope)) {
      if (!vis(root)) continue;
      const btns = root.matches('button') ? [root] : [...root.querySelectorAll('button')];
      for (const b of btns) {
        if (!vis(b)) continue;
        const r = b.getBoundingClientRect(), name = (b.className || b.tagName).toString().split(' ').slice(0, 2).join('.');
        if (!b.getAttribute('aria-label')) out.push(`no aria-label: ${name}`);
        if (!(b as HTMLElement).dataset.tip) out.push(`no data-tip: ${name}`);
        if (t && (r.width < 43.5 || r.height < 43.5)) out.push(`touch target ${Math.round(r.width)}×${Math.round(r.height)}: ${name}`);
        if (!t && (r.width < 31.5 || r.height < 31.5)) out.push(`target ${Math.round(r.width)}×${Math.round(r.height)}: ${name}`);
        // inside a scrolling panel body a button may be scrolled out of view – that is not off-screen
        if (!b.closest('.m5p-body, .ov-body') && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) out.push(`off-screen: ${name}`);
      }
      const rr = root.getBoundingClientRect();
      if (rr.left < -1 || rr.top < -1 || rr.right > innerWidth + 1 || rr.bottom > innerHeight + 1) out.push(`panel off-screen: ${(root.className || '').toString().split(' ').slice(0, 2).join('.')} [${[rr.left, rr.top, rr.right, rr.bottom].map(Math.round)}]`);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent!.trim() || !vis(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 11.95) out.push(`text ${px}px: "${n.textContent!.trim().slice(0, 30)}"`);
      }
    }
    if (/coming soon|demnächst|bald verfügbar/i.test(document.querySelector('.hud')!.textContent ?? '')) out.push('"coming soon" text');
    return out;
  }, touch);
}

async function shot(page: Page, dir: string, name: string) {
  const d = join(SHOTS, dir); mkdirSync(d, { recursive: true });
  await page.screenshot({ path: join(d, `${name}.png`) });
}

/** plant + open the extra (non-B1) M5 states */
type Extra = 'mail' | 'leadsDialog' | 'forecast' | 'walk' | 'catchUp' | 'edge';
async function plantExtra(page: Page, s: Extra) {
  await ctxDo(page, (ctx, w) => { ctx.panel.set(null); ctx.setPaused(false); w.offline.pending = null; ctx.catchUp.set(null); });
  switch (s) {
    case 'mail':
      await ctxDo(page, (ctx, w) => {
        w.mail.visible = true; w.mail.day = 5; w.mail.seenDay = 4; w.mail.streak = 2;
        w.mail.count.released = 3; w.mail.count.cratesSold = 12;
        w.mail.tasks = [
          { id: 'release', target: 3, base: 0, done: true, claimed: false, reward: 240 },
          { id: 'crates', target: 40, base: 0, done: false, claimed: false, reward: 240 },
          { id: 'earn', target: 5000, base: 0, done: false, claimed: true, reward: 240 },
        ];
        ctx.panel.set('mail');
      });
      break;
    case 'leadsDialog':
      await ctxDo(page, (ctx, w) => { w.ruf = Math.max(w.ruf, 380); w.coins = Math.max(w.coins, 2000); w.taps.horn = 34; ctx.panel.set('leads'); });
      await step(page, 6);
      await page.locator('.ld-hire').first().click();
      break;
    case 'forecast':
      await ctxDo(page, (ctx, w) => { w.unlocked.inspection = true; ctx.panel.set('forecast'); });
      break;
    case 'walk':
      await ctxDo(page, (_ctx, w) => {
        w.inspection.phase = 'walking'; w.inspection.startMs = w.rtMs - 12_000;
        const d = w.poi.officeDoor; w.inspection.walker = { x: d.x, y: d.y, dir: 'E', moving: true, wp: 0 }; w.inspection.route = [d, w.poi.gateOut];
      });
      break;
    case 'catchUp':
      await ctxDo(page, ctx => ctx.catchUp.set({ mode: 'catchup', left: 1200, total: 3000 }));
      break;
    case 'edge':
      await ctxDo(page, (ctx, w) => {
        const a = w.agents.find((x: any) => x.kind === 'rascal' && x.state !== 'leaving');
        if (a) { a.state = 'escaping'; a.x = 30.5; a.y = 2.5; }
        ctx.cam.x = 0; ctx.cam.y = 24 * 32; ctx.cam.zoom = 1.6;
      });
      break;
  }
  await step(page, 12);
  await page.mouse.move(2, 2);
  await settleCss(page);
}
const EXTRA_PROBE: Record<Extra, string> = { mail: '.m5p.ml', leadsDialog: '.ld-quote', forecast: '.m5p.in-fc', walk: '.in-walk', catchUp: '.ret-catch', edge: '.eh-escape' };

// ====================================================================== screens: EN/DE × desktop / compact / touch
const SIZES = [
  { tag: '1280x720', viewport: { width: 1280, height: 720 }, touch: false },
  { tag: '800x450', viewport: { width: 800, height: 450 }, touch: false },
  { tag: '844x390-touch', viewport: { width: 844, height: 390 }, touch: true },
];
for (const lang of ['en', 'de']) for (const sz of SIZES) {
  test(`M5 screens ${lang} ${sz.tag}: labels, tooltips, targets, text size, no "coming soon"`, async ({ browser }) => {
    test.setTimeout(300_000);
    const c = await browser.newContext({ viewport: sz.viewport, deviceScaleFactor: 1, ...(sz.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await c.newPage();
    try {
      const { errors, guard } = await fresh(page, lang, '&bot=casual&warp=300');
      const problems: string[] = [];
      for (const s of ['projects', 'returnPanel', 'inspectionResult', 'transfer'] as M5Screen[]) {
        await ctxDo(page, ctx => { ctx.panel.set(null); ctx.setPaused(false); ctx.w.offline.pending = null; });
        await enterM5(page, s);
        await page.mouse.move(2, 2);
        await shot(page, `${lang}-${sz.tag}`, s);
        for (const p of await auditM5(page, sz.touch)) problems.push(`${s}: ${p}`);
      }
      for (const s of ['mail', 'leadsDialog', 'forecast', 'walk', 'catchUp', 'edge'] as Extra[]) {
        await plantExtra(page, s);
        await expect.poll(() => visible(page, EXTRA_PROBE[s]), { message: `${s} visible` }).toBe(true);
        await shot(page, `${lang}-${sz.tag}`, s);
        for (const p of await auditM5(page, sz.touch)) problems.push(`${s}: ${p}`);
      }
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
      expect(guard.foreign).toEqual([]);
    } finally { await c.close(); }
  });
}

// ====================================================================== behaviour
const sdkCalls = (page: Page) => page.evaluate(() => ((window as any).__sdkCalls as { n: string }[]).map(c => c.n).filter(n => n === 'gameplayStart' || n === 'gameplayStop'));
const toastTexts = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.ov-toast')].map(e => e.textContent ?? ''));

test('project board: locked preview before 2★, start a project, running HUD chip, done toast', async ({ page }) => {
  const { errors } = await fresh(page);
  await expect.poll(() => visible(page, '.bb-projects'), { message: 'Projects entry in the build bar after the tutorial' }).toBe(true);
  await expect.poll(() => visible(page, '.bb-projects .bb-lockbadge'), { message: '.bb-projects .bb-lockbadge' }).toBe(true);
  await page.locator('.bb-projects').click();
  await step(page, 6);
  await expect.poll(() => visible(page, '.m5p.pb'), { message: '.m5p.pb' }).toBe(true);
  await expect(page.locator('.pb-lock')).toContainText('2★');               // the reason, as a goal to play towards
  expect(await page.locator('.pb-start:visible').count()).toBe(0);
  expect(await page.locator('.pb-card').count()).toBe(12);
  await ctxDo(page, (_c, w) => { w.ruf = 200; w.coins = 5000; }); // 2★ (content STARS[1] = 180 since the balance pass M5)
  await step(page, 6);
  await expect(page.locator('.pb-lock')).toBeHidden();
  expect(await visible(page, '.bb-projects .bb-lockbadge')).toBe(false);
  await page.locator('.pb-card[data-id="mattresses"] .pb-start').click();
  await step(page, 6);
  expect(await ctxDo(page, (_c, w) => w.projects.running?.id)).toBe('mattresses');
  await expect(page.locator('.pb-card[data-id="mattresses"]')).toHaveClass(/running/);
  await expect(page.locator('.pb-card[data-id="recipeBook"]')).toHaveClass(/busy/);
  await page.keyboard.press('Escape');
  await step(page, 4);
  expect(await visible(page, '.m5p.pb')).toBe(false);
  await expect.poll(() => visible(page, '.pb-chip'), { message: 'running-project chip in the HUD rail' }).toBe(true);
  await expect(page.locator('.pb-chip .m5-rnum')).toHaveText(/^\d+:\d\d$/);
  await ctxDo(page, (_c, w) => { w.projects.running.leftMs = 50; });
  await step(page, 8);
  expect(await ctxDo(page, (_c, w) => !!w.projects.done.mattresses)).toBe(true);
  expect((await toastTexts(page)).join('|')).toContain('Project done: Comfy Mattresses');
  expect(await visible(page, '.pb-chip')).toBe(false);
  expect(errors).toEqual([]);
});

test('leads: the office tap and the staff card open the office; hire dialog with the real tap count', async ({ page }) => {
  const { errors } = await fresh(page);
  await ctxDo(page, (_c, w) => { w.taps.horn = 34; w.coins = 5000; });
  await ctxDo(page, ctx => { const o = ctx.w.rooms.find((r: any) => r.type === 'office'); ctx.selection.set({ kind: 'room', id: o.id }); });
  await step(page, 6);
  await expect.poll(() => visible(page, '.m5p.ld'), { message: '.m5p.ld' }).toBe(true);
  expect(await ctxDo(page, ctx => ctx.selection.get())).toBeNull();
  expect(await visible(page, '.pn')).toBe(false);
  expect(await page.locator('.ld-slot.locked').count()).toBe(2);
  await expect(page.locator('.ld-slot').first()).toContainText('3★');
  await ctxDo(page, (_c, w) => { w.ruf = 380; });
  await step(page, 6);
  expect(await page.locator('.ld-slot.locked').count()).toBe(1);
  await page.locator('.ld-cand .ld-hire').first().click();
  await step(page, 4);
  await expect(page.locator('.ld-quote')).toHaveText('You tapped 34 times today. From now on, Olli handles it.');
  await page.locator('.ld-yes').click();
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => w.leads.slots[0])).toBe('intake');
  expect((await toastTexts(page)).join('|')).toContain('From now on, Olli handles the ferry horn.');
  await expect(page.locator('.ld-slot').first()).toHaveClass(/filled/);
  // the staff menu card opens the office as well
  await ctxDo(page, ctx => { ctx.panel.set(null); ctx.menu.set('staff'); });
  await step(page, 6);
  await page.locator('.bb-office-open').click();
  await step(page, 4);
  expect(await ctxDo(page, ctx => [ctx.panel.get(), ctx.menu.get()])).toEqual(['leads', null]);
  expect(errors).toEqual([]);
});

test('daily mail: no icon before it is visible, quiet icon with dot, never opens itself, claim, "New mail tomorrow"', async ({ page }) => {
  const { errors } = await fresh(page);
  expect(await visible(page, '.ml-btn')).toBe(false);
  await ctxDo(page, (_c, w) => {
    w.mail.visible = true; w.mail.day = 5; w.mail.seenDay = 4; w.mail.count.released = 3;
    w.mail.tasks = [
      { id: 'release', target: 3, base: 0, done: true, claimed: false, reward: 240 },
      { id: 'crates', target: 40, base: 0, done: false, claimed: true, reward: 240 },
      { id: 'earn', target: 5000, base: 0, done: false, claimed: true, reward: 240 },
    ];
  });
  await step(page, 30);
  await expect.poll(() => visible(page, '.ml-btn'), { message: '.ml-btn' }).toBe(true);
  await expect.poll(() => visible(page, '.ml-btn .m5-dot'), { message: '.ml-btn .m5-dot' }).toBe(true);
  expect(await visible(page, '.m5p.ml')).toBe(false);          // a quiet icon, never a popup
  await page.locator('.ml-btn').click();
  await step(page, 4);
  await expect.poll(() => visible(page, '.m5p.ml'), { message: '.m5p.ml' }).toBe(true);
  expect(await ctxDo(page, (_c, w) => w.mail.seenDay)).toBe(5);
  const c0 = await ctxDo(page, (_c, w) => w.coins);
  await page.locator('.ml-claim:visible').first().click();
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => w.coins)).toBeGreaterThanOrEqual(c0 + 240);
  await expect(page.locator('.ml-tomorrow')).toContainText(/New mail tomorrow – in \d+ h \d+ min/);
  expect(await visible(page, '.ml-btn .m5-dot')).toBe(false);
  expect(errors).toEqual([]);
});

test('inspection: forecast, call, walk banner + follow, pausing result, keep optimising / transfer, paired gameplayStop/Start', async ({ page }) => {
  const { errors } = await fresh(page);
  expect(await visible(page, '.in-btn')).toBe(false);
  await ctxDo(page, (_c, w) => { for (const id of ['workshop', 'classroom', 'guard', 'catch3', 'beds24', 'release15', 'workshop15']) w.obj.done[id] = true; });
  await step(page, 6);
  await expect.poll(() => visible(page, '.in-btn'), { message: '.in-btn' }).toBe(true);
  await expect.poll(() => visible(page, '.in-btn .m5-dot'), { message: '.in-btn .m5-dot' }).toBe(true);
  await page.locator('.in-btn').click();
  await step(page, 4);
  await expect.poll(() => visible(page, '.m5p.in-fc'), { message: '.m5p.in-fc' }).toBe(true);
  expect(await page.locator('.in-fc .in-cat').count()).toBe(4);
  await expect(page.locator('.in-call')).not.toHaveClass(/locked/);
  const calls0 = (await sdkCalls(page)).length;
  await page.locator('.in-call').click();
  await step(page, 6);
  expect(await ctxDo(page, (_c, w) => w.inspection.phase)).toBe('walking');
  expect(await visible(page, '.m5p.in-fc')).toBe(false);
  await expect.poll(() => visible(page, '.in-walk'), { message: '.in-walk' }).toBe(true);
  await expect(page.locator('.in-walk .m5-ban-act')).toHaveText('Following');
  await page.locator('.in-walk').click();
  await step(page, 4);
  await expect(page.locator('.in-walk .m5-ban-act')).toHaveText('Follow');
  // end of the 45 s walk → the result screen opens and pauses (Brief §11.1: gameplayStop)
  await ctxDo(page, (_c, w) => { w.inspection.startMs = w.rtMs - 44_900; });
  await step(page, 12);
  expect(await ctxDo(page, (_c, w) => w.inspection.phase)).toBe('result');
  await expect.poll(() => visible(page, '.m5-card.in-res'), { message: '.m5-card.in-res' }).toBe(true);
  expect(await page.locator('.m5-card.in-res').getAttribute('aria-modal')).toBe('true');
  expect(await ctxDo(page, ctx => ctx.paused())).toBe(true);
  await expect(page.locator('.in-stamp')).toHaveText(/Passed|Failed/);
  await page.locator('.in-keep').click();
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => w.inspection.phase)).toBe('idle');
  expect(await ctxDo(page, ctx => ctx.paused())).toBe(false);
  // a passed result hands over to the transfer dialog without unpausing in between
  await plantM5(page, 'inspectionResult');
  await step(page, 6);
  await page.locator('.in-transfer').click();
  await step(page, 6);
  expect(await ctxDo(page, ctx => [ctx.panel.get(), ctx.paused()])).toEqual(['transfer', true]);
  await page.keyboard.press('Escape');
  await step(page, 4);
  expect(await ctxDo(page, ctx => [ctx.panel.get(), ctx.paused()])).toEqual([null, false]);
  const calls = (await sdkCalls(page)).slice(calls0);
  expect(calls).toEqual(['gameplayStop', 'gameplayStart', 'gameplayStop', 'gameplayStart']);
  expect(errors).toEqual([]);
});

test('transfer + perks: buy, refuse with the reason, two-step confirm, the new run starts with keys', async ({ page }) => {
  const { errors } = await fresh(page);
  await plantM5(page, 'transfer');
  await step(page, 6);
  await expect.poll(() => visible(page, '.m5-card.tr'), { message: '.m5-card.tr' }).toBe(true);
  expect(await page.locator('.tr-perk').count()).toBe(6);
  await page.locator('.tr-perk[data-id="offlineCap"] .tr-buy').click();
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => [w.keys, w.prestige.perks.offlineCap])).toEqual([3, 1]);
  await page.locator('.tr-perk[data-id="workshop"] .tr-buy').click();     // 4 keys > 3: refused with the reason
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => w.keys)).toBe(3);
  expect((await toastTexts(page)).join('|')).toContain('Not enough golden keys');
  await expect(page.locator('.tr-target.silhouette')).toContainText('Gullrock Lighthouse');
  expect(await page.locator('.tr-target.silhouette button').count()).toBe(0);  // a silhouette, no button (H6)
  await page.locator('.tr-go').click();
  await step(page, 2);
  await expect(page.locator('.tr-go')).toContainText('Yes, transfer');
  await page.locator('.tr-cancel').click();
  await step(page, 2);
  await expect(page.locator('.tr-go')).toHaveText(/^\W*Transfer$/);
  const gain = await ctxDo(page, (_c, w) => w.keys);
  await page.locator('.tr-go').click(); await step(page, 2);
  await page.locator('.tr-go').click(); await step(page, 2);
  await page.waitForTimeout(1200);                                           // cross-fade world rebuild (wall clock)
  await step(page, 10);
  const after = await page.evaluate(() => { const w = (window as any).__ctx.w; return { transfers: w.prestige.transfers, keys: w.keys, panel: (window as any).__ctx.panel.get(), paused: (window as any).__ctx.paused() }; });
  expect(after.transfers).toBe(1);
  expect(after.keys).toBeGreaterThanOrEqual(gain);
  expect(after.panel).toBeNull();
  expect(after.paused).toBe(false);
  await expect.poll(() => visible(page, '.bb-bar'), { message: '.bb-bar' }).toBe(true);
  expect(errors).toEqual([]);
});

test('return panel: non-pausing count-up, Collect, no ×2 in BASIC; catch-up chip; save check icon', async ({ page }) => {
  const { errors } = await fresh(page);
  await plantM5(page, 'returnPanel');
  await step(page, 60);
  await expect.poll(() => visible(page, '.m5-ret'), { message: '.m5-ret' }).toBe(true);
  expect(await ctxDo(page, (ctx, w) => [ctx.paused(), w.speed > 0])).toEqual([false, true]);
  await expect(page.locator('.m5-ret-coins')).toHaveText('+12.5K');
  expect(await page.locator('.m5-ret button').count()).toBe(1);
  expect(await page.locator('.m5-ret').textContent()).not.toMatch(/×\s*2|x2|double/i);
  const c0 = await ctxDo(page, (_c, w) => w.coins);
  await page.locator('.ret-collect').click();
  await step(page, 4);
  expect(await ctxDo(page, (_c, w) => w.coins)).toBeGreaterThanOrEqual(c0 + 12_450);
  expect(await visible(page, '.m5-ret')).toBe(false);
  await ctxDo(page, ctx => ctx.catchUp.set({ mode: 'catchup', left: 1200, total: 3000 }));
  await step(page, 4);
  await expect(page.locator('.ret-catch')).toHaveText(/Catching up….*60 %/);
  await ctxDo(page, ctx => ctx.catchUp.set({ mode: 'silent', left: 1200, total: 3000 }));
  await step(page, 4);
  expect(await visible(page, '.ret-catch')).toBe(false);                        // < 60 s: silent
  await ctxDo(page, ctx => ctx.catchUp.set(null));
  await ctxDo(page, ctx => ctx.saved.set(performance.now()));
  await step(page, 4);
  expect(await page.evaluate(() => document.querySelector('.m5-save')!.classList.contains('on'))).toBe(true);
  expect(await page.locator('.m5-save').getAttribute('aria-hidden')).toBe('true');
  await page.waitForTimeout(1700);
  await step(page, 4);
  expect(await page.evaluate(() => document.querySelector('.m5-save')!.classList.contains('on'))).toBe(false);
  expect(errors).toEqual([]);
});

test('edge hint: an off-screen escapee gets an arrow chip; a tap flies there; toasts sit below the event banner', async ({ page }) => {
  const { errors } = await fresh(page, 'en', '&bot=casual&warp=300');
  await ctxDo(page, (ctx, w) => {
    ctx.setPaused(true);
    const a = w.agents.find((x: any) => x.kind === 'rascal' && x.state !== 'leaving');
    a.state = 'escaping'; a.x = 30.5; a.y = 2.5;
    ctx.cam.x = 0; ctx.cam.y = 24 * 32; ctx.cam.zoom = 1.6; ctx.cam.targetZoom = 1.6;
  });
  await step(page, 6);
  await expect.poll(() => visible(page, '.eh-escape'), { message: '.eh-escape' }).toBe(true);
  const box = (await page.locator('.eh-escape').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width); expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await expect.poll(() => visible(page, '.ev-tunnel'), { message: '.ev-tunnel' }).toBe(true);
  await ctxDo(page, ctx => ctx.toast('Test toast below the banner', { ms: 8000 }));
  await step(page, 4);
  await settleCss(page);
  const [ban, toast] = await page.evaluate(() => [document.querySelector('.m5-banners')!.getBoundingClientRect().bottom, document.querySelector('.ov-toast')!.getBoundingClientRect().top]);
  expect(toast).toBeGreaterThanOrEqual(ban);
  await page.locator('.eh-escape').click();
  await step(page, 45);
  expect(await visible(page, '.eh-escape')).toBe(false);                        // the escapee is on screen now
  expect(errors).toEqual([]);
});

test('night skip: "Next morning…" first, the Daily Ledger after it – toasts never overlap', async ({ page }) => {
  const { errors } = await fresh(page);
  await ctxDo(page, (_c, w) => {
    const ev = (type: string, d: Record<string, unknown>) => { w.events.push({ t: w.t, rtMs: w.rtMs, type, ...d }); w.eventSeq++; };
    ev('dayEnd', { day: 0, wages: 120 }); ev('nightSkip', {});
  });
  const seen: string[] = [];
  const overlaps: string[] = [];
  for (let i = 0; i < 70; i++) {
    await step(page, 1);
    const r = await page.evaluate(() => [...document.querySelectorAll('.ov-toast')].map(e => { const b = e.getBoundingClientRect(); return { t: e.textContent ?? '', y0: b.top, y1: b.bottom, x0: b.left, x1: b.right, op: Number(getComputedStyle(e).opacity) }; }));
    for (const x of r) if (x.op > 0.05 && !seen.includes(x.t)) seen.push(x.t);
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) {
      const A = r[a], B = r[b];
      if (A.op > 0.05 && B.op > 0.05 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.5 && Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0.5) overlaps.push(`${A.t} / ${B.t}`);
    }
    await page.waitForTimeout(90);
  }
  expect(overlaps).toEqual([]);
  const morning = seen.findIndex(s => s.includes('morning')), ledger = seen.findIndex(s => /day 1/i.test(s));
  expect(morning).toBeGreaterThanOrEqual(0);
  expect(ledger).toBeGreaterThan(morning);
  expect(errors).toEqual([]);
});

test('Esc routing: modal first, then the M5 panel, then tools; pausing panels unpause on Esc', async ({ page }) => {
  const { errors } = await fresh(page);
  await ctxDo(page, ctx => ctx.panel.set('projects'));
  await step(page, 4);
  await ctxDo(page, ctx => ctx.openModal('settings'));
  await step(page, 4);
  await page.keyboard.press('Escape');
  await step(page, 4);
  expect(await visible(page, '.ov-modal:not(.m5-modal)')).toBe(false);
  expect(await ctxDo(page, ctx => ctx.panel.get())).toBe('projects');
  await page.keyboard.press('Escape');
  await step(page, 4);
  expect(await ctxDo(page, ctx => ctx.panel.get())).toBeNull();
  // a selection stays when Esc closes a panel opened on top of nothing; the next Esc reaches tools.ts
  await ctxDo(page, ctx => ctx.tool.set({ kind: 'demolish' }));
  await page.keyboard.press('Escape');
  await step(page, 2);
  expect(await ctxDo(page, ctx => ctx.tool.get().kind)).toBe('none');
  // pausing dialog
  await plantM5(page, 'transfer');
  await step(page, 4);
  expect(await ctxDo(page, ctx => ctx.paused())).toBe(true);
  await page.keyboard.press('p');                      // game hotkeys are held back while it is open
  await step(page, 2);
  expect(await ctxDo(page, ctx => [ctx.panel.get(), ctx.paused()])).toEqual(['transfer', true]);
  await page.keyboard.press('Escape');
  await step(page, 4);
  expect(await ctxDo(page, ctx => [ctx.panel.get(), ctx.paused()])).toEqual([null, false]);
  expect(errors).toEqual([]);
});

test('H6: every button on every M5 screen does something (no dead buttons)', async ({ page }) => {
  test.setTimeout(240_000);
  const { errors } = await fresh(page);
  type S = M5Screen | 'mail' | 'forecast' | 'leads';
  const enter = async (s: S) => {
    await ctxDo(page, (ctx, w) => { ctx.panel.set(null); ctx.setPaused(false); w.offline.pending = null; w.inspection.phase = 'idle'; });
    await step(page, 2);
    if (s === 'mail') await plantExtra(page, 'mail');
    else if (s === 'forecast') await plantExtra(page, 'forecast');
    else if (s === 'leads') { await ctxDo(page, (ctx, w) => { w.ruf = Math.max(w.ruf, 380); w.coins = 5000; ctx.panel.set('leads'); }); await step(page, 6); }
    else { await plantM5(page, s); await step(page, 30); }
  };
  const SCOPE: Record<S, string> = { projects: '.m5p.pb', returnPanel: '.m5-ret', inspectionResult: '.m5-card.in-res', transfer: '.m5-card.tr', mail: '.m5p.ml', forecast: '.m5p.in-fc', leads: '.m5p.ld' };
  const dead: string[] = [];
  let checked = 0;
  for (const s of Object.keys(SCOPE) as S[]) {
    await enter(s);
    const n = await page.evaluate(sc => [...document.querySelectorAll(`${sc} button`)].filter(b => (b as HTMLElement).checkVisibility()).length, SCOPE[s]);
    for (let i = 0; i < n; i++) {
      await enter(s);
      const label = await page.evaluate(({ sc, k }) => {
        const b = [...document.querySelectorAll(`${sc} button`)].filter(x => (x as HTMLElement).checkVisibility())[k] as HTMLElement | undefined;
        if (!b) return null;
        const g = window as any;
        g.__h6 = { muts: 0, panel: g.__ctx.panel.get(), paused: g.__ctx.paused(), hash: JSON.stringify([g.__ctx.w.coins, g.__ctx.w.keys, g.__ctx.w.projects, g.__ctx.w.leads, g.__ctx.w.mail.tasks, g.__ctx.w.prestige, g.__ctx.w.inspection.phase, g.__ctx.w.offline.pending]) };
        g.__h6obs = new MutationObserver(m => { g.__h6.muts += m.length; });
        g.__h6obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return b.getAttribute('aria-label') ?? b.className;
      }, { sc: SCOPE[s], k: i });
      if (label === null) continue;
      await step(page, 4);
      const alive = await page.evaluate(() => {
        const g = window as any; g.__h6obs.disconnect();
        const h = JSON.stringify([g.__ctx.w.coins, g.__ctx.w.keys, g.__ctx.w.projects, g.__ctx.w.leads, g.__ctx.w.mail.tasks, g.__ctx.w.prestige, g.__ctx.w.inspection.phase, g.__ctx.w.offline.pending]);
        return g.__h6.muts > 0 || g.__h6.panel !== g.__ctx.panel.get() || g.__h6.paused !== g.__ctx.paused() || g.__h6.hash !== h;
      });
      checked++;
      if (!alive) dead.push(`${s}: ${label}`);
      if (s === 'transfer') { await page.waitForTimeout(900); await step(page, 4); }  // a confirmed transfer rebuilds the world
    }
  }
  expect(checked).toBeGreaterThanOrEqual(15);
  expect(dead).toEqual([]);
  expect(errors).toEqual([]);
});

test('clipboard follow-ups: after the 10 goals there is always a current goal, "Show me" opens its screen', async ({ page }) => {
  const { errors } = await fresh(page);
  await ctxDo(page, (_c, w) => { for (const id of ['wash', 'workshop', 'classroom', 'guard', 'beds12', 'yard', 'canteen5', 'catch3', 'beds24', 'release15', 'workshop15']) w.obj.done[id] = true; });
  await step(page, 6);
  await expect(page.locator('.cb-card .cb-goal-txt')).toHaveText('Call Inspection Day');
  await expect(page.locator('.cb-card .cb-prog-num')).toHaveText('0/1');
  await page.locator('.cb-card .cb-show').click();
  await step(page, 4);
  expect(await ctxDo(page, ctx => ctx.panel.get())).toBe('forecast');
  await ctxDo(page, (ctx, w) => { ctx.panel.set(null); w.inspection.best = 1; w.inspection.count = 1; });
  await step(page, 6);
  await expect(page.locator('.cb-card .cb-goal-txt')).toHaveText('Pass an inspection with 2 stars');
  await expect(page.locator('.cb-card .cb-prog-num')).toHaveText('1/2');
  await ctxDo(page, (_c, w) => { w.inspection.best = 3; });
  await step(page, 6);
  await expect(page.locator('.cb-card .cb-goal-txt')).toHaveText('Transfer to a new lockup');
  await page.locator('.cb-card .cb-show').click();
  await step(page, 4);
  expect(await ctxDo(page, ctx => ctx.panel.get())).toBe('transfer');
  expect(errors).toEqual([]);
});
