/* eslint-disable @typescript-eslint/no-explicit-any -- in-page probes read untyped window hooks */
/**
 * Shared kit for the M4 acceptance specs (m4-onboarding.spec.ts, m4-accept.spec.ts): page instrumentation, a game-time
 * stepper (?capture=1 + window.__step: 1/30 s per frame, deterministic and independent of SwiftShader speed) and a
 * tutorial / first-minutes player driver that only taps where a player would tap.
 */
import type { Page } from '@playwright/test';

export type Win = Record<string, any>;
export interface AccEvent { type: string; rt: number; frame: number; t: number; name?: string; ok?: boolean; id?: number; what?: string; roomId?: number; rtype?: string; kind?: string; amount?: number; scripted?: boolean; skipped?: boolean; step?: number }
export interface AccPlay { name: string; t: number; frame: number; src: string; inputH: number }
export interface AccInput { ty: string; t: number; frame: number }
export interface GoalSample { rt: number; ok: boolean; why: string; mode: string; flow: number; modal: boolean; tut: boolean }
export interface Click { what: string; rt: number; x: number; y: number; frame: number; canvas: boolean; inputFrame: number; inputH: number; under: string; t0: number; t1: number }

/**
 * Init script (runs before any page script): records every input (capture phase), and after boot – installed by
 * hook() – every sim event (with the juice frame it was dispatched in), every mixer.play() call (with its frame), the
 * full juice log (window.__fxLog is capped at 300, harvested after every stepped frame) and, once per second of game
 * time, the D4/D6 probes.
 */
