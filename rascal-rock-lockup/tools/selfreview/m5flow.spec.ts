/* eslint-disable @typescript-eslint/no-explicit-any -- in-page code reads untyped window hooks (__ctx, __sim, __sdkCalls) */
/**
 * M5 integration self-play (docs/QA_REPORT.md "Stand M5"): site 1 from a fresh browser profile to the first inspection,
 * a transfer and a perk purchase – with REAL clicks/taps on every new M5 control – then save, reload after an absence
 * (return panel) and a tab return (catch-up). Not an acceptance test; run against a running `vite preview`:
 *   PW_PORT=<port> SR_SPEC=m5flow.spec.ts npx playwright test -c tools/selfreview/pw.config.ts --workers=1
 *
 * The first ~30 game minutes are played by the casual bot in-page (?bot=casual&warp=1800&botoff: the bot stops after
 * the warp and leaves Inspection Day to the player); the opening minutes as a human are covered by m4-onboarding and
 * tools/selfreview/hook.spec.ts. ?keepsave makes this warped world save and load like a player's; ?clock injects the
 * wall clock (FakeClock, window.__clock.advance). Game time is stepped (?capture=1, 30 frames = 1 s).
 * Output: qa/m5/flow/<lang>-<size>/NN-<label>.jpg + log.json (clicks, events, overlaps, console errors, SDK calls).
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setup, gotoGame } from '../../tests/e2e/helpers';

const OUT = process.env.SR_OUT ?? 'qa/m5/flow';
const T0 = Date.UTC(2026, 10, 9, 8, 0, 0); // a Monday morning, local = UTC (tz 0)
const RUNS = [
  { lang: 'en', w: 1280, h: 720, touch: false },
  { lang: 'de', w: 1280, h: 720, touch: false },
  { lang: 'en', w: 907, h: 510, touch: false },
  { lang: 'de', w: 907, h: 510, touch: false },
  { lang: 'en', w: 844, h: 390, touch: true },
  { lang: 'de', w: 844, h: 390, touch: true },
].filter(r => !process.env.SR_ONLY || process.env.SR_ONLY.split(',').includes(`${r.lang}-${r.w}x${r.h}`));

/** top-level HUD widgets that must never cover each other (pausing cards cover everything on purpose) */
const WIDGETS = ['.tb', '.cb', '.bb-bar', '.m5-rail', '.m5-banners', '.m5p', '.m5-ret', '.ov-toasts', '.m5-edge', '.tu-jit.on', '.bb-menu', '.m5-plaque', '.ac-card:not(.hid)', '.pn'];

