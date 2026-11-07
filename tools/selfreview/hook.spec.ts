/**
 * G2 hook self-review (docs/G2_FEEDBACK.md): the first 6 minutes as a NEW player who only does what the game shows.
 * Not an acceptance test; run by hand against a running `vite preview` of the production build:
 *   PW_PORT=<port> SR_SPEC=hook.spec.ts npx playwright test -c tools/selfreview/pw.config.ts --workers=1
 *
 * The "novice" (fresh profile, ?capture=1, game time stepped with window.__step):
 *  - taps the tutorial ring (1 s reaction),
 *  - afterwards follows ONLY the onboarding guide (window.__tutorial.guide(): Rooms button → goal card → drag the shown
 *    footprint → Staff → Hire) and the clipboard's "Build it" button, and answers the world prompts (honking ferry,
 *    escapee, a rascal waiting at the gate),
 *  - never decides anything by itself. Whatever happens without a pointer shows where the game leaves a newcomer alone.
 * Screenshots every 15 s of game time (and at 0:05) → qa/m5/hook/<lang>-<w>x<h>/, with log.json (actions, guide steps,
 * events, the longest stretch without a pointer or a celebration).
 */
import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setup, gotoGame } from '../../tests/e2e/helpers';
import { instr, hook, stepN, renderOff, renderOn, snap, tapAt, tileToScreen, agentToScreen, type Win } from '../../tests/e2e/accept-kit';
import { ROOMS } from '../../src/content/balance';

const OUT = process.env.SR_OUT ?? 'qa/m5/hook';
const END_MS = Number(process.env.SR_END_MS ?? 360_000);
const RUNS = [
  { lang: 'en' as const, w: 1280, h: 720 },
  { lang: 'en' as const, w: 907, h: 510 },
  { lang: 'de' as const, w: 1280, h: 720 },
  { lang: 'de' as const, w: 907, h: 510 },
].filter(r => !process.env.SR_ONLY || process.env.SR_ONLY.split(',').includes(`${r.lang}-${r.w}x${r.h}`));
/** events a player feels as "something happened" (for the rhythm check) */
const BEATS = new Set(['release', 'built', 'objective', 'unlock', 'star', 'tunnel', 'caught', 'hire', 'arrive', 'milestone', 'foodFight', 'parcel']);