export function instr() {
  const g = window as any;
  const A = (g.__acc = { inputs: [] as any[], ev: [] as any[], fx: [] as any[], plays: [] as any[], goal: [] as any[], coinTxt: [] as any[], hooked: false, lastFx: null as any, nextGoalRt: 0, raf: [] as number[] });
  for (const ty of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend', 'wheel']) {
    window.addEventListener(ty, () => { A.inputs.push({ ty, t: performance.now(), frame: g.__fxFrame ?? -1 }); }, { capture: true, passive: true });
  }
  const raf = () => { A.raf.push(performance.now()); if (A.raf.length > 20000) A.raf.splice(0, 10000); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const vis = (el: Element | null) => !!el && (el as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  /** D4 + D6 probe: a goal widget is visible and readable (and not covered); no blocking modal; the flow bar is shown */
  g.__accGoal = () => {
    const w = g.__sim;
    const modal = [...document.querySelectorAll('[aria-modal="true"], .ov-modal')].some(el => !el.closest('[hidden]') && vis(el));
    // flow bar: every stage as a button, or (narrow topbar, collapsed after measuring) the summary with one icon per stage
    const flow = Math.max([...document.querySelectorAll('.tb .stages .st')].filter(vis).length, [...document.querySelectorAll('.tb .flow .sum .ic')].filter(vis).length);
    const card = document.querySelector('.cb-card'), chip = document.querySelector('.cb-chip');
    const useCard = vis(card);
    const el = useCard ? card : vis(chip) ? chip : null;
    const tut = !!w.tutorial.active;
    const res = { rt: w.rtMs, ok: false, why: '', mode: useCard ? 'card' : el ? 'chip' : 'none', flow, modal, tut };
    if (!el) { res.why = 'no clipboard card/chip visible'; return res; }
    // measured as it is right now – a running goal-change animation included (it runs on wall-clock time and stands
    // still while game time is stepped, so its first keyframe must already be on screen and readable)
    const b = el.getBoundingClientRect();
    if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) { res.why = `widget off screen ${[b.left, b.top, b.right, b.bottom].map(Math.round)}`; return res; }
    let op = 1;
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.6) { res.why = `widget faded (opacity ${op.toFixed(2)})`; return res; }
    const txtEl = el.querySelector(useCard ? '.cb-goal-txt' : '.cb-chip-txt');
    const numEl = el.querySelector(useCard ? '.cb-prog-num' : '.cb-chip-num');
    const txt = (txtEl?.textContent ?? '').trim(), num = (numEl?.textContent ?? '').trim();
    if (!txt || !vis(txtEl)) { res.why = 'goal text empty/hidden'; return res; }
    if (!/^\d[\d.,]*\/\d[\d.,]*$/.test(num) || !vis(numEl)) { res.why = `progress "${num}" missing`; return res; }
    if (tut) {
      const want = `${Math.min(3, Math.max(0, w.tutorial.step)) + 1}/4`;
      const bub = document.querySelector('.tu-bub.on .tu-prog-n');
      if (num !== want && !(vis(bub) && bub!.textContent!.trim() === want)) { res.why = `tutorial progress "${num}" ≠ ${want}`; return res; }
    }
    // not covered: the centre of the goal text and of the progress number hit the clipboard itself
    for (const e of [txtEl!, numEl!]) {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !hit.closest('.cb')) { res.why = `covered by ${hit ? hit.tagName.toLowerCase() + '.' + String((hit as HTMLElement).className).split(' ')[0] : 'nothing'}`; return res; }
    }
    res.ok = true;
    return res;
  };
  g.__accHook = () => {
    if (A.hooked) return true;
    const ctx = g.__ctx, au = g.__audio;
    if (!ctx || !au || !g.__sim) return false;
    A.hooked = true;
    ctx.onEvent((e: any) => {
      const r: any = { type: e.type, rt: g.__sim.rtMs, frame: g.__fxFrame ?? -1, t: performance.now() };
      for (const k of ['name', 'ok', 'id', 'what', 'roomId', 'rtype', 'kind', 'amount', 'scripted', 'skipped', 'step']) if (e[k] !== undefined) r[k] = e[k];
      A.ev.push(r);
    });
    const m = au.mixer, play = m.play.bind(m);
    m.play = (name: string, opts?: any) => { A.plays.push({ name, t: performance.now(), frame: g.__fxFrame ?? -1, src: opts?.src ?? 'ui', inputH: m.inputH }); return play(name, opts); };
    return true;
  };
  g.__accHarvest = () => {
    const log = g.__fxLog as any[] | undefined;
    if (!log) return;
    const i = A.lastFx ? log.lastIndexOf(A.lastFx) : -1;
    for (let k = i + 1; k < log.length; k++) A.fx.push(log[k]);
    if (log.length) A.lastFx = log[log.length - 1];
  };
  /** step n frames of 1/30 s, harvesting the juice log every frame and probing D4/D6 at every whole second of game time */
  g.__accStep = (n: number) => {
    for (let i = 0; i < n; i++) {
      g.__step(1);
      g.__accHarvest();
      // the topbar coin counter as the player reads it, on every change (E: counters tween)
      const ct = document.querySelector('.tb .pill.coins .num')?.textContent ?? '';
      const lastCt = A.coinTxt.length ? A.coinTxt[A.coinTxt.length - 1].txt : null;
      if (ct !== lastCt) A.coinTxt.push({ txt: ct, val: Number(ct.replace(/\D/g, '')), coins: Math.round(g.__sim.coins), frame: g.__fxFrame, rt: g.__sim.rtMs });
      const rt = g.__sim.rtMs;
      if (rt >= A.nextGoalRt) { A.goal.push(g.__accGoal()); A.nextGoalRt = (Math.floor(rt / 1000) + 1) * 1000; }
    }
  };
}

export const hook = (page: Page) => page.waitForFunction(() => (window as unknown as Win).__accHook(), null, { timeout: 30_000 });
export const stepN = (page: Page, n: number) => page.evaluate(k => (window as unknown as Win).__accStep(k), n);
/** canvas render off/on: stepping thousands of frames only needs the sim, the DOM layers and the juice bookkeeping */
export const renderOff = (page: Page) => page.evaluate(() => { const a = (window as unknown as Win).__game.app; a.__render ??= a.render; a.render = () => undefined; });
export const renderOn = (page: Page) => page.evaluate(() => { const a = (window as unknown as Win).__game.app; if (a.__render) a.render = a.__render; a.render(); });
export const acc = <T = any>(page: Page, key: string) => page.evaluate(k => (window as unknown as Win).__acc[k], key) as Promise<T>;

