/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * Self-review of the first 10 minutes (Brief §13.1). Not an acceptance test: it lives outside tests/e2e and is run by hand
 *   PW_PORT=<port> npx playwright test -c tools/selfreview/pw.config.ts --workers=1
 * against a running `vite preview` of the production build.
 *
 * Fresh profile, ?capture=1 (game time stepped with window.__step, 1/30 s per frame). The "player":
 *  - follows the tutorial ring with a real mouse click after a 1 s reaction time,
 *  - afterwards answers the world prompts (honking ferry, stamp at the gate, crate stacks, escapees, brawls) by clicking them,
 *  - every 4–8 s of game time decides what to do with the casual balance bot's brain (tools/bots.ts, run on a copy of the
 *    world in Node) and carries the decision out with its hands: rooms menu → room card → drag on the canvas; staff menu →
 *    Hire; click the room → room panel → Upgrade. The camera only moves through ctx.focusTile (the clipboard's "Show").
 * Screenshots (DPR 1): every 15 s of game time, at 0:05, and at every notable sim event → qa/m4/selfreview/<lang>-<size>/.
 */
import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setup, gotoGame } from '../../tests/e2e/helpers';
import { instr, hook, stepN, renderOff, renderOn, snap, tapAt, tileToScreen, agentToScreen, type Win } from '../../tests/e2e/accept-kit';
import { plainToWorld, rle } from '../../src/save/serialize';
import { BotDriver } from '../bots';
import { staffOf } from '../../src/sim/staff';
import type { World } from '../../src/sim/types';
import { ROOMS } from '../../src/content/balance';

const OUT = process.env.SR_OUT ?? 'qa/m4/selfreview';
const END_MS = Number(process.env.SR_END_MS ?? 600_000);
const RUNS = [
  { lang: 'en' as const, w: 1280, h: 720 },
  { lang: 'en' as const, w: 907, h: 510 },
  { lang: 'de' as const, w: 1280, h: 720 },
  { lang: 'de' as const, w: 907, h: 510 },
].filter(r => !process.env.SR_ONLY || process.env.SR_ONLY === `${r.lang}-${r.w}x${r.h}`);

const NOTABLE = new Set(['tutorialStep', 'tutorialDone', 'build', 'built', 'release', 'milestone', 'unlock', 'objective', 'tunnel', 'caught', 'escaped', 'foodFight', 'star', 'hire', 'ferryDock', 'brawl', 'vip', 'parcel', 'loan', 'cartSold', 'nightSkip', 'night', 'morning']);

/** the world as a plain object (same shape as save/serialize worldToPlain, without flushing events) */
async function worldCopy(page: import('@playwright/test').Page): Promise<World> {
  const json = await page.evaluate(() => {
    const w = (window as unknown as Win).__sim;
    const { cache: _c, events: _e, eventSeq: _s, grid, ...rest } = w;
    void _c; void _e; void _s;
    const g: Record<string, unknown> = { w: grid.w, h: grid.h };
    for (const k of ['ground', 'owned', 'fixed', 'road', 'blocked']) g[k] = Array.from(grid[k] as ArrayLike<number>);
    return JSON.stringify({ ...rest, grid: g });
  });
  const p = JSON.parse(json);
  for (const k of ['ground', 'owned', 'fixed', 'road', 'blocked']) p.grid[k] = rle(p.grid[k]);
  return plainToWorld(p);
}

type Decision = { kind: 'build'; type: string; x: number; y: number; w: number; h: number } | { kind: 'upgrade'; id: number; type: string } | { kind: 'hire'; role: string } | { kind: 'other'; what: string };

/** what the casual bot would do now (run on a copy; only the diff is used) */
function decide(w: World, seed: number): Decision[] {
  const rooms = new Map(w.rooms.map(r => [r.id, { level: r.level }]));
  const staff: Record<string, number> = {};
  for (const s of staffOf(w)) staff[s.role!] = (staff[s.role!] ?? 0) + 1;
  const loan = w.loan.open, parcels = w.parcels.slice();
  const bot = new BotDriver(w, { profile: 'casual', seed });
  bot.step();
  const out: Decision[] = [];
  for (const r of w.rooms) {
    const b = rooms.get(r.id);
    if (!b) out.push({ kind: 'build', type: r.type, x: r.x, y: r.y, w: r.w, h: r.h });
    else if (r.level > b.level) out.push({ kind: 'upgrade', id: r.id, type: r.type });
  }
  const after: Record<string, number> = {};
  for (const s of staffOf(w)) after[s.role!] = (after[s.role!] ?? 0) + 1;
  for (const role of Object.keys(after)) if ((after[role] ?? 0) > (staff[role] ?? 0)) out.push({ kind: 'hire', role });
  if (w.loan.open && !loan) out.push({ kind: 'other', what: 'loan' });
  if (w.parcels.some((p, i) => p && !parcels[i])) out.push({ kind: 'other', what: 'parcel' });
  return out;
}