for (const run of RUNS) {
  const tag = `${run.lang}-${run.w}x${run.h}${run.touch ? '-touch' : ''}`;
  test.describe(`m5 flow ${tag}`, () => {
    test.use({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: 1, ...(run.touch ? { isMobile: true, hasTouch: true } : {}) });
    test(`site 1 → inspection → transfer → perk → absence ${tag}`, async ({ page }) => {
      test.setTimeout(1_800_000);
      const dir = `${OUT}/${tag}`;
      mkdirSync(dir, { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const guard = await setup(page, { mock: { persist: true } });
      const log: { shots: any[]; clicks: any[]; notes: string[]; events?: any[]; sdk?: any[] } = { shots: [], clicks: [], notes: [] };
      const note = (s: string) => { log.notes.push(s); console.log(`[${tag}] ${s}`); };
      const step = (n: number) => page.evaluate(k => (window as any).__step(k), n);
      const stepSec = async (sec: number) => { for (let i = 0; i < sec; i++) await step(30); };
      const w = <T>(fn: string) => page.evaluate(`(() => { const w = window.__ctx.w, ctx = window.__ctx; return (${fn}); })()`) as Promise<T>;

      let n = 0;
      const overlaps = () => page.evaluate(sels => {
        const vis = (e: Element) => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 2 && e.getBoundingClientRect().height > 2;
        const els: { sel: string; r: DOMRect }[] = [];
        for (const s of sels) for (const e of document.querySelectorAll(s)) if (vis(e) && !e.closest('[aria-modal="true"]')) {
          // a container's own box can be larger than what it shows: use the union of its visible children for rails/banners
          let r = e.getBoundingClientRect();
          if (s === '.m5-rail' || s === '.m5-banners' || s === '.ov-toasts') {
            const kids = [...e.children].filter(vis).map(k => k.getBoundingClientRect());
            if (!kids.length) continue;
            r = new DOMRect(Math.min(...kids.map(k => k.left)), Math.min(...kids.map(k => k.top)), 0, 0);
            const right = Math.max(...kids.map(k => k.right)), bottom = Math.max(...kids.map(k => k.bottom));
            r = new DOMRect(r.left, r.top, right - r.left, bottom - r.top);
          }
          els.push({ sel: s, r });
        }
        const out: string[] = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
          const a = els[i].r, b = els[j].r;
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 3 && iy > 3 && els[i].sel !== els[j].sel) out.push(`${els[i].sel} × ${els[j].sel} (${Math.round(ix)}×${Math.round(iy)})`);
        }
        const off: string[] = [];
        for (const e of els) if (e.r.left < -1 || e.r.top < -1 || e.r.right > innerWidth + 1 || e.r.bottom > innerHeight + 1) off.push(`${e.sel} off-screen [${[e.r.left, e.r.top, e.r.right, e.r.bottom].map(Math.round)}]`);
        return [...out, ...off];
      }, WIDGETS);
      const shoot = async (label: string) => {
        await step(2);
        await page.waitForTimeout(450); // CSS fade-ins run on wall time
        const file = `${String(n++).padStart(2, '0')}-${label}.jpg`;
        await page.screenshot({ path: `${dir}/${file}`, type: 'jpeg', quality: 80, timeout: 120_000 });
        const ov = await overlaps();
        const st = await w<any>(`({ rt: Math.round(w.rtMs / 1000), coins: Math.round(w.coins), ruf: Math.round(w.ruf), site: w.site, keys: w.keys, phase: w.inspection.phase, panel: ctx.panel.get(), paused: ctx.paused() })`);
        log.shots.push({ file, label, ...st, overlaps: ov });
        if (ov.length) note(`overlap @${label}: ${ov.join('; ')}`);
      };
      /** a real click / tap on the element's centre; checks that nothing else sits on top of it */
      const press = async (sel: string, what: string, opts: { optional?: boolean } = {}) => {
        const box = await page.evaluate(s => {
          const e = [...document.querySelectorAll<HTMLElement>(s)].find(x => x.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && x.getBoundingClientRect().width > 0);
          if (!e) return null;
          e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x, y, hit: !!top && (top === e || e.contains(top)), under: top ? `${top.tagName.toLowerCase()}.${String((top as HTMLElement).className).split(' ').join('.')}` : 'none', disabled: (e as HTMLButtonElement).disabled ?? false, label: e.getAttribute('aria-label') };
        }, sel);
        if (!box) { if (!opts.optional) note(`MISSING ${what} (${sel})`); log.clicks.push({ what, sel, missing: true }); return false; }
        if (!box.hit) note(`COVERED ${what}: ${box.under} on top`);
        if (run.touch) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
        await step(4);
        log.clicks.push({ what, sel, ...box });
        return true;
      };
      const sdkCalls = () => page.evaluate(() => ((window as any).__sdkCalls ?? []).filter((c: any) => !/^data\./.test(c.n)).map((c: any) => c.n + (c.a && c.a.length ? JSON.stringify(c.a) : '')));
      const is = (sel: string) => page.evaluate(s => [...document.querySelectorAll<HTMLElement>(s)].some(x => x.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && x.getBoundingClientRect().width > 0), sel);

      // ------------------------------------------------------------ 1. fresh profile: casual bot plays the first 30 min
      await gotoGame(page, `capture=1&keepsave&clock=${T0}&tz=0&lang=${run.lang}&bot=casual&warp=1800&botoff&seed=1`, 0);
      await stepSec(3);
      const start = await w<any>(`({ fresh: w.rtMs, stars: Math.floor(0), mail: w.mail.visible, insp: w.inspection.phase })`);
      note(`after warp: ${JSON.stringify(start)}`);
      await shoot('site1-30min');
      expect(await w<boolean>('w.tutorial.done')).toBe(true);

      // ------------------------------------------------------------ 2. project board
      await press('.bb-projects', 'Projects button');
      await shoot('project-board');
      const startable = await is('.pb-start:not([disabled])');
      if (startable) {
        const before = await w<number>('w.projects.running ? 1 : 0');
        await press('.pb-start:not([disabled])', 'start project');
        note(`project started: ${before} → ${await w<string>('JSON.stringify(w.projects.running)')}`);
        await shoot('project-started');
      } else note('no startable project card (running or all done / unaffordable)');
      await page.keyboard.press('Escape'); await step(6);
      if (await is('.m5p.pb')) note('BUG Esc did not close the project board');

      // ------------------------------------------------------------ 3. leads (staff menu → Warden's Office card)
      await press('.bb-staff', 'Staff button');
      await shoot('staff-menu');
      await press('.bb-office-open', 'Office card');
      await shoot('leads-panel');
      if (await is('.ld-hire:not([disabled])')) {
        await press('.ld-hire:not([disabled])', 'Hire lead');
        await shoot('lead-dialog');
        await press('.ld-yes', 'confirm hire');
        note(`leads: ${await w<string>('JSON.stringify(w.leads.slots)')}`);
        await shoot('lead-hired');
      } else note(`no hire button enabled; leads ${await w<string>('JSON.stringify(w.leads.slots)')}`);
      await page.keyboard.press('Escape'); await step(6);

      // ------------------------------------------------------------ 4. daily mail
      await stepSec(2);
      if (await is('.ml-btn')) {
        await press('.ml-btn', 'Mail');
        await shoot('mail');
        if (await is('.ml-claim:not([disabled])')) { await press('.ml-claim:not([disabled])', 'claim mail'); await shoot('mail-claimed'); }
        await page.keyboard.press('Escape'); await step(6);
      } else note(`mail icon not visible (mail.visible=${await w<boolean>('w.mail.visible')})`);

      // ------------------------------------------------------------ 5. Inspection Day
      await press('.in-btn', 'Inspection rail button');
      await shoot('inspection-forecast');
      const fc = await w<any>(`({ block: window.__insp ? 0 : 0, phase: w.inspection.phase })`);
      if (!(await is('.in-call:not([disabled])'))) {
        note(`call disabled ${JSON.stringify(fc)}; stepping until it is callable`);
        for (let i = 0; i < 300 && !(await is('.in-call:not([disabled])')); i++) await stepSec(5);
      }
      await press('.in-call:not([disabled])', 'Call Inspection Day');
      expect(await w<string>('w.inspection.phase')).toBe('walking');
      await stepSec(8);
      await shoot('inspection-walk');
      if (await is('.in-walk')) { await press('.in-walk', 'Follow the inspector'); await stepSec(4); await shoot('inspection-follow'); }
      for (let i = 0; i < 60 && (await w<string>('w.inspection.phase')) === 'walking'; i++) await stepSec(1);
      await stepSec(3);
      const res = await w<any>('w.inspection.last');
      note(`inspection result: stars ${res?.stars} passed ${res?.stars >= 1} grades ${JSON.stringify(res?.grades)}`);
      await shoot('inspection-result');
      expect(await is('.m5-card.in-res')).toBe(true);
      expect(await w<boolean>('ctx.paused()')).toBe(true);
      if (!(res?.stars >= 1)) {
        // keep optimising until a pass: close, play on, call again (the casual bot plays meanwhile? no – it is off)
        await press('.in-keep', 'Keep optimising');
        note('first inspection failed – re-inspecting after planting a pass is NOT done; flow stops at the result here');
      } else {
        // ---------------------------------------------------------- 6. transfer + perk
        await press('.in-transfer', 'Transfer…');
        await shoot('transfer-dialog');
        await press('.tr-go', 'Transfer (1st tap)');
        await shoot('transfer-confirm');
        const siteBefore = await w<number>('w.prestige.transfers');
        await press('.tr-go', 'Transfer (confirm)');
        for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); await step(2); }
        await page.waitForFunction(() => !document.querySelector('[data-overlay="save-fade"]'), null, { timeout: 15_000 });
        await stepSec(2);
        note(`after transfer: transfers ${siteBefore} → ${await w<number>('w.prestige.transfers')}, keys ${await w<number>('w.keys')}, paused ${await w<boolean>('ctx.paused()')}, tutorial ${await w<string>('JSON.stringify(w.tutorial)')}`);
        await shoot('after-transfer');
        expect(await w<boolean>('ctx.paused()')).toBe(false);
        await press('.tr-keys', 'Keys / perk shop');
        await shoot('perk-shop');
        const k0 = await w<number>('w.keys');
        if (await is('.tr-buy:not([disabled])')) {
          await press('.tr-buy:not([disabled])', 'Buy perk');
          note(`perk bought: keys ${k0} → ${await w<number>('w.keys')}, perks ${await w<string>('JSON.stringify(w.prestige.perks)')}`);
          await shoot('perk-bought');
        } else note('no affordable perk');
        await page.keyboard.press('Escape'); await step(6);
        await stepSec(20);
        await shoot('new-run-20s');
        // the transfer run's first goal is the Wash Hut (the fresh lockup has none)
        note(`new run goal: ${await w<string>('window.__ctx.w.obj.current')} / ${await page.evaluate(() => document.querySelector('.cb-goal')?.textContent ?? '')}`);
        await stepSec(150); // a few measured minutes of income, so the absence below has something to pay
      }

      const sdk: string[] = await sdkCalls();
      // ------------------------------------------------------------ 7. save → reload after 30 min away → return panel
      await page.evaluate(() => (window as any).__save.flush());
      const savedRt = await w<number>('w.rtMs');
      note(`saved at rt ${savedRt}: ${JSON.stringify(await page.evaluate(() => (window as any).__save.state()))}`);
      await gotoGame(page, `capture=1&keepsave&clock=${T0 + 30 * 60_000 + 5_000}&tz=0&lang=${run.lang}`, 0);
      await stepSec(2);
      note(`after reload: rt ${await w<number>('w.rtMs')}, pending ${await w<string>('JSON.stringify(w.offline.pending)')}`);
      await shoot('return-panel');
      if (await is('.ret-collect')) { const c0 = await w<number>('w.coins'); await press('.ret-collect', 'Collect'); await stepSec(1); note(`collected: ${c0} → ${await w<number>('w.coins')}`); }
      else note('BUG no return panel after 30 min away');

      // ------------------------------------------------------------ 8. tab return: 2 min hidden → catch-up; 12 min → return panel
      const hide = (ms: number) => page.evaluate(m => {
        const set = (v: string) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
        set('hidden'); (window as any).__clock.advance(m); set('visible');
      }, ms);
      await hide(120_000);
      await step(3);
      note(`catch-up state: ${JSON.stringify(await w<any>('ctx.catchUp.get()'))}`);
      await shoot('catch-up');
      for (let i = 0; i < 200 && (await w<any>('ctx.catchUp.get()')); i++) await step(10);
      await hide(12 * 60_000);
      await step(6);
      await shoot('tab-return-panel');
      if (await is('.ret-collect')) await press('.ret-collect', 'Collect (tab return)'); else note('BUG no return panel after a 12-min tab absence');

      // ------------------------------------------------------------ log
      log.events = await page.evaluate(() => (window as any).__ctx.w.events.slice(-60).map((e: any) => ({ type: e.type, rt: e.rtMs })));
      sdk.push('--- reload', ...(await sdkCalls()));
      log.sdk = sdk;
      writeFileSync(`${dir}/log.json`, JSON.stringify({ ...log, errors, foreign: guard.foreign }, null, 1));
      if (errors.length) note(`console errors: ${errors.join(' | ')}`);
      expect(errors).toEqual([]);
    });
  });
}