export interface Snap {
  rt: number; active: boolean; done: boolean; skipped: boolean; step: number; ferry: string; tapped: boolean; fsince: number; atGate: boolean;
  esc: { id: number; x: number; y: number }[]; ring: { x: number; y: number } | null; sel: unknown; released: number; zoom: number;
  bubWords: number; bubText: string; skipVis: boolean; skipLabel: string | null; skipTip: boolean;
}
export const snap = (page: Page) => page.evaluate(() => {
  const g = window as unknown as Win, w = g.__sim, ctx = g.__ctx;
  const ringEl = document.querySelector('.tu-ring.on') as HTMLElement | null;
  const m = ringEl ? /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(ringEl.style.transform) : null;
  const vis = (el: Element | null) => !!el && (el as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
  const bub = document.querySelector('.tu-bub.on');
  const bubText = bub ? [...bub.querySelectorAll('.tu-text, .tu-sub:not(.hide)')].map(e => e.textContent ?? '').join(' ').trim() : '';
  const skip = document.querySelector('.tu-bub.on .tu-skip') as HTMLElement | null;
  const skipAny = [...document.querySelectorAll('.tu-bub.on .tu-skip, .cb-skip')].find(vis) as HTMLElement | undefined;
  return {
    rt: w.rtMs, active: w.tutorial.active, done: w.tutorial.done, skipped: w.tutorial.skipped, step: w.tutorial.step,
    ferry: w.ferry.state, tapped: w.ferry.tapped, fsince: w.ferry.sinceMs, atGate: w.agents.some((a: any) => a.state === 'atGate'),
    esc: w.agents.filter((a: any) => a.state === 'escaping').map((a: any) => ({ id: a.id, x: a.x, y: a.y })),
    ring: m ? { x: +m[1], y: +m[2] } : null, sel: ctx.selection.get(), released: w.stats.released, zoom: ctx.cam.zoom,
    bubWords: bubText.split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)).length, bubText,
    skipVis: vis(skip) || !!skipAny, skipLabel: (skip ?? skipAny)?.getAttribute('aria-label') ?? null,
    skipTip: !!(skip ?? skipAny) && (!!g.__tipOf?.(skip ?? skipAny) || !!(skip ?? skipAny)!.getAttribute('title')),
  } as Snap;
});

/** where a world point (tile units) is on screen, and what DOM element is there */
export const tileToScreen = (page: Page, tx: number, ty: number) => page.evaluate(([x, y]) => {
  const g = window as unknown as Win;
  const p = g.__ctx.cam.worldToScreen(x * 32, y * 32), r = g.__ctx.canvas.getBoundingClientRect();
  const sx = p.x + r.left, sy = p.y + r.top;
  const el = sx >= 0 && sy >= 0 && sx < innerWidth && sy < innerHeight ? document.elementFromPoint(sx, sy) : null;
  return { x: sx, y: sy, canvas: el === g.__ctx.canvas, under: el ? el.tagName.toLowerCase() + '.' + String((el as HTMLElement).className).split(' ')[0] : 'offscreen' };
}, [tx, ty]);
/** smoothed on-screen position of an agent's body (juice: view.agentPos − 18 world px) */
export const agentToScreen = (page: Page, id: number) => page.evaluate(i => {
  const g = window as unknown as Win;
  const d = g.__view?.agentPos(i);
  if (!d) return null;
  const p = g.__ctx.cam.worldToScreen(d.x, d.y - 18), r = g.__ctx.canvas.getBoundingClientRect();
  const sx = p.x + r.left, sy = p.y + r.top;
  const el = sx >= 0 && sy >= 0 && sx < innerWidth && sy < innerHeight ? document.elementFromPoint(sx, sy) : null;
  return { x: sx, y: sy, canvas: el === g.__ctx.canvas, under: el ? el.tagName.toLowerCase() : 'offscreen' };
}, id);

/** one real mouse/touch tap; records the frame it lands in (the next frame to be prepared) and the mixer's input time */
export async function tapAt(page: Page, x: number, y: number, what: string, touch = false): Promise<Click> {
  const before = await page.evaluate(([px, py]) => {
    const g = window as unknown as Win;
    const el = document.elementFromPoint(px, py);
    return { t0: performance.now(), rt: g.__sim.rtMs, frame: g.__fxFrame, canvas: el === g.__ctx.canvas, under: el ? el.tagName.toLowerCase() + '.' + String((el as HTMLElement).className).split(' ')[0] : 'none' };
  }, [x, y]);
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  const after = await page.evaluate(() => { const g = window as unknown as Win; return { t1: performance.now(), inputFrame: g.__fxInput.frame, inputH: g.__audio.mixer.inputH }; });
  return { what, rt: before.rt, x, y, frame: before.frame, canvas: before.canvas, under: before.under, inputFrame: after.inputFrame, inputH: after.inputH, t0: before.t0, t1: after.t1 };
}