for (const run of RUNS) {
  const tag = `${run.lang}-${run.w}x${run.h}`;
  test.describe(`hook ${tag}`, () => {
    test.use({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: 1 });
    test(`novice first 6 minutes ${tag}`, async ({ page }) => {
      test.setTimeout(3_600_000);
      const dir = `${OUT}/${tag}`;
      mkdirSync(dir, { recursive: true });
      await page.addInitScript(instr);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await setup(page);
      await gotoGame(page, `capture=1&lang=${run.lang}`, 0);
      await hook(page);
      await stepN(page, 1);
      await renderOff(page);

      let n = 0;
      const shoot = async (label: string) => {
        const rt = await page.evaluate(() => (window as unknown as Win).__sim.rtMs);
        const file = `${String(n++).padStart(3, '0')}-${String(Math.round(rt / 1000)).padStart(3, '0')}s-${label}.jpg`;
        await renderOn(page);
        await page.screenshot({ path: `${dir}/${file}`, type: 'jpeg', quality: 82, timeout: 90_000 });
        await renderOff(page);
      };
      const actions: { rt: number; what: string }[] = [];
      const guideLog: { rt: number; kind: string }[] = [];
      const vw = run.w, vh = run.h;
      const onScreen = (p: { x: number; y: number; canvas: boolean } | null) => !!p && p.canvas && p.x > 4 && p.y > 4 && p.x < vw - 4 && p.y < vh - 4;
      let handoverShot = false, menuSince = -1, nextShot = 5000, ringKey = '', ringSince = -1, lastGuide = '', guideSince = -1, buildSince = -1, lastWorld = -1e9, selSince = -1;
      for (let guard = 0; guard < 40000; guard++) {
        await stepN(page, 6);
        const s = await snap(page);
        if (s.rt >= nextShot) { await shoot(nextShot === 5000 ? 'first' : 't'); nextShot = nextShot === 5000 ? 15000 : nextShot + 15000; }
        if (!handoverShot && s.done && s.rt >= 34000) { handoverShot = true; await shoot('handover'); }
        if (s.rt >= END_MS) break;
        // ---- tutorial: tap the ring
        if (s.active) {
          if (s.ring) {
            const k = `${s.step}:${Math.round(s.ring.x / 30)},${Math.round(s.ring.y / 30)}`;
            if (k !== ringKey) { ringKey = k; ringSince = s.rt; }
            if (s.rt - ringSince >= 1000) { const c = await tapAt(page, s.ring.x, s.ring.y, `ring-step${s.step}`); actions.push({ rt: s.rt, what: c.what }); ringSince = s.rt + 1500; }
          }
          continue;
        }
        // ---- world prompts
        if (s.rt - lastWorld > 800) {
          if (s.esc.length) {
            const e = s.esc[0];
            let p = await agentToScreen(page, e.id);
            if (!onScreen(p)) { await page.evaluate(([x, y]) => (window as unknown as Win).__ctx.focusTile(x, y), [e.x, e.y]); await stepN(page, 20); p = await agentToScreen(page, e.id); }
            if (p && onScreen(p)) { await tapAt(page, p.x, p.y, 'escapee'); actions.push({ rt: s.rt, what: 'catch escapee' }); lastWorld = s.rt; continue; }
          }
          if (s.ferry === 'arriving' && !s.tapped && s.rt - s.fsince > 2500) {
            const p = await tileToScreen(page, -1.75, 23.4 - 2.6);
            if (onScreen(p)) { await tapAt(page, p.x, p.y, 'horn'); actions.push({ rt: s.rt, what: 'horn' }); lastWorld = s.rt; continue; }
          }
        }
        // ---- the guide
        const g = await page.evaluate(() => (window as unknown as Win).__tutorial?.guide?.() ?? null);
        const gk = g ? `${g.kind}:${g.type ?? g.role ?? ''}` : '';
        if (gk !== lastGuide) { lastGuide = gk; guideSince = s.rt; if (g) guideLog.push({ rt: s.rt, kind: gk }); }
        if (g && s.rt - guideSince >= 1500) {
          if (g.kind === 'spot') {
            const mw = ROOMS[g.type as keyof typeof ROOMS].minW, mh = ROOMS[g.type as keyof typeof ROOMS].minH;
            const a = await tileToScreen(page, g.x + ((mw - 1) >> 1) + 0.5, g.y + ((mh - 1) >> 1) + 0.5), b = await tileToScreen(page, g.x + g.w - 0.5, g.y + g.h - 0.5);
            if (!onScreen(a) || !onScreen(b)) { await page.evaluate(([x, y]) => (window as unknown as Win).__ctx.focusTile(x, y), [g.x + g.w / 2, g.y + g.h / 2]); await stepN(page, 30); continue; }
            await page.mouse.move(a.x, a.y); await stepN(page, 1);
            await page.mouse.down();
            await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
            await page.mouse.move(b.x, b.y, { steps: 3 });
            await page.mouse.up();
            await stepN(page, 3);
            await page.mouse.move(vw / 2, 4);
            actions.push({ rt: s.rt, what: `drag ${g.type} at ${g.x},${g.y} ${g.w}×${g.h}` });
            guideSince = s.rt + 1500;
            continue;
          }
          if (g.el) { await page.mouse.click(g.el.x, g.el.y); await stepN(page, 4); actions.push({ rt: s.rt, what: `click ${gk}` }); guideSince = s.rt + 1500; continue; }
        }
        // ---- the clipboard's "Build it" (goals the guide no longer walks through)
        const bi = await page.evaluate(() => {
          const el = document.querySelector('.cb-build:not(.cb-hide)') as HTMLElement | null;
          if (!el || !el.checkVisibility()) return null;
          const r = el.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        });
        if (bi && !g) { if (buildSince < 0) buildSince = s.rt; if (s.rt - buildSince >= 2000) { await page.mouse.click(bi.x, bi.y); await stepN(page, 4); actions.push({ rt: s.rt, what: 'Build it' }); buildSince = -1; continue; } }
        else buildSince = -1;
        // a menu the guide opened and no longer points into: a person closes it after a moment
        const menu = await page.evaluate(() => (window as unknown as Win).__ctx.menu.get());
        if (menu && !g) { if (menuSince < 0) menuSince = s.rt; if (s.rt - menuSince > 2500) { await page.keyboard.press('Escape'); menuSince = -1; } } else menuSince = -1;
        // a panel the novice opened by accident: close it after a moment
        const sel = await page.evaluate(() => { const c = (window as unknown as Win).__ctx; return !!c.selection.get(); });
        if (sel) { if (selSince < 0) selSince = s.rt; if (s.rt - selSince > 2500) { await page.keyboard.press('Escape'); selSince = -1; } } else selSince = -1;
      }
      await shoot('end');
      const ev = await page.evaluate(() => ((window as unknown as Win).__acc.ev as any[]).filter(e => e.type !== 'cmd' && e.type !== 'coins').map(e => ({ type: e.type, rt: e.rt, what: e.what, id: e.id, name: e.name })));
      // rhythm: the longest stretch without a beat (event the player sees celebrated) and without a guide pointer
      const beats = ev.filter(e => BEATS.has(e.type)).map(e => e.rt).sort((a, b) => a - b);
      let gap = 0, gapAt = 0;
      for (let i = 1; i < beats.length; i++) if (beats[i] - beats[i - 1] > gap) { gap = beats[i] - beats[i - 1]; gapAt = beats[i - 1]; }
      const end = await page.evaluate(() => { const w = (window as unknown as Win).__sim; return { rt: w.rtMs, coins: Math.round(w.coins), ruf: w.ruf, released: w.stats.released, rooms: w.rooms.filter((r: any) => r.built).map((r: any) => r.type), obj: w.obj.done }; });
      writeFileSync(`${dir}/log.json`, JSON.stringify({ tag, end, longestBeatGapMs: gap, longestBeatGapFrom: gapAt, actions, guide: guideLog, events: ev, errors }, null, 1));
      console.log(`[hook ${tag}] released ${end.released}, rooms ${end.rooms.join(',')}, longest gap without a beat ${(gap / 1000).toFixed(0)} s from ${(gapAt / 1000).toFixed(0)} s, errors ${errors.length}`);
      console.log(`[hook ${tag}] actions: ${actions.map(a => `${(a.rt / 1000).toFixed(0)}s ${a.what}`).join(' | ')}`);
    });
  });
}