for (const run of RUNS) {
  const tag = `${run.lang}-${run.w}x${run.h}`;
  test.describe(`self-review ${tag}`, () => {
    test.use({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: 1 });
    test(`first 10 minutes ${tag}`, async ({ page }) => {
      test.setTimeout(3_600_000);
      const dir = `${OUT}/${tag}`;
      mkdirSync(dir, { recursive: true });
      await page.addInitScript(instr);
      const errors: string[] = [], warnings: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
      await setup(page);
      await gotoGame(page, `capture=1&lang=${run.lang}`, 0);
      await hook(page);
      await stepN(page, 1);
      await renderOff(page);

      let n = 0;
      const shots: { file: string; rt: number; label: string }[] = [];
      const shoot = async (label: string) => {
        const rt = await page.evaluate(() => (window as unknown as Win).__sim.rtMs);
        const file = `${String(n++).padStart(3, '0')}-${String(Math.round(rt / 1000)).padStart(3, '0')}s-${label.replace(/[^a-zA-Z0-9_-]+/g, '_')}.png`;
        await renderOn(page);
        await page.screenshot({ path: `${dir}/${file}`, timeout: 90_000 });
        await renderOff(page);
        shots.push({ file, rt, label });
      };
      const actions: { rt: number; what: string; how: string; ok: boolean }[] = [];
      const lastEv = { i: 0 };
      const newEvents = async () => {
        const r = await page.evaluate(i => { const ev = (window as unknown as Win).__acc.ev as any[]; return { n: ev.length, list: ev.slice(i) }; }, lastEv.i);
        lastEv.i = r.n;
        return r.list as any[];
      };
      const findSel = (sel: string) => page.evaluate(s => {
        const el = [...document.querySelectorAll(s)].find(e => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0) as HTMLElement | undefined;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, ok: !!hit && (hit === el || el.contains(hit)), hit: hit ? `${hit.tagName.toLowerCase()}.${String((hit as HTMLElement).className).split(' ')[0]}` : 'none' };
      }, sel);
      const clickSel = async (sel: string) => {
        let b = await findSel(sel);
        for (let k = 0; k < 4 && !(b && b.ok); k++) {
          if (!b) await stepN(page, 6); // a menu that is still opening
          else if (b.hit === 'none') {
            // outside the viewport (the rooms row scrolls sideways at narrow widths): scroll it in, as a person swipes the row
            console.log(`[clickSel] ${sel}: off screen, scrolling the row`);
            await page.evaluate(q => { const el = [...document.querySelectorAll(q)].find(e => e.getBoundingClientRect().width > 0); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, sel);
            await stepN(page, 3);
          } else {
            // a person moves the mouse onto the target first (a hover tooltip of the previous button may sit over it)
            console.log(`[clickSel] ${sel}: covered by ${b.hit}, moving the mouse onto it`);
            await page.mouse.move(b.x, b.y); await stepN(page, 3);
          }
          b = await findSel(sel);
        }
        if (!b || !b.ok) { console.log(`[clickSel] ${sel}: ${b ? 'covered by ' + b.hit : 'not visible'}`); return false; }
        await page.mouse.click(b.x, b.y);
        await stepN(page, 4);
        return true;
      };
      const vw = run.w, vh = run.h;
      const onScreen = (p: { x: number; y: number; canvas: boolean } | null) => !!p && p.canvas && p.x > 4 && p.y > 4 && p.x < vw - 4 && p.y < vh - 4;
      const focus = async (x: number, y: number) => { await page.evaluate(([a, b]) => (window as unknown as Win).__ctx.focusTile(a, b), [x, y]); await stepN(page, 30); };
      const cmdOk = async (name: string) => (await page.evaluate(nm => { const ev = (window as unknown as Win).__acc.ev as any[]; for (let i = ev.length - 1; i >= Math.max(0, ev.length - 40); i--) if (ev[i].type === 'cmd' && ev[i].name === nm) return ev[i].ok; return null; }, name)) as boolean | null;
      const cmdCount = async (name: string) => (await page.evaluate(nm => ((window as unknown as Win).__acc.ev as any[]).filter(e => e.type === 'cmd' && e.name === nm).length, name)) as number;
      const closeAll = async () => { for (let k = 0; k < 3; k++) { const open = await page.evaluate(() => { const c = (window as unknown as Win).__ctx; return !!c.selection.get() || c.tool.get().kind !== 'none' || c.menu.get() !== null; }); if (!open) break; await page.keyboard.press('Escape'); await stepN(page, 2); } };

      // ---- the player's hands
      async function uiBuild(d: Extract<Decision, { kind: 'build' }>) {
        const before = await cmdCount('build');
        if (!(await clickSel('.bb-rooms'))) return 'rooms button not clickable';
        if (!(await clickSel(`.bb-card[data-room="${d.type}"]`))) { await closeAll(); return 'room card not clickable'; }
        await focus(d.x + d.w / 2, d.y + d.h / 2);
        const R = ROOMS[d.type as keyof typeof ROOMS];
        const minW = R.minW, minH = R.minH;
        const ax = d.x + ((minW - 1) >> 1), ay = d.y + ((minH - 1) >> 1);
        const a = await tileToScreen(page, ax + 0.5, ay + 0.5), b = await tileToScreen(page, d.x + d.w - 0.5, d.y + d.h - 0.5);
        if (!onScreen(a) || !onScreen(b)) { await closeAll(); return `target off screen (${a.under}/${b.under})`; }
        await page.mouse.move(a.x, a.y);
        await stepN(page, 1);
        await page.mouse.down();
        await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
        await page.mouse.move(b.x, b.y, { steps: 3 });
        await page.mouse.up();
        await stepN(page, 3);
        const ok = (await cmdCount('build')) > before && (await cmdOk('build')) === true;
        await page.mouse.move(vw / 2, 4);
        await closeAll();
        return ok ? 'ok' : 'build command failed';
      }
      async function uiHire(role: string) {
        const before = await cmdCount('hire');
        if (!(await clickSel('.bb-staff'))) return 'staff button not clickable';
        const ok1 = await clickSel(`.bb-role[data-role="${role}"] .bb-hire`);
        const ok = ok1 && (await cmdCount('hire')) > before && (await cmdOk('hire')) === true;
        await closeAll();
        return ok ? 'ok' : ok1 ? 'hire command failed' : 'hire button not clickable';
      }
      async function selectRoom(id: number) {
        const r = await page.evaluate(i => { const x = ((window as unknown as Win).__sim.rooms as any[]).find(q => q.id === i); return x ? { x: x.x, y: x.y, w: x.w, h: x.h } : null; }, id);
        if (!r) return false;
        await focus(r.x + r.w / 2, r.y + r.h / 2);
        const spots = [[0.5, 0.5], [0.25, 0.75], [0.75, 0.75], [0.25, 0.3], [0.75, 0.3], [0.5, 0.85]];
        for (const [fx, fy] of spots) {
          const p = await tileToScreen(page, r.x + r.w * fx, r.y + r.h * fy);
          if (!onScreen(p)) continue;
          await page.mouse.click(p.x, p.y);
          await stepN(page, 4);
          const sel = await page.evaluate(() => (window as unknown as Win).__ctx.selection.get());
          if (sel?.kind === 'room' && sel.id === id) return true;
          await closeAll();
        }
        return false;
      }
      async function uiUpgrade(id: number) {
        const before = await cmdCount('upgrade');
        if (!(await selectRoom(id))) { await closeAll(); return 'room not selectable by click'; }
        const ok1 = await clickSel('.pn-upbtn');
        const ok = ok1 && (await cmdCount('upgrade')) > before && (await cmdOk('upgrade')) === true;
        await closeAll();
        return ok ? 'ok' : ok1 ? 'upgrade command failed' : 'upgrade button not clickable';
      }

      // ---- the loop
      let nextShot = 15_000, shotAt5 = false, lastEventShot = -1e9, seed = 1;
      let ringKey = '', ringSince = -1, lastWorldTap = -1e9, nextDecision = -1;
      const seen: Record<string, number> = {};
      const due = (k: string, rt: number, cond: boolean, react = 1000) => { if (!cond) { delete seen[k]; return false; } seen[k] ??= rt; return rt - seen[k] >= react; };
      const counts: Record<string, number> = {};
      await shoot('start');
      for (let guard = 0; guard < 40000; guard++) {
        await stepN(page, 6);
        const s = await snap(page);
        if (s.rt >= END_MS) break;
        // screenshots: notable events (≤ 1 per 2 s, first few of the frequent ones), every 15 s, and 0:05
        const evs = (await newEvents()).filter(e => NOTABLE.has(e.type));
        for (const e of evs) counts[e.type] = (counts[e.type] ?? 0) + 1;
        const pick = evs.find(e => !(['release', 'ferryDock', 'hire', 'built'].includes(e.type) && counts[e.type] > 4));
        if (pick && s.rt - lastEventShot >= 2000) { await stepN(page, 6); await shoot(`${pick.type}${pick.what ? '-' + pick.what : pick.rtype ? '-' + pick.rtype : ''}`); lastEventShot = s.rt; }
        if (!shotAt5 && s.rt >= 5000) { shotAt5 = true; await shoot('first-impression'); }
        if (s.rt >= nextShot) { await shoot('t'); nextShot += 15_000; }

        // tutorial: tap the ring
        if (s.active && s.ring) {
          const k = `${s.step}:${Math.round(s.ring.x / 30)},${Math.round(s.ring.y / 30)}`;
          if (k !== ringKey) { ringKey = k; ringSince = s.rt; }
          if (s.rt - ringSince >= 1000) {
            const now = await snap(page);
            if (now.ring && now.ring.x >= 0 && now.ring.y >= 0 && now.ring.x < vw && now.ring.y < vh) {
              const c = await tapAt(page, now.ring.x, now.ring.y, `ring-step${now.step}`);
              actions.push({ rt: c.rt, what: c.what, how: `click ${Math.round(c.x)},${Math.round(c.y)} on ${c.under}`, ok: true });
              ringSince = now.rt + 1500;
            }
          }
          continue;
        }
        if (s.active) continue;
        if (s.sel && s.rt - lastWorldTap > 1500) await closeAll();

        // world prompts
        if (s.rt - lastWorldTap >= 800) {
          const brawl = await page.evaluate(() => ((window as unknown as Win).__sim.agents as any[]).filter(a => a.state === 'brawling').map(a => ({ id: a.id, x: a.x, y: a.y })));
          const target = s.esc[0] ? { ...s.esc[0], what: 'escapee' } : brawl[0] ? { ...brawl[0], what: 'brawl' } : null;
          if (target && due(`${target.what}${target.id}`, s.rt, true, 1500)) {
            let p = await agentToScreen(page, target.id);
            if (!onScreen(p as any)) { await focus(target.x, target.y); p = await agentToScreen(page, target.id); }
            if (p && onScreen(p as any)) { const c = await tapAt(page, p.x, p.y, target.what); actions.push({ rt: c.rt, what: target.what, how: 'click', ok: true }); lastWorldTap = s.rt; continue; }
          }
          if (due('horn', s.rt, s.ferry === 'arriving' && !s.tapped && s.rt - s.fsince > 2000, 1500)) {
            let p = await tileToScreen(page, -1.75, 23.4 - 2.6);
            if (!onScreen(p)) { await focus(-1, 21); p = await tileToScreen(page, -1.75, 23.4 - 2.6); }
            if (onScreen(p)) { const c = await tapAt(page, p.x, p.y, 'horn'); actions.push({ rt: c.rt, what: 'horn', how: 'click', ok: true }); lastWorldTap = s.rt; continue; }
          }
          if (due('stamp', s.rt, s.atGate, 2000)) {
            let p = await tileToScreen(page, 17, 22.6 - 1.3);
            if (!onScreen(p)) { await focus(17, 21); p = await tileToScreen(page, 17, 22.6 - 1.3); }
            if (onScreen(p)) { const c = await tapAt(page, p.x, p.y, 'stamp'); actions.push({ rt: c.rt, what: 'stamp', how: 'click', ok: true }); lastWorldTap = s.rt; continue; }
          }
          const crate = await page.evaluate(() => {
            const w = (window as unknown as Win).__sim;
            if (w.unlocked.supLogistics || w.cart.state !== 'depot') return null;
            const r = (w.rooms as any[]).find(q => q.type === 'workshop' && q.stack >= 3);
            if (!r) return null;
            const d = r.door;
            const s2 = d.side === 'N' ? { x: d.x + 1.6, y: r.y - 0.15 } : d.side === 'E' ? { x: r.x + r.w + 0.55, y: d.y + 1.7 } : d.side === 'W' ? { x: r.x - 0.55, y: d.y + 1.7 } : { x: d.x + 1.6, y: r.y + r.h + 0.8 };
            return { id: r.id, x: s2.x, y: s2.y - 0.35 };
          });
          if (crate && due(`crate${crate.id}`, s.rt, true, 2500)) {
            let p = await tileToScreen(page, crate.x, crate.y);
            if (!onScreen(p)) { await focus(crate.x, crate.y); p = await tileToScreen(page, crate.x, crate.y); }
            if (onScreen(p)) { const c = await tapAt(page, p.x, p.y, 'crates'); actions.push({ rt: c.rt, what: 'crates', how: 'click', ok: true }); lastWorldTap = s.rt; delete seen[`crate${crate.id}`]; continue; }
          }
        }

        // deliberate decisions (casual brain, real UI hands)
        if (nextDecision < 0) nextDecision = s.rt + 3000;
        if (s.rt >= nextDecision) {
          nextDecision = s.rt + 4000 + ((seed * 2654435761) % 4000);
          const ds = decide(await worldCopy(page), seed++);
          for (const d of ds) {
            let res = '';
            if (d.kind === 'build') res = await uiBuild(d);
            else if (d.kind === 'hire') res = await uiHire(d.role);
            else if (d.kind === 'upgrade') res = await uiUpgrade(d.id);
            else res = 'not done (outside the first-10-min script)';
            actions.push({ rt: s.rt, what: d.kind === 'build' ? `build ${d.type} ${d.w}x${d.h} @${d.x},${d.y}` : d.kind === 'hire' ? `hire ${d.role}` : d.kind === 'upgrade' ? `upgrade ${d.type}#${d.id}` : d.what, how: 'UI', ok: res === 'ok' });
            if (res !== 'ok') console.log(`[${tag}] ${(s.rt / 1000).toFixed(1)}s ${JSON.stringify(d)} → ${res}`);
          }
        }
      }
      await shoot('end');
      const end = await page.evaluate(() => {
        const g = window as unknown as Win, w = g.__sim;
        const al = (g.__audioLog ?? []) as any[];
        const plays = (g.__acc.plays as any[]);
        const byName: Record<string, number> = {};
        for (const p of plays) byName[p.name] = (byName[p.name] ?? 0) + 1;
        return {
          rt: w.rtMs, coins: Math.round(w.coins), ruf: w.ruf, released: w.stats.released, caught: w.stats.caught, escaped: w.stats.escaped,
          rooms: (w.rooms as any[]).map(r => `${r.type}${r.built ? '' : '(site)'} L${r.level} ${r.w}x${r.h}`), staff: (w.agents as any[]).filter(a => a.kind === 'staff').map(a => a.role),
          rascals: (w.agents as any[]).filter(a => a.kind === 'rascal').length, obj: w.obj, tutorial: w.tutorial, unlocked: w.unlocked,
          plays: byName, audioLogTail: al.slice(-30), juice: g.__juice?.stats?.(),
        };
      });
      const ev = await page.evaluate(() => ((window as unknown as Win).__acc.ev as any[]).filter(e => e.type !== 'cmd' && e.type !== 'coins').map(e => ({ type: e.type, rt: e.rt, what: e.what, rtype: e.rtype, id: e.id })));
      writeFileSync(`${dir}/log.json`, JSON.stringify({ tag, shots, actions, end, errors, warnings: warnings.slice(0, 20), events: ev }, null, 1));
      console.log(`[${tag}] ${shots.length} shots, ${actions.length} actions (${actions.filter(a => !a.ok).length} not ok), errors ${errors.length}, released ${end.released}, rooms ${end.rooms.length}`);
    });
  });
}