export interface DriveOpts {
  endMs: number;
  /** player reaction time (game ms) before tapping a target that just appeared */
  reactMs?: number;
  /** tap the tutorial pointer target (tutorial path) */
  followPointer?: boolean;
  /** after the tutorial: tap the honking ferry, stamp at the gate, catch spoon-tunnel escapees */
  worldTaps?: boolean;
  touch?: boolean;
  /** stop early once this returns true */
  until?: (s: Snap) => boolean;
  onSnap?: (s: Snap) => void;
}

/**
 * Plays like a person who follows the pointer: steps game time in 0.2 s slices; when the tutorial ring is on, waits a
 * reaction time and taps exactly where the ring is NOW (its transform is read again right before the tap – the camera
 * moves). After the tutorial it answers the world prompts (horn, stamp, escapee). The camera is only moved through
 * ctx.focusTile – the same fly the clipboard's "Show" and the tip chip use – when a target is off screen.
 */
export async function drive(page: Page, o: DriveOpts) {
  const react = o.reactMs ?? 1000;
  const clicks: Click[] = [];
  let ringKey = '', ringSince = -1, lastWorldTap = -1e9;
  const seenSince: Record<string, number> = {};
  const due = (k: string, rt: number, cond: boolean) => { if (!cond) { delete seenSince[k]; return false; } seenSince[k] ??= rt; return rt - seenSince[k] >= react; };
  for (let guard = 0; guard < 20000; guard++) {
    await stepN(page, 6);
    const s = await snap(page);
    o.onSnap?.(s);
    if (s.rt >= o.endMs || o.until?.(s)) break;
    if (o.followPointer && s.active && s.ring) {
      const k = `${s.step}:${Math.round(s.ring.x / 30)},${Math.round(s.ring.y / 30)}`;
      if (k !== ringKey) { ringKey = k; ringSince = s.rt; }
      if (s.rt - ringSince >= react) {
        const now = await snap(page); // read the ring again right before the tap
        if (now.ring && now.ring.x >= 0 && now.ring.y >= 0 && now.ring.x < (page.viewportSize()?.width ?? 1e9) && now.ring.y < (page.viewportSize()?.height ?? 1e9)) {
          clicks.push(await tapAt(page, now.ring.x, now.ring.y, `ring-step${now.step}`, o.touch));
          ringSince = now.rt + 1500; // a person waits a moment before tapping the same spot again
        }
      }
      continue;
    }
    if (!o.worldTaps || s.active || s.rt - lastWorldTap < 800) continue;
    const vw = page.viewportSize()?.width ?? 1280, vh = page.viewportSize()?.height ?? 720;
    const onScreen = (p: { x: number; y: number; canvas: boolean }) => p.canvas && p.x > 4 && p.y > 4 && p.x < vw - 4 && p.y < vh - 4;
    if (s.esc.length) {
      const e = s.esc[0];
      if (!due(`esc${e.id}`, s.rt, true)) continue;
      let p = await agentToScreen(page, e.id);
      if (!p || !onScreen(p)) { await page.evaluate(([x, y]) => (window as unknown as Win).__ctx.focusTile(x, y), [e.x, e.y]); await stepN(page, 20); p = await agentToScreen(page, e.id); }
      if (p && onScreen(p)) { clicks.push(await tapAt(page, p.x, p.y, 'escapee', o.touch)); lastWorldTap = s.rt; }
      continue;
    }
    if (due('horn', s.rt, s.ferry === 'arriving' && !s.tapped && s.rt - s.fsince > 2000)) {
      let p = await tileToScreen(page, -1.75, 23.4 - 2.6);
      if (!onScreen(p)) { await page.evaluate(() => (window as unknown as Win).__ctx.focusTile(-1, 21)); await stepN(page, 20); p = await tileToScreen(page, -1.75, 23.4 - 2.6); }
      if (onScreen(p)) { clicks.push(await tapAt(page, p.x, p.y, 'horn', o.touch)); lastWorldTap = s.rt; }
      continue;
    }
    if (due('stamp', s.rt, s.atGate)) {
      let p = await tileToScreen(page, 17, 22.6 - 1.3);
      if (!onScreen(p)) { await page.evaluate(() => (window as unknown as Win).__ctx.focusTile(17, 21)); await stepN(page, 20); p = await tileToScreen(page, 17, 22.6 - 1.3); }
      if (onScreen(p)) { clicks.push(await tapAt(page, p.x, p.y, 'stamp', o.touch)); lastWorldTap = s.rt; }
      continue;
    }
    if (s.sel) await page.keyboard.press('Escape'); // a tap that selected something: close the panel again
  }
  return clicks;
}
