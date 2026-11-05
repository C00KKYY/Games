/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * M4 acceptance – loading and onboarding (Brief §12.2 A2/A3, §12.5 D1–D4, D6, D8–D10, §12.6 E, §2.2 USPs).
 *
 * Real time where the brief measures what a person waits for (A2, A3, D2, D3: wall clock from navigation start /
 * gameplayStart, normal ticker). Game time where the brief measures game progress (D4, D6, D8, D9, D10, E): the page
 * runs with ?capture=1 and the test steps window.__step (1/30 s per frame) – deterministic, independent of how fast
 * SwiftShader renders. A driver plays like a person: it taps where the tutorial ring is (read again before every tap,
 * the camera moves), after a 1 s reaction time; after the tutorial it answers the world prompts (horn, stamp, escapee).
 * D4 is probed once per second of game time (accept-kit.ts __accGoal), as the widget is at that moment: a running
 * goal-change animation (wall-clock, frozen while game time is stepped) is measured as it stands – on screen, ≥ 60 %
 * opacity, uncovered.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setup, gotoGame } from './helpers';
import { instr, hook, stepN, renderOff, renderOn, acc, snap, drive, type Win, type AccEvent, type AccPlay, type GoalSample, type Click } from './accept-kit';

const SHOTS = 'test-results/m4-onboarding';
const FRAME_MS = 1000 / 60; // "≤ 1 frame" at the 60 Hz the brief budgets for (16.7 ms)

// ---------------------------------------------------------------------------------------------------------- A2 A3 D2 D3
test.describe('A2/A3/D2/D3 first seconds (real time)', () => {
  test('A2 gameplayStart ≤ 5 s after load; A3 0 clicks until the first player action; D2 that action ≤ 5 s after gameplayStart; D3 first feedback ≤ 15 s', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(instr);
    // rAF probe: the first moment (ms since navigation start) the tutorial's first action is possible – the ferry honks
    // (tapHorn is accepted while it arrives), the ring is on it and the canvas (not a DOM layer) is under the ring
    await page.addInitScript(() => {
      const g = window as any;
      const probe = () => {
        const w = g.__sim, ring = document.querySelector('.tu-ring.on') as HTMLElement | null;
        if (w && ring && g.__acc.firstAction === undefined && w.ferry.state === 'arriving' && !w.ferry.tapped) {
          const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(ring.style.transform);
          const el = m ? document.elementFromPoint(+m[1], +m[2]) : null;
          if (m && el === g.__ctx.canvas) g.__acc.firstAction = { at: performance.now(), x: +m[1], y: +m[2], inputs: g.__acc.inputs.length, rt: w.rtMs };
        }
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await setup(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as Win).__sdkCalls?.some((c: any) => c.n === 'gameplayStart'), null, { timeout: 30_000 });
    const gs = await page.evaluate(() => (window as unknown as Win).__sdkCalls.find((c: any) => c.n === 'gameplayStart'));
    console.log(`[A2] first gameplayStart at ${gs.at} ms after navigation start`);
    expect(gs.at, 'A2: first gameplayStart ≤ 5 s').toBeLessThanOrEqual(5000);
    await page.waitForFunction(() => (window as unknown as Win).__acc.firstAction !== undefined, null, { timeout: 30_000 });
    await hook(page);
    const fa = await page.evaluate(() => (window as unknown as Win).__acc.firstAction);
    const modal = await page.evaluate(() => [...document.querySelectorAll('[aria-modal="true"], .ov-modal')].some(el => !el.closest('[hidden]') && (el as HTMLElement).checkVisibility()));
    console.log(`[A3/D2] first action possible at ${Math.round(fa.at)} ms (${Math.round(fa.at - gs.at)} ms after gameplayStart, game time ${fa.rt} ms), inputs before: ${fa.inputs}`);
    expect(fa.inputs, 'A3: 0 inputs before the first player action is possible').toBe(0);
    expect(modal, 'A3: nothing to click away').toBe(false);
    expect(fa.at - gs.at, 'D2: first action ≤ 5 s after gameplayStart').toBeLessThanOrEqual(5000);
    // a person reacts within a second and taps the ring – that very first click is the action and is accepted
    await page.waitForTimeout(1000);
    const ring = await snap(page);
    expect(ring.ring, 'ring still on the ferry').not.toBeNull();
    expect(await page.evaluate(() => (window as unknown as Win).__acc.inputs.length)).toBe(0);
    await page.mouse.click(ring.ring!.x, ring.ring!.y);
    await page.waitForFunction(() => (window as unknown as Win).__acc.fx.length > 0 || ((window as unknown as Win).__fxLog ?? []).some((f: any) => f.kind === 'tap:tapHorn'), null, { timeout: 10_000 });
    const r = await page.evaluate(() => {
      const g = window as unknown as Win;
      return { cmd: g.__acc.ev.find((e: any) => e.type === 'cmd' && e.name === 'tapHorn'), fx: (g.__fxLog as any[]).filter(f => /^tap:tapHorn|^hornTap$/.test(f.kind)), tapped: g.__sim.ferry.tapped, clicks: g.__acc.inputs.filter((i: any) => i.ty === 'click').length };
    });
    expect(r.cmd?.ok, 'the first click taps the horn').toBe(true);
    expect(r.clicks).toBe(1);
    const firstFx = Math.min(...r.fx.map((f: any) => f.t));
    console.log(`[D3] first feedback (${r.fx.map((f: any) => f.kind).join(', ')}) at ${Math.round(firstFx - gs.at)} ms after gameplayStart`);
    expect(r.fx.map((f: any) => f.kind)).toContain('tap:tapHorn');
    expect(firstFx - gs.at, 'D3: first feedback ≤ 15 s').toBeLessThanOrEqual(15_000);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- tutorial path
/**
 * USP → sim events (Brief §2.2), as they reach the event log:
 *  USP 1 rehabilitate & release as the core economy → 'release' (stamp at the gate, confetti, fanfare) paying 'coins' kind 'release'
 *  USP 2 building where the layout counts            → 'build' then 'built' of the same room 2–6 s later (animated construction)
 *  USP 3 visible pipeline                            → 'ferryDock' (dock, left) → 'admit' (bed) → 'release' (gate, right), and the
 *                                                       flow bar on screen at every 1 s sample with ≥ 5 stages (wide: stage
 *                                                       buttons .tb .stages .st; narrow topbar: the collapsed summary's icons)
 *  USP 4 shenanigans instead of violence             → 'tunnel' (spoon tunnel) resolved by a tap: cmd tapEscapee ok → 'caught'
 */
const TAP_CMDS = new Set(['tapHorn', 'stamp', 'tapCrates', 'tapEscapee', 'tapRangler']);

/** i18n tables a player reads in the bubble (base table + the tutorial component part) */
const table = (lang: 'en' | 'de') => ({ ...JSON.parse(readFileSync(`src/i18n/${lang}.json`, 'utf8')), ...JSON.parse(readFileSync(`src/i18n/parts/tutorial.${lang}.json`, 'utf8')) }) as Record<string, string>;
const STEPS = ['horn', 'wash', 'stamp', 'upgrade'];
const PATH_SIZES = [
  { name: '1280x720 EN mouse', viewport: { width: 1280, height: 720 }, touch: false, lang: 'en' as const },
  { name: '844x390 DE touch', viewport: { width: 844, height: 390 }, touch: true, lang: 'de' as const },
];
for (const sz of PATH_SIZES) test.describe(`tutorial path (game time) @ ${sz.name}`, () => {
  test.use({ viewport: sz.viewport, hasTouch: sz.touch, isMobile: sz.touch });
  test(`D8 first release ≤ 90 s; D10 USPs 1–3 by 2:00, USP 4 by 3:30; D4 goal widget 100 % of the first 3:30; D6 no blocking popup in 60 s; D1 ≤ 8 words + Skip each step; E juice + audio per tap @ ${sz.name}`, async ({ page }) => {
    test.setTimeout(600_000);
    const tag = sz.name.replace(/\s+/g, '-');
    await page.addInitScript(instr);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await setup(page);
    await gotoGame(page, `capture=1&lang=${sz.lang}`, 0);
    await hook(page);
    await stepN(page, 2);
    await renderOn(page);
    await page.screenshot({ path: `${SHOTS}/path-start-${tag}.png`, timeout: 90_000 });
    await renderOff(page);
    const perStep: Record<number, { words: number; text: string; skip: boolean; label: string | null; tip: boolean }> = {};
    const agentSamples: any[] = [];
    const clicks: Click[] = await drive(page, {
      endMs: 212_000, followPointer: true, worldTaps: true, reactMs: 1000, touch: sz.touch,
      // D1: the most words the bubble ever showed in a step (the wait line comes and goes), Skip with label + tooltip
      onSnap: s => {
        if (!s.active || !s.bubText) return;
        const p = perStep[s.step];
        if (!p || s.bubWords > p.words) perStep[s.step] = { words: s.bubWords, text: s.bubText, skip: s.skipVis && (p?.skip ?? true), label: s.skipLabel, tip: s.skipTip && (p?.tip ?? true) };
        else { p.skip &&= s.skipVis; p.tip &&= s.skipTip; }
      },
    });
    // E (agents): walk phase advances, facing and need icons – sample the views a few frames apart
    for (let k = 0; k < 3; k++) {
      agentSamples.push(await page.evaluate(() => {
        const g = window as unknown as Win;
        return (g.__sim.agents as any[]).filter(a => a.kind === 'rascal').map(a => { const v = g.__view.agentView(a.id); return v ? { id: a.id, state: a.state, dir: v.dir, phase: v.phase, moving: v.moving, flip: v.inner?.scale?.x } : null; }).filter(Boolean);
      }));
      await stepN(page, 8);
    }
    await renderOn(page);
    await page.screenshot({ path: `${SHOTS}/path-end-${tag}.png`, timeout: 90_000 });
    const ev = await acc<AccEvent[]>(page, 'ev');
    const fx = await acc<{ kind: string; t: number; frame: number }[]>(page, 'fx');
    const plays = await acc<AccPlay[]>(page, 'plays');
    const goal = await acc<GoalSample[]>(page, 'goal');
    const first = (type: string, f: (e: AccEvent) => boolean = () => true) => ev.find(e => e.type === type && f(e));
    const juice = await page.evaluate(() => (window as unknown as Win).__juice.stats());
    console.log(`[path] clicks: ${clicks.map(c => `${c.what}@${(c.rt / 1000).toFixed(1)}s`).join(' ')}`);
    console.log(`[path] events: ${ev.filter(e => ['tutorialStep', 'tutorialDone', 'build', 'built', 'release', 'upgrade', 'tunnel', 'caught', 'escaped', 'unlock', 'ferryDock', 'admit', 'objective'].includes(e.type)).map(e => `${e.type}${e.what ? ':' + e.what : ''}@${(e.rt / 1000).toFixed(1)}`).join(' ')}`);

    // ---- D8: the tutorial was played through by tapping the ring; first release ≤ 90 s after the start
    const done = first('tutorialDone');
    expect(done, 'tutorial finished').toBeTruthy();
    expect(done!.skipped ?? false, 'finished by playing, not by Skip').toBe(false);
    const rel = first('release');
    console.log(`[D8] first release at ${(rel?.rt ?? NaN) / 1000} s, tutorial done at ${done!.rt / 1000} s`);
    expect(rel, 'a release happened').toBeTruthy();
    expect(rel!.rt, 'D8: first release ≤ 90 s').toBeLessThanOrEqual(90_000);
    expect(clicks.filter(c => c.what.startsWith('ring-step')).length, 'the ring was followed').toBeGreaterThanOrEqual(4);

    // ---- D1: every step showed ≤ 8 words and a working Skip with label + tooltip (Skip itself: D9 test)
    console.log(`[D1] ${Object.entries(perStep).map(([k, v]) => `step${k}: "${v.text}" (${v.words} words)`).join(' | ')}`);
    expect(Object.keys(perStep).sort()).toEqual(['0', '1', '2', '3']);
    const tbl = table(sz.lang);
    for (const [k, v] of Object.entries(perStep)) {
      expect(v.words, `D1: step ${k} words`).toBeLessThanOrEqual(8);
      expect(v.text.startsWith(tbl[`tut.${STEPS[+k]}`]), `D1: step ${k} shows its i18n text tut.${STEPS[+k]}`).toBe(true);
      expect(v.skip, `D1: Skip visible in step ${k}`).toBe(true);
      expect(v.label, `D1: Skip label in step ${k}`).toBeTruthy();
      expect(v.tip, `D1: Skip tooltip in step ${k}`).toBe(true);
    }

    // ---- D10: USPs from the event log
    const build = first('build'), built = build && first('built', e => e.roomId === build.roomId);
    const dock = first('ferryDock'), admit = first('admit');
    const tunnel = first('tunnel');
    const caught = tunnel && first('caught', e => e.id === tunnel.id);
    const tapEsc = ev.find(e => e.type === 'cmd' && e.name === 'tapEscapee' && e.ok);
    console.log(`[D10] USP1 release ${rel!.rt / 1000}s | USP2 build ${build && build.rt / 1000}s → built ${built && built.rt / 1000}s | USP3 dock ${dock && dock.rt / 1000}s, admit ${admit && admit.rt / 1000}s | USP4 tunnel ${tunnel && tunnel.rt / 1000}s, caught ${caught && caught.rt / 1000}s`);
    expect(rel!.rt, 'USP 1 by 2:00').toBeLessThanOrEqual(120_000);
    expect(ev.some(e => e.type === 'coins' && e.kind === 'release' && e.rt <= 120_000), 'USP 1: the release pays').toBe(true);
    expect(build && built, 'USP 2: build + built').toBeTruthy();
    expect(built!.rt, 'USP 2 by 2:00').toBeLessThanOrEqual(120_000);
    expect(built!.rt - build!.rt, 'USP 2: animated construction 2–6 s').toBeGreaterThanOrEqual(2000);
    expect(built!.rt - build!.rt, 'USP 2: animated construction 2–6 s').toBeLessThanOrEqual(6000);
    expect(dock && admit, 'USP 3: ferry dock + admission').toBeTruthy();
    expect(Math.max(dock!.rt, admit!.rt, rel!.rt), 'USP 3 by 2:00').toBeLessThanOrEqual(120_000);
    const flowBad = goal.filter(g => g.rt <= 120_000 && g.flow < 5);
    expect(flowBad.map(g => `${g.rt}: ${g.flow} stages`), 'USP 3: flow bar with ≥ 5 stages at every sample').toEqual([]);
    expect(tunnel, 'USP 4: spoon tunnel').toBeTruthy();
    expect(tunnel!.rt, 'USP 4 by 3:30').toBeLessThanOrEqual(210_000);
    expect(tapEsc, 'USP 4: solved by a tap').toBeTruthy();
    expect(caught, 'USP 4: escapee caught').toBeTruthy();
    expect(caught!.rt, 'USP 4 resolved by 3:30').toBeLessThanOrEqual(212_000);

    // ---- D4: goal widget visible at 100 % of the 1 s samples (tutorial: the step with its n/4 progress)
    const bad = goal.filter(g => !g.ok);
    console.log(`[D4] ${goal.length} samples (${goal.filter(g => g.tut).length} in the tutorial), ${bad.length} without a visible goal widget`);
    expect(goal.length).toBeGreaterThanOrEqual(205);
    expect(bad.slice(0, 10).map(g => `${g.rt}: ${g.why}`), 'D4: goal widget visible 100 %').toEqual([]);

    // ---- D6: no blocking text popup in the first 60 s
    const modals = goal.filter(g => g.rt <= 60_000 && g.modal);
    expect(goal.filter(g => g.rt <= 60_000).length).toBeGreaterThanOrEqual(58);
    expect(modals.map(g => g.rt), 'D6: no modal in the first 60 s').toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.tu-veil')!).pointerEvents), 'the tutorial dimming never takes input').toBe('none');

    // ---- E: every canvas tap command answers with its tap fx in the frame of the input; every tap/click plays a
    //      sound ≤ 1 frame after the input
    const cmds = ev.filter(e => e.type === 'cmd' && TAP_CMDS.has(e.name!));
    expect(cmds.length, 'canvas tap commands seen').toBeGreaterThanOrEqual(4);
    const fxBad: string[] = [];
    for (const c of cmds) {
      if (!fx.some(f => f.frame === c.frame && f.kind === `tap:${c.name}${c.ok ? '' : ':fail'}`)) fxBad.push(`${c.name}@${c.rt} frame ${c.frame}: no tap fx in that frame`);
    }
    // every world tap the driver made reached the canvas in the frame being prepared and ran its command in that frame
    const TAP_CLICKS = /^(horn|stamp|escapee|ring-step0|ring-step2)$/;
    for (const k of clicks.filter(c => TAP_CLICKS.test(c.what))) {
      if (!k.canvas) { fxBad.push(`${k.what}: the tap landed on ${k.under}, not on the canvas`); continue; }
      const c = cmds.find(e => e.frame === k.frame);
      if (!c) fxBad.push(`${k.what}@${k.rt}: no tap command in frame ${k.frame}`);
      else if (k.inputFrame !== c.frame) fxBad.push(`${k.what}: input frame ${k.inputFrame} ≠ command frame ${c.frame}`);
    }
    // and every player input that ran a command (canvas tap, one-tap Wash Hut ghost, upgrade button) has visual feedback
    // (juice fx) in the very frame the input landed in; a tap that only selects opens its panel (DOM) instead
    let withCmd = 0;
    for (const k of clicks) {
      const c = ev.find(e => e.type === 'cmd' && e.frame === k.frame);
      if (!c) continue;
      withCmd++;
      if (!fx.some(f => f.frame === k.frame)) fxBad.push(`${k.what}@${k.rt} (${c.name}): no fx in frame ${k.frame}`);
    }
    console.log(`[E] ${withCmd} inputs ran a command; fx frames checked`);
    expect(withCmd).toBeGreaterThanOrEqual(6);
    expect(fxBad, 'E: tap feedback in the same frame').toEqual([]);
    // the sound a player input triggers: the first UI play() between the input and the end of its handlers (hover
    // blips come from the pointer moving over a button, not from the tap); its delay to the input event that ran it
    const audBad: string[] = [], delays: number[] = [];
    for (const k of clicks) {
      const p = plays.find(q => q.src === 'ui' && q.name !== 'hover' && q.t >= k.t0 && q.t <= k.t1);
      if (!p) { audBad.push(`${k.what}@${k.rt}: no mixer.play for the input`); continue; }
      delays.push(p.t - p.inputH);
      if (!(p.inputH >= k.t0) || p.t - p.inputH > FRAME_MS) audBad.push(`${k.what}: play('${p.name}') ${(p.t - p.inputH).toFixed(1)} ms after the input`);
      if (p.frame - k.frame > 1) audBad.push(`${k.what}: play('${p.name}') ${p.frame - k.frame} frames after the input`);
    }
    console.log(`[E] ${clicks.length} player inputs; mixer.play delays ${delays.map(d => d.toFixed(2)).join(', ')} ms`);
    expect(audBad, 'E: mixer.play ≤ 1 frame after the input').toEqual([]);
    // coins: floating plaques and fly-ins; the build is animated; every unlock is celebrated in the frame of its event
    const kinds = new Set(fx.map(f => f.kind));
    for (const k of ['coinsFloat', 'coinsSpent', 'coinsFly', 'build', 'built', 'release', 'upgrade', 'needIcon', 'escapeeMark', 'celebrate:first']) expect(kinds.has(k), `E: fx '${k}' seen`).toBe(true);
    // counters tween: after each bigger income / spend the coin pill rolls through in-between values (0.4 s ease)
    const coinTxt = await acc<{ txt: string; val: number; coins: number; frame: number; rt: number }[]>(page, 'coinTxt');
    const moves = ev.filter(e => (e.type === 'coins' && Math.abs(e.amount ?? 0) >= 20) || e.type === 'build' || e.type === 'upgrade');
    let tweened = 0;
    for (const m of moves) {
      const before = [...coinTxt].reverse().find(c => c.frame < m.frame);
      const after = coinTxt.filter(c => c.frame >= m.frame && c.frame <= m.frame + 24);
      if (!before || !after.length) continue;
      const end = after[after.length - 1].val;
      const mid = new Set(after.map(c => c.val).filter(v => v > Math.min(before.val, end) && v < Math.max(before.val, end)));
      if (mid.size >= 2) tweened++;
    }
    console.log(`[E] coin counter: ${coinTxt.length} displayed values; ${tweened} of ${moves.length} bigger coin changes rolled through ≥ 2 in-between values`);
    expect(moves.length).toBeGreaterThanOrEqual(3);
    expect(tweened, 'E: the coin counter tweens').toBeGreaterThanOrEqual(Math.ceil(moves.length / 2));
    const unlocks = ev.filter(e => e.type === 'unlock');
    expect(unlocks.map(u => u.what), 'the tutorial end unlocks the Knitting Nook').toContain('workshop');
    for (const u of unlocks) expect(fx.some(f => f.kind === 'celebrate:unlock' && f.frame === u.frame), `E: unlock ${u.what} celebrated in its frame`).toBe(true);
    // agents: walking rascals advance their walk phase, face their direction (W mirrors the sprite) and show need icons
    const walking = agentSamples[0].filter((a: any) => a.moving);
    expect(walking.length, 'some rascals walk').toBeGreaterThan(0);
    const advanced = walking.filter((a: any) => { const b = agentSamples[1].find((x: any) => x.id === a.id); return b && b.moving && Math.abs(b.phase - a.phase) > 0.05; });
    expect(advanced.length, 'E: walk animation advances').toBeGreaterThan(0);
    const dirs = new Set(agentSamples.flat().map((a: any) => a.dir));
    expect(dirs.size, 'E: agents face different directions').toBeGreaterThanOrEqual(2);
    for (const a of agentSamples.flat()) expect(a.flip, `facing W mirrors agent ${a.id}`).toBe(a.dir === 'W' ? -1 : 1);
    console.log(`[E] agents: ${agentSamples[0].length} rascals, ${walking.length} walking, dirs ${[...dirs].join('')}, need icons now ${juice.needs}`);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------- D9 skip
test.describe('skip path (game time)', () => {
  test('D9 Skip at second 3: the clipboard shows the Wash Hut goal ≤ 1 s later, release ≤ 120 s; tunnel still comes by 3:30; D4 goal widget 100 %', async ({ page }) => {
    test.setTimeout(420_000);
    await page.addInitScript(instr);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await setup(page);
    await gotoGame(page, 'capture=1&lang=en', 0);
    await hook(page);
    await renderOff(page);
    while ((await snap(page)).rt < 3000) await stepN(page, 3);
    const s0 = await snap(page);
    expect(s0.active).toBe(true);
    expect(s0.skipVis, 'Skip visible').toBe(true);
    await renderOn(page);
    await page.locator('.tu-bub.on .tu-skip, .cb-skip').filter({ visible: true }).first().click();
    const skipRt = s0.rt;
    // "immediately": step frame by frame until the clipboard shows the Wash Hut goal
    let shownAt = -1;
    for (let i = 0; i < 60 && shownAt < 0; i++) {
      await stepN(page, 1);
      const r = await page.evaluate(() => {
        const g = window as unknown as Win;
        const vis = (el: Element | null) => !!el && (el as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
        const el = [document.querySelector('.cb-card .cb-goal-txt'), document.querySelector('.cb-chip .cb-chip-txt')].find(vis);
        return { rt: g.__sim.rtMs, txt: el?.textContent ?? '', skipped: g.__sim.tutorial.skipped };
      });
      if (r.skipped && /Wash Hut/.test(r.txt)) shownAt = r.rt;
    }
    console.log(`[D9] skipped at ${skipRt} ms, Wash Hut goal visible at ${shownAt} ms`);
    expect(shownAt, 'clipboard shows the Wash Hut goal').toBeGreaterThan(0);
    expect(shownAt - skipRt, 'D9: clipboard immediately (≤ 1 s)').toBeLessThanOrEqual(1000);
    const after = await page.evaluate(() => ({ ring: !!document.querySelector('.tu-ring.on'), hand: !!document.querySelector('.tu-hand.on'), bub: !!document.querySelector('.tu-bub.on'), veil: !!document.querySelector('.tu-veil.on') }));
    expect(after, 'Skip ends pointer and bubbles').toEqual({ ring: false, hand: false, bub: false, veil: false });
    await page.screenshot({ path: `${SHOTS}/skip-clipboard.png`, timeout: 90_000 });
    await renderOff(page);
    // the player does nothing else: the scripted beats run on their own
    await drive(page, { endMs: 211_000, followPointer: false, worldTaps: false });
    const ev = await acc<AccEvent[]>(page, 'ev');
    const goal = await acc<GoalSample[]>(page, 'goal');
    const rel = ev.find(e => e.type === 'release'), tunnel = ev.find(e => e.type === 'tunnel');
    console.log(`[D9] release at ${rel && rel.rt / 1000} s, tunnel at ${tunnel && tunnel.rt / 1000} s; D4 ${goal.length} samples, ${goal.filter(g => !g.ok).length} bad`);
    expect(ev.find(e => e.type === 'tutorialDone')?.skipped).toBe(true);
    expect(rel, 'a release happened').toBeTruthy();
    expect(rel!.rt, 'D9: release ≤ 120 s').toBeLessThanOrEqual(120_000);
    expect(tunnel, 'spoon tunnel').toBeTruthy();
    expect(tunnel!.rt, 'tunnel ≤ 3:30 on the skip path too').toBeLessThanOrEqual(210_000);
    expect(goal.length).toBeGreaterThanOrEqual(205);
    expect(goal.filter(g => !g.ok).slice(0, 10).map(g => `${g.rt}: ${g.why}`), 'D4 on the skip path').toEqual([]);
    expect(errors).toEqual([]);
  });
});


// ---------------------------------------------------------------------------------------------------------- D4 + Skip with a menu open
/**
 * Verifier findings: on short phone screens the Rooms / Staff sheet reached up to the top bar and covered the compact
 * clipboard chip (D4), and in the tutorial no Skip was left on screen while it was open (Brief §6.2 "Skip tutorial ist
 * dauerhaft sichtbar"). Every frame with a menu open – in the tutorial and after it – the goal widget must pass the D4
 * probe and (tutorial) a Skip must be visible and the top element at its centre.
 */
const MENU_SIZES = [
  { name: '844x390 touch', viewport: { width: 844, height: 390 }, touch: true },
  { name: '667x375 touch', viewport: { width: 667, height: 375 }, touch: true },
  { name: '800x450 touch', viewport: { width: 800, height: 450 }, touch: true },
  { name: '800x450', viewport: { width: 800, height: 450 }, touch: false },
];
for (const sz of MENU_SIZES) {
  test.describe(`menu open @ ${sz.name}`, () => {
    test.use({ viewport: sz.viewport, isMobile: sz.touch, hasTouch: sz.touch });
    test(`D4 goal widget uncovered and Skip on screen while the Rooms / Staff menu is open @ ${sz.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript(instr);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await setup(page);
      await gotoGame(page, 'capture=1&lang=de', 0);
      await hook(page);
      await renderOff(page);
      const probe = (n: number, tag: string) => page.evaluate(([k, tg]) => {
        const g = window as unknown as Win;
        const bad: string[] = [];
        let frames = 0, skipFrames = 0;
        for (let i = 0; i < k; i++) {
          g.__step(1);
          if (!document.querySelector('.bb-menu:not([hidden])')) continue;
          frames++;
          const goal = g.__accGoal();
          if (!goal.ok) bad.push(`${tg} f${i}: D4 ${goal.why}`);
          if (g.__sim.tutorial.active) {
            const skips = [...document.querySelectorAll<HTMLElement>('.tu-bub.on .tu-skip, .cb-skip')].filter(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0);
            const hit = skips.some(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.tu-skip, .cb-skip') === e; });
            if (hit) skipFrames++; else bad.push(`${tg} f${i}: no clickable Skip (bubble ${g.__tutorial.mode()}${g.__tutorial.away() ? ', away' : ''})`);
          }
        }
        return { bad, frames, skipFrames };
      }, [n, tag] as const);
      const all: string[] = [];
      let frames = 0, skipFrames = 0;
      const run = async (menu: string | null, n: number, tag: string) => {
        await page.evaluate(m => (window as unknown as Win).__ctx.menu.set(m), menu);
        const r = await probe(n, tag);
        all.push(...r.bad); frames += r.frames; skipFrames += r.skipFrames;
      };
      // tutorial step 1 (the ferry honks) and step 2 (Wash Hut: the card in the Rooms menu is the target)
      await run('rooms', 60, 'tut1 rooms');
      await run('staff', 40, 'tut1 staff');
      await page.evaluate(() => { const g = window as unknown as Win; g.__ctx.menu.set(null); for (let i = 0; i < 40 && g.__sim.tutorial.step < 1; i++) { if (g.__sim.ferry.state === 'arriving' && !g.__sim.ferry.tapped) g.__ctx.cmd.tapHorn(g.__sim); g.__step(15); } });
      expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.step)).toBe(1);
      await run('rooms', 60, 'tut2 rooms');
      await page.evaluate(() => (window as unknown as Win).__ctx.toast('Toast', { kind: 'info', icon: 'coin', ms: 2500 }));
      await run('rooms', 40, 'tut2 rooms+toast');
      await run('staff', 40, 'tut2 staff');
      if (sz.name === '844x390 touch') {
        await page.evaluate(() => (window as unknown as Win).__ctx.menu.set('rooms'));
        await renderOn(page);
        await page.screenshot({ path: `${SHOTS}/menu-tutorial-844x390.png`, timeout: 60_000 });
        await renderOff(page);
      }
      // after the tutorial (skipped): the clipboard chip shows the Wash Hut goal
      await page.evaluate(() => { const g = window as unknown as Win; g.__ctx.menu.set(null); g.__step(2); });
      await page.locator('.tu-bub.on .tu-skip, .cb-skip').filter({ visible: true }).first().click();
      await page.evaluate(() => (window as unknown as Win).__step(30));
      expect(await page.evaluate(() => (window as unknown as Win).__sim.tutorial.active)).toBe(false);
      await run('rooms', 60, 'post rooms');
      await run('staff', 60, 'post staff');
      console.log(`[menu ${sz.name}] ${frames} menu frames, ${skipFrames} tutorial frames with a clickable Skip, ${all.length} bad`);
      if (all.length) console.log(all.slice(0, 15).join('\n'));
      expect(frames).toBeGreaterThanOrEqual(350);
      expect(skipFrames).toBeGreaterThanOrEqual(230);
      expect(all).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
