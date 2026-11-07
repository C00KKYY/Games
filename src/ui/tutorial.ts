/**
 * Onboarding layer (Brief §6.1, §6.2, §5; tests D1–D10; docs/UI_DESIGN.md).
 *
 *  - Hand pointer: animated finger (touch) or mouse cursor (desktop) on the target of the current tutorial step. It
 *    tracks the camera every frame (world → screen through ctx.cam) and moves with `transform` only.
 *      0 horn    → the honking ferry (tapping it = cmd.tapHorn in tools.ts)
 *      1 wash    → a one-tap Wash Hut ghost at TUTORIAL_WASH (Brief: "Waschhaus (1 Tap)"). If the player goes the long
 *                  way instead: Rooms button → Wash Hut card → placement spot (touch: the ✓ of tools.ts)
 *      2 stamp   → follows Earl while he showers, then taps the Parole Gate (cmd.stamp in tools.ts)
 *      3 upgrade → the Canteen, then the first upgrade button of its room panel
 *  - Speech bubble of the badger warden: the step text from the base table (`tut.*`, ≤ 8 words incl. the optional wait
 *    line, D1), progress "1/4" and a permanent "Skip tutorial" button styled like the clipboard buttons (while it shows,
 *    the clipboard hides its own Skip: one Skip on screen). It never covers the target, the room the step is about, the
 *    clipboard, the controls overlay, an open panel / menu / tool layer or a toast; with no free spot it shrinks to dots +
 *    Skip, and only as a last resort steps aside (then the clipboard's Skip is back).
 *  - Dimming: a veil with a soft cut-out around the target dims the rest of the UI and the world. It never takes
 *    pointer events, the sim keeps running.
 *  - Controls overlay: the first 20 s of a fresh game, bottom left (row, 2 × 2 or one column – whichever fits beside
 *    the ferry and the build bar; else left under the clipboard), mouse or touch variant. Fades out; the help modal
 *    (H key / "?" button in the top bar, both already exist) brings the full list back.
 *  - Just-in-time tips after the tutorial: ≤ 1 per 30 s, a small non-blocking chip under the clipboard that hides
 *    itself after a few seconds or as soon as its reason is gone (jitStillValid); tapping it shows the spot. Driven by
 *    world state (jitPick / jitStillValid, pure and unit tested).
 *
 * Reads only ctx.w, writes only through ctx.cmd; sim events arrive through ctx.onEvent. Every text comes from ctx.t.
 */
import './tutorial.css';
import type { UICtx, Component } from './ctx';
import type { Key } from '../i18n/i18n';
import type { World, Room, Agent } from '../sim/types';
import { AF } from '../sim/types';
import { TUTORIAL_STEPS, OBJECTIVES } from '../sim/objectives';
import { tileReason } from '../sim/rooms';
import { ROOMS, roomCost, CLEAN, type RoomType } from '../content/balance';
import { FERRY_POS, GATE_X, GATE_Y, TUTORIAL_WASH } from '../content/site1';
import { buildGoal, guideStep, suggestSpot, type GuideStep } from './guide';

const TILE = 32;                       // world units per tile (render/world.ts)
const TICK_MS = 100;                   // throttled DOM work (≤ 10/s)
const CONTROLS_MS = 20000;             // controls overlay on screen (Brief §6.2)
export const JIT_GAP_MS = 30000;       // ≤ 1 tip per 30 s (Brief §6.2)
const JIT_SHOW_MS = 7000;              // a tip hides itself after this
const JIT_KIND_COOLDOWN_MS = 180000;   // the same tip again at the earliest after 3 min …
const JIT_KIND_MAX = 3;                // … and at most 3 times per session
const JIT_AFTER_TUTORIAL_MS = 6000;    // first tip a few seconds after the tutorial ends

// ------------------------------------------------------------------------------------------------ pure helpers
type Step = typeof TUTORIAL_STEPS[number];
/** the optional wait lines shown under the step text, one at a time (counted for D1 together with the step text):
 *  stamp – while Earl showers ("a shower reforms him"), then while the reformed Earl walks to the gate */
export const STEP_WAIT: Partial<Record<Step, Key[]>> = { wash: ['tutorial.wait.build'], stamp: ['tutorial.wait.earl', 'tutorial.wait.earlGate'] };
export const stepKeys = (s: Step): Key[] => [`tut.${s}`, ...(STEP_WAIT[s] ?? [])];
const words = (x: string) => x.split(/\s+/).filter(Boolean).length;
/** most words a player reads at once in one tutorial step (step text + the longest wait line), D1 */
export const stepWords = (s: Step, t: (k: Key) => string) => words(t(`tut.${s}`)) + Math.max(0, ...(STEP_WAIT[s] ?? []).map(k => words(t(k))));

export type JitKind = 'escape' | 'horn' | 'drag' | 'beds' | 'queue' | 'dirty' | 'janitor' | 'crates' | 'earnFaster' | 'coins' | 'mood';
/** priority order: urgent world taps first, then build advice */
export const JIT_ORDER: JitKind[] = ['escape', 'horn', 'drag', 'beds', 'queue', 'dirty', 'janitor', 'crates', 'earnFaster', 'coins', 'mood'];
/** how long a condition must hold before it counts (ms) */
const SUSTAIN: Partial<Record<JitKind, number>> = { queue: 5000, dirty: 3000, crates: 5000, earnFaster: 4000, coins: 15000, mood: 10000, beds: 3000 };
/** kinds that may come back more often (short, urgent world taps) */
const REPEATABLE: Partial<Record<JitKind, number>> = { escape: 60000, horn: 60000 };
export interface JitMemo { lastMs: number; count: Partial<Record<JitKind, number>>; kindMs: Partial<Record<JitKind, number>>; since: Partial<Record<JitKind, number>> }
export const newJitMemo = (): JitMemo => ({ lastMs: -1e12, count: {}, kindMs: {}, since: {} });
export interface JitPick { kind: JitKind; room?: RoomType; x?: number; y?: number; roomId?: number; agentId?: number }

/** room type the current clipboard goal asks for (only goals that are "build one X") */
const GOAL_ROOM: Record<string, RoomType> = { wash: 'wash', workshop: 'workshop', classroom: 'classroom', guard: 'guard', beds12: 'bunk', yard: 'yard', beds24: 'bunk' };
export const minCost = (type: RoomType) => roomCost(type, ROOMS[type].minW, ROOMS[type].minH);
const isRascal = (a: Agent) => a.kind === 'rascal' || a.kind === 'vip';
const centreOf = (r: Room) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** every tip whose world condition holds right now (unsustained) */
function jitConditions(w: World, buildTool: boolean): JitPick[] {
  const out: JitPick[] = [];
  const esc = w.agents.find(a => a.state === 'escaping');
  if (esc) out.push({ kind: 'escape', x: esc.x, y: esc.y - 0.5, agentId: esc.id });
  if (w.ferry.state === 'arriving' && !w.ferry.tapped && w.rtMs - w.ferry.sinceMs >= 3000) out.push({ kind: 'horn', x: FERRY_POS.x, y: FERRY_POS.y - 2.4 });
  if (buildTool) out.push({ kind: 'drag' });
  const rs = w.agents.filter(isRascal);
  if (rs.some(a => a.state === 'waitingDock')) out.push({ kind: 'beds', room: 'bunk' });
  const canteen = w.rooms.find(r => r.type === 'canteen' && r.built && r.queueUsers.length >= 3);
  if (canteen) out.push({ kind: 'queue', roomId: canteen.id, ...centreOf(canteen) });
  const janitors = w.agents.some(a => a.kind === 'staff' && a.role === 'janitor');
  const dirty = !janitors && w.rooms.find(r => r.type === 'wash' && r.built && r.clean < CLEAN.dirtyBelow);
  if (dirty) out.push({ kind: 'dirty', roomId: dirty.id, ...centreOf(dirty) });
  // janitor hint after a food fight (Brief §4.2 row ~10:00 "Hausmeister-Hinweis"): up to 2 min after it ended, while
  // no janitor works here – points at the canteen it happened in
  const fEnd = w.director.data.foodEndMs;
  const foodRoom = !janitors && w.director.active !== 'food' && fEnd && w.rtMs - fEnd < 120_000 ? w.rooms.find(r => r.id === w.director.data.foodRoom) : undefined;
  if (foodRoom) out.push({ kind: 'janitor', roomId: foodRoom.id, ...centreOf(foodRoom) });
  const crates = w.rooms.find(r => r.type === 'workshop' && r.built && r.stack >= 4);
  if (crates) out.push({ kind: 'crates', roomId: crates.id, ...centreOf(crates) });
  // saving up for the goal room (G2): a crate stack is the fastest money – say so before it is a pile
  const bg = buildGoal(w);
  const stack = bg && bg.unlocked && !bg.affordable ? w.rooms.find(r => r.type === 'workshop' && r.built && r.stack >= 2) : undefined;
  if (stack) out.push({ kind: 'earnFaster', roomId: stack.id, ...centreOf(stack) });
  const goal = OBJECTIVES[w.obj.current];
  const type = goal && !w.obj.done[goal.id] ? GOAL_ROOM[goal.id] : undefined;
  if (type && w.unlocked[type] && !w.rooms.some(r => r.type === type && !r.built) && w.coins >= minCost(type) + 40
    && (type === 'bunk' || !w.rooms.some(r => r.type === type))) out.push({ kind: 'coins', room: type });
  if (rs.length >= 3) {
    const avg = rs.reduce((s, a) => s + a.mood, 0) / rs.length;
    if (avg < 35) { const low = rs.reduce((m, a) => (a.mood < m.mood ? a : m), rs[0]); out.push({ kind: 'mood', agentId: low.id, x: low.x, y: low.y - 0.5 }); }
  }
  return out;
}

/**
 * Which just-in-time tip to show now (or null). Pure apart from the memo it updates: conditions must hold for their
 * sustain time, ≤ 1 tip per JIT_GAP_MS, the same tip at most JIT_KIND_MAX times with a cooldown (urgent taps repeat).
 * The caller marks a tip as shown with jitShown().
 */
export function jitPick(w: World, m: JitMemo, nowMs: number, opts: { buildTool: boolean; guide?: boolean }): JitPick | null {
  if (!w.tutorial.done) return null;
  // while the guide points at the Rooms button, "Enough coins! Build …" would say the same thing twice
  const conds = jitConditions(w, opts.buildTool).filter(c => !(opts.guide && c.kind === 'coins'));
  const live = new Set(conds.map(c => c.kind));
  for (const k of JIT_ORDER) {
    if (!live.has(k)) delete m.since[k];
    else if (m.since[k] === undefined) m.since[k] = nowMs;
  }
  if (nowMs - m.lastMs < JIT_GAP_MS) return null;
  for (const k of JIT_ORDER) {
    const c = conds.find(x => x.kind === k);
    if (!c) continue;
    if (nowMs - (m.since[k] ?? nowMs) < (SUSTAIN[k] ?? 0)) continue;
    const n = m.count[k] ?? 0;
    const rep = REPEATABLE[k];
    if (k === 'drag' ? n >= 1 : rep === undefined && n >= JIT_KIND_MAX) continue;
    if (nowMs - (m.kindMs[k] ?? -1e12) < (rep ?? JIT_KIND_COOLDOWN_MS)) continue;
    return c;
  }
  return null;
}
/**
 * Is a tip that is on screen still true? A shown tip is dropped as soon as its world condition ends (horn tapped,
 * escapee caught or gone, crates sold, queue cleared, room built …) instead of lingering for its full show time.
 * `pick` narrows it to the room / agent the tip points at; `drag` depends on the build tool (true when unknown).
 */
export function jitStillValid(w: World, kind: JitKind, pick?: Pick<JitPick, 'roomId' | 'agentId'>, opts?: { buildTool?: boolean }): boolean {
  if (kind === 'drag' && opts?.buildTool === undefined) return true;
  if (kind === 'escape' && pick?.agentId !== undefined) return w.agents.some(a => a.id === pick.agentId && a.state === 'escaping');
  if (kind === 'queue' && pick?.roomId !== undefined) return w.rooms.some(r => r.id === pick.roomId && r.built && r.queueUsers.length >= 3);
  if (kind === 'crates' && pick?.roomId !== undefined) return w.rooms.some(r => r.id === pick.roomId && r.built && r.stack >= 4);
  if (kind === 'earnFaster' && pick?.roomId !== undefined) { const bg = buildGoal(w); return !!bg && !bg.affordable && w.rooms.some(r => r.id === pick.roomId && r.built && r.stack >= 1); }
  return jitConditions(w, !!opts?.buildTool).some(c => c.kind === kind);
}
export function jitShown(m: JitMemo, kind: JitKind, nowMs: number) { m.lastMs = nowMs; m.kindMs[kind] = nowMs; m.count[kind] = (m.count[kind] ?? 0) + 1; }

// ------------------------------------------------------------------------------------------------ icons (inline, palette)
const C = { cream: '#f8f0de', cream5: '#efe3c8', cream7: '#e3d3b2', wood: '#7a4e33', ink: '#1f2b3e', ink7: '#36485f', teal: '#33908a', teal9: '#14424a', gold: '#e8b13a', gold7: '#b37f1d' };
/** pointing hand, fingertip at (22, 4) of a 56×56 box */
const HAND_SVG = `<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><g transform="translate(4 2) rotate(-22 18 2)">
<path d="M14 6Q14 2 18 2Q22 2 22 6L22 17Q24.5 15 27 17Q29.5 15.5 32 18Q35.5 17.5 36 21L36 33Q36 41 28 41L18 41Q11 41 9.5 35L5 28Q4 24.5 7.5 24Q9.5 24 11 26L14 29Z" fill="${C.cream}" stroke="${C.wood}" stroke-width="2" stroke-linejoin="round"/>
<path d="M33 22L34 33Q34 38 28 39L20 39" fill="none" stroke="${C.cream7}" stroke-width="3" stroke-linecap="round"/>
<path d="M16 5Q16 3.5 18 3.5" fill="none" stroke="#fffaf0" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
<path d="M22 17L22 24M27 17L27 23M32 18L32 23" stroke="${C.wood}" stroke-width="1.5" stroke-linecap="round"/>
<rect x="9" y="40" width="28" height="7" rx="2" fill="${C.teal}" stroke="${C.teal9}" stroke-width="2"/></g></svg>`;
/** mouse cursor with a small mouse (left button lit), arrow tip at (4, 3) of a 52×56 box */
const MOUSE_SVG = `<svg viewBox="0 0 52 56" width="52" height="56" aria-hidden="true">
<path d="M4 3L4 31L11.5 24.5L16.5 35L21.5 32.8L16.8 22.6L26.5 22.2Z" fill="${C.cream}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
<rect x="30" y="30" width="17" height="23" rx="8.5" fill="${C.cream}" stroke="${C.ink}" stroke-width="2"/>
<path d="M38.5 31L38.5 40L31 40L31 38.5Q31 31 38.5 31Z" fill="${C.gold}" stroke="${C.gold7}" stroke-width="1"/>
<path d="M38.5 30L38.5 40M30 40L47 40" stroke="${C.ink}" stroke-width="1.6"/></svg>`;
const ICONS = {
  click: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.6"/><path d="M12 3.6V10H6.6V9Q6.6 3.6 12 3.6Z" fill="${C.gold}"/><path d="M12 3V10M6 10H18" stroke="${C.ink}" stroke-width="1.4"/></svg>`,
  pan: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L15 5.5H13V10.5H18V8.5L21.5 12L18 15.5V13.5H13V18.5H15L12 22L9 18.5H11V13.5H6V15.5L2.5 12L6 8.5V10.5H11V5.5H9Z" fill="${C.teal}" stroke="${C.teal9}" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  wheel: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.6"/><rect x="10.6" y="6" width="2.8" height="5.5" rx="1.4" fill="${C.gold}" stroke="${C.gold7}" stroke-width=".8"/><path d="M12 13.5V19M9.8 17L12 19.2L14.2 17" fill="none" stroke="${C.ink7}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  tap: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="6" r="4.5" fill="none" stroke="${C.gold}" stroke-width="1.6"/><path d="M8.5 6Q8.5 4.5 10 4.5Q11.5 4.5 11.5 6V12L15 12.5Q18 13 18 16L17.5 21H8.5L5.5 15.5Q5 14 6.5 13.8L8.5 14.5Z" fill="${C.cream}" stroke="${C.wood}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  drag: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8H9M2 8L4.5 5.5M2 8L4.5 10.5" fill="none" stroke="${C.teal}" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 6Q10.5 4.5 12 4.5Q13.5 4.5 13.5 6V12L17 12.5Q20 13 20 16L19.5 21H10.5L7.5 15.5Q7 14 8.5 13.8L10.5 14.5Z" fill="${C.cream}" stroke="${C.wood}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  pinch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3L8 8M3 3H6.5M3 3V6.5M21 21L16 16M21 21H17.5M21 21V17.5" fill="none" stroke="${C.teal}" stroke-width="1.6" stroke-linecap="round"/><circle cx="9.5" cy="9.5" r="2.4" fill="${C.cream}" stroke="${C.wood}" stroke-width="1.4"/><circle cx="14.5" cy="14.5" r="2.4" fill="${C.cream}" stroke="${C.wood}" stroke-width="1.4"/></svg>`,
  help: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.6"/><path d="M9.4 9.4Q9.6 6.8 12.1 6.8Q14.7 6.8 14.7 9.2Q14.7 10.9 12.9 11.7Q12 12.1 12 13.6" fill="none" stroke="${C.ink}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.2" fill="${C.ink}"/></svg>`,
};

// ------------------------------------------------------------------------------------------------ component
interface Aim { key: string; x: number; y: number; r: number; tap: boolean }
interface Box { l: number; t: number; r: number; b: number }

export function mountTutorial(ctx: UICtx): Component {
  const w: World = ctx.w;
  const t = (k: Key, v?: Record<string, string | number>) => ctx.t(k, v);
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag); el.className = cls; parent.appendChild(el); return el;
  };
  // memoised writes: the DOM is only touched when a value changes
  const memo = new WeakMap<Element, Record<string, string>>();
  const put = (el: HTMLElement, k: string, v: string) => {
    let m = memo.get(el); if (!m) { m = {}; memo.set(el, m); }
    if (m[k] === v) return false;
    m[k] = v;
    if (k === 'text') el.textContent = v;
    else if (k === 'transform') el.style.transform = v;
    else if (k.startsWith('.')) el.classList.toggle(k.slice(1), v === '1');
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else if (k.startsWith('$')) (el.style as unknown as Record<string, string>)[k.slice(1)] = v;
    else el.setAttribute(k, v);
    return true;
  };
  const cls = (el: HTMLElement, c: string, on: boolean) => put(el, '.' + c, on ? '1' : '0');
  const tip = (el: HTMLElement, fn: () => { title: string; body?: string; hotkey?: string }) => { el.dataset.tip = '1'; ctx.tip(el, fn); };

  // ---------------------------------------------------------------- DOM
  // stage: full-screen, clips what leaves the viewport (veil, world-anchored ghost and hand), never takes pointer events
  const stage = h('div', 'tu', ctx.root);
  stage.dataset.overlay = '';
  if (ctx.touch) stage.classList.add('tu--touch');
  // the veil is far larger than the screen (its soft hole follows the target): it gets its own text-free clip box, so
  // the stage itself never overflows (a clipping box around text must not scroll – B1 layout audit)
  const veilBox = h('div', 'tu-veil-box', stage);
  const veil = h('div', 'tu-veil', veilBox);
  const ghost = h('button', 'tu-ghost', stage); ghost.type = 'button';
  const ghostIc = h('img', 'tu-ghost-ic', ghost); ghostIc.src = ctx.icon('shower'); ghostIc.alt = ''; ghostIc.draggable = false;
  const ghostLbl = h('span', 'tu-ghost-lbl', stage);
  const ghostLblIc = h('img', '', ghostLbl); ghostLblIc.src = ctx.icon('coin'); ghostLblIc.alt = ''; ghostLblIc.draggable = false;
  const ghostLblN = h('span', 'num', ghostLbl);
  const ring = h('div', 'tu-ring', stage);
  const hand = h('div', 'tu-hand', stage);
  const handIn = h('div', 'tu-hand-in', hand);
  handIn.innerHTML = ctx.touch ? HAND_SVG : MOUSE_SVG;
  const tipX = ctx.touch ? 22 : 4, tipY = ctx.touch ? 4 : 3;
  handIn.style.transformOrigin = `${tipX}px ${tipY}px`;

  // warden bubble
  const bub = h('div', 'tu-bub', stage);
  bub.setAttribute('role', 'region');
  const bubIn = h('div', 'tu-bub-in', bub);
  const warden = h('img', 'tu-warden', bubIn); warden.src = ctx.icon('warden'); warden.alt = ''; warden.draggable = false;
  const say = h('div', 'tu-say', bubIn);
  const sayTxt = h('p', 'tu-text', say);
  sayTxt.setAttribute('aria-live', 'polite');
  const saySub = h('p', 'tu-sub', say);
  const sayRow = h('div', 'tu-row', say);
  const prog = h('span', 'tu-prog', sayRow);
  prog.setAttribute('role', 'img');
  const dots = TUTORIAL_STEPS.map(() => h('i', 'tu-dot', prog));
  const progN = h('span', 'tu-prog-n num', prog);
  const skip = h('button', 'tu-skip', sayRow); skip.type = 'button';
  const skipTxt = h('span', '', skip);

  // controls overlay (first 20 s)
  const ctl = h('div', 'tu-ctl', stage);
  ctl.setAttribute('role', 'note');
  const ctlItems = (ctx.touch
    ? [['tap', 'tutorial.cap.tap', 'tutorial.ctl.select'], ['drag', 'tutorial.cap.drag', 'tutorial.ctl.pan'], ['pinch', 'tutorial.cap.pinch', 'tutorial.ctl.zoom'], ['help', 'tutorial.cap.helpTouch', 'tutorial.ctl.help']]
    : [['click', 'tutorial.cap.click', 'tutorial.ctl.select'], ['pan', 'tutorial.cap.pan', 'tutorial.ctl.pan'], ['wheel', 'tutorial.cap.wheel', 'tutorial.ctl.zoom'], ['help', 'tutorial.cap.help', 'tutorial.ctl.help']]
  ).map(([ic, cap, desc]) => {
    const it = h('div', 'tu-ctl-it', ctl);
    const icon = h('span', 'tu-ctl-ic', it); icon.innerHTML = ICONS[ic as keyof typeof ICONS];
    const tx = h('span', 'tu-ctl-tx', it);
    return { cap: h('b', 'tu-ctl-cap', tx), desc: h('span', 'tu-ctl-desc', tx), capK: cap as Key, descK: desc as Key };
  });

  // just-in-time tip chip
  const jit = h('button', 'tu-jit', stage); jit.type = 'button';
  const jitIc = h('img', 'tu-jit-ic', jit); jitIc.src = ctx.icon('warden'); jitIc.alt = ''; jitIc.draggable = false;
  const jitTxt = h('span', 'tu-jit-txt', jit);

  // step 3: Earl's "ready for release" plate over his head – shower first, then reformed ✓ (G2: the wait taught nothing)
  const earlPlate = h('div', 'tu-earl', stage);
  earlPlate.setAttribute('aria-hidden', 'true');
  const earlIc = h('img', 'tu-earl-ic', earlPlate); earlIc.src = ctx.icon('shower'); earlIc.alt = ''; earlIc.draggable = false;
  const earlBar = h('span', 'tu-earl-bar', earlPlate);
  const earlFill = h('i', '', earlBar);
  const earlOk = h('img', 'tu-earl-ok', earlPlate); earlOk.src = ctx.icon('check'); earlOk.alt = ''; earlOk.draggable = false;
  let earlShown = 0;                      // displayed fill (tweened: Earl's reform jumps when his shower ends)

  // guided first builds after the tutorial (src/ui/guide.ts): a ring + hand on the one next control, a dashed footprint
  // at a good spot while the build tool is on, and once a looping hand that drags it out (Brief §6.2 "Zieh-Geste … per
  // Animation"). Own classes (not .tu-ring / .tu-hand): the e2e drivers read those as the tutorial pointer.
  // they are world-/screen-anchored and may run past the screen edge (a hand on the build bar): like the veil they get
  // their own text-free clip box, so the stage (which holds text) never scrolls (B1 audit (b), M5 integration)
  const gBox = h('div', 'tu-gbox', stage);
  gBox.setAttribute('aria-hidden', 'true');
  const gRing = h('div', 'tu-gring', gBox);
  const gHand = h('div', 'tu-ghand', gBox);
  const gHandIn = h('div', 'tu-hand-in', gHand);
  gHandIn.innerHTML = ctx.touch ? HAND_SVG : MOUSE_SVG;
  gHandIn.style.transformOrigin = `${tipX}px ${tipY}px`;
  const gSpot = h('div', 'tu-gspot', gBox);
  const gDrag = h('div', 'tu-gdrag', gBox);
  for (const el of [gRing, gHand, gSpot, gDrag]) el.setAttribute('aria-hidden', 'true');
  // tutorial end: the flow bar is highlighted once (Brief §4.2 row 1:10–1:30) with a one-line explanation
  const flowChip = h('div', 'tu-flowchip', stage);
  flowChip.setAttribute('role', 'note');
  const flowChipIc = h('img', 'tu-jit-ic', flowChip); flowChipIc.src = ctx.icon('warden'); flowChipIc.alt = ''; flowChipIc.draggable = false;
  const flowChipTxt = h('span', 'tu-jit-txt', flowChip);

  // ---------------------------------------------------------------- state
  let clock = 0;                          // visible ms since mount (wall clock of update dt)
  let acc = TICK_MS, lastLang = '';
  const fresh = w.tutorial.active && !w.tutorial.done && w.rtMs < CONTROLS_MS;
  let ctlLeft = fresh ? CONTROLS_MS : 0;  // controls overlay time left
  let ghostFailed = false;
  let modal = false;
  let curAim: Aim | null = null;
  let elAim: { key: string; box: DOMRect } | null = null;  // element target, re-measured ≤ 10/s
  let cardShown = false;                  // the Wash Hut card was scrolled into view in this opening of the Rooms menu
  let handPos: { x: number; y: number } | null = null, glideFrom: { x: number; y: number } | null = null, glide = 1, lastKey = '';
  let bubPos: { x: number; y: number } | null = null, bubWant = { x: 16, y: 80 }, bubAway = false;
  /** full bubble · mini (dots + Skip beside the warden) · stack (dots over Skip, no warden) · skip (the Skip button
   *  alone, may also sit beside the build bar) – measured sizes */
  type BubMode = 'full' | 'mini' | 'stack' | 'skip';
  const BUB_MODES: BubMode[] = ['full', 'mini', 'stack', 'skip'];
  const bubSizes: Record<BubMode, { w: number; h: number } | null> = { full: null, mini: null, stack: null, skip: null };
  let bubMode: BubMode = 'full', bubSizesKey = '';
  let shownStep = -1;
  let ending = 0;                         // ms left of the fade-out after the tutorial ended
  const jm = newJitMemo();
  let jitCur: (JitPick & { until: number }) | null = null;
  let doneAt = w.tutorial.done ? -1e9 : Infinity;
  let buildToolSeen = false;
  let freeTop = 50, freeBottom = 600, clipBox: Box | null = null, ctlBox: Box | null = null, avoid: Box[] = [], botBoxes: Box[] = [];
  let skipped = false;
  let ctlBusy = false;
  let clipOpen = false;                   // compact: the clipboard card is expanded over the world (it has its own Skip)
  // guide (after the tutorial)
  let gStep: GuideStep | null = null;
  let gEl: { key: string; box: DOMRect } | null = null;
  let gSpotCache: { type: RoomType; ver: number; w: number; h: number; rect: { x: number; y: number; w: number; h: number } | null } | null = null;
  let demoDone = false;                   // the drag demo plays until the first guided room is placed
  let gScrolled = '';                     // the card the guide scrolled into view in this opening of a menu
  let ptrDown = false;
  let gDemoT = 0;
  let handoverAt = -1, flowIntroUntil = -1, flowEl: HTMLElement | null = null;

  const step = (): Step => TUTORIAL_STEPS[Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, w.tutorial.step))];
  const active = () => w.tutorial.active && !skipped;
  /** laid out and not visibility:hidden – a layer that is still fading in (opacity animation) already counts */
  const shown = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && (typeof (el as HTMLElement).checkVisibility !== 'function' || (el as HTMLElement).checkVisibility({ visibilityProperty: true }));
  const bestRoom = (type: RoomType) => w.rooms.filter(r => r.type === type).sort((a, b) => Number(b.built) - Number(a.built) || b.level - a.level || a.id - b.id)[0];
  const washCost = () => roomCost('wash', TUTORIAL_WASH.w, TUTORIAL_WASH.h);
  const ghostOk = () => !ghostFailed && step() === 'wash' && !w.rooms.some(r => r.type === 'wash') && !!w.unlocked.wash && w.coins >= washCost()
    && tileReason(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h) === 'ok';
  let ghostOn = false;                    // re-evaluated ≤ 10/s

  // ---------------------------------------------------------------- actions
  skip.addEventListener('click', e => {
    e.stopPropagation();
    if (!w.tutorial.active) return;
    const r = ctx.cmd.skipTutorial(w);
    if (!r.ok) { ctx.feedback(r); return; }
    ctx.sound('click');
    skipped = true; ending = 0;
    hideAll();
  });
  skip.addEventListener('pointerdown', e => e.stopPropagation());
  ghost.addEventListener('pointerdown', e => e.stopPropagation());
  ghost.addEventListener('click', e => {
    e.stopPropagation();
    // answer the tap at once (mixer.play ≤ 1 frame after the input, Brief §12.6): the spot and the price are checked
    // first (cheap), the build command with its path-field rebuild follows
    const sure = ghostOk();
    if (sure) ctx.sound('build');
    const r = ctx.cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h);
    if (r.ok) { if (!sure) ctx.sound('build'); }
    else { ghostFailed = true; ctx.feedback(r); }
    ghostOn = false; acc = TICK_MS;
  });
  jit.addEventListener('pointerdown', e => e.stopPropagation());
  jit.addEventListener('click', e => {
    e.stopPropagation();
    const c = jitCur; if (!c) return;
    ctx.sound('click');
    if (c.kind === 'beds' || c.kind === 'coins') ctx.menu.set('rooms');
    else if (c.kind === 'dirty' || c.kind === 'janitor') ctx.menu.set('staff');
    else if (c.roomId) { const r = w.rooms.find(x => x.id === c.roomId); if (r) { ctx.focusTile(r.x + r.w / 2, r.y + r.h / 2); ctx.selection.set({ kind: 'room', id: r.id }); } }
    else if (c.agentId && c.kind === 'mood') { const a = w.agents.find(x => x.id === c.agentId); if (a) { ctx.focusTile(a.x, a.y); ctx.selection.set({ kind: 'agent', id: a.id }); } }
    else if (c.x !== undefined && c.y !== undefined) ctx.focusTile(c.x, c.y);
    jitCur = null; cls(jit, 'on', false);
  });
  const offEvent = ctx.onEvent(e => {
    if (e.type === 'tutorialDone') { doneAt = clock; if (!e.skipped) { ending = 900; handoverAt = clock + 900; } acc = TICK_MS; }
    if (e.type === 'build' && w.tutorial.done && gStep?.kind === 'spot') demoDone = true;
    if (e.type === 'tutorialStep') acc = TICK_MS;
  });
  const offTool = ctx.tool.on(v => { if (v.kind === 'build' && w.tutorial.done) buildToolSeen = true; acc = TICK_MS; });
  const onPtrDown = () => { ptrDown = true; }, onPtrUp = () => { ptrDown = false; };
  ctx.canvas.addEventListener('pointerdown', onPtrDown, { passive: true });
  window.addEventListener('pointerup', onPtrUp, { passive: true });
  window.addEventListener('pointercancel', onPtrUp, { passive: true });

  tip(skip, () => ({ title: t('tut.skip'), body: t('tutorial.skipTip') }));
  tip(ghost, () => ({ title: t('tutorial.ghost'), body: t('tutorial.ghostTip', { cost: ctx.fmt(washCost()) }) }));
  tip(jit, () => ({ title: t('tutorial.jit.title'), body: t('tutorial.jit.body') }));

  function hideAll() {
    for (const el of [veil, ghost, ghostLbl, ring, hand, bub]) cls(el, 'on', false);
    curAim = null;
  }

  // ---------------------------------------------------------------- aim (target of the current step)
  const worldAim = (key: string, tx: number, ty: number, rTiles: number, tap: boolean): Aim => {
    const p = ctx.cam.worldToScreen(tx * TILE, ty * TILE);
    return { key, x: p.x, y: p.y, r: rTiles * TILE * ctx.cam.zoom, tap };
  };
  const boxAim = (key: string, b: DOMRect, tap: boolean): Aim => ({ key, x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.hypot(b.width, b.height) / 2, tap });
  /** element target of the current step (or null) – DOM reads, ≤ 10/s */
  function measureElAim() {
    elAim = null;
    if (!active()) return;
    const s = step(), tool = ctx.tool.get();
    let el: Element | null = null, key = '';
    if (ctx.menu.get() !== 'rooms') cardShown = false;
    if (s === 'wash' && !w.rooms.some(r => r.type === 'wash')) {
      if (tool.kind === 'build' && tool.type === 'wash') { if (ctx.touch) { el = document.querySelector('.tl-confirm:not([hidden]) .tl-yes'); key = 'yes'; } }
      else if (ctx.menu.get() === 'rooms') {
        el = document.querySelector('.bb-card[data-room="wash"]'); key = 'card';
        // a narrow sheet (phone, clipboard chip beside it) may hide the card in its scroll row: bring it in once per opening
        const row = el?.closest<HTMLElement>('.bb-scroll');
        if (el && row && !cardShown) {
          const b = el.getBoundingClientRect(), rb = row.getBoundingClientRect();
          if (b.left < rb.left - 0.5 || b.right > rb.right + 0.5) row.scrollLeft += b.right > rb.right ? b.right - rb.right + 8 : b.left - rb.left - 8;
          else cardShown = true;   // in view: from now on the player scrolls as they like
        }
      }
      else if (!ghostOn) { el = document.querySelector('.bb-rooms'); key = 'rooms'; }
    } else if (s === 'upgrade') {
      const c = bestRoom('canteen'), sel = ctx.selection.get();
      if (c && sel?.kind === 'room' && sel.id === c.id) { el = [...document.querySelectorAll('.pn:not([hidden]) .pn-upbtn')].find(shown) ?? null; key = 'up'; }
    }
    if (el && shown(el)) elAim = { key, box: el.getBoundingClientRect() };
  }
  /** the aim of this frame: world targets are projected every frame, element targets use the last measurement */
  function aimNow(): Aim | null {
    if (!active() || modal) return null;
    const s = step();
    if (elAim) return boxAim(elAim.key, elAim.box, true);
    switch (s) {
      case 'horn': return worldAim('ferry', FERRY_POS.x, FERRY_POS.y - 2.3, 2.6, w.ferry.state === 'arriving');
      case 'wash': {
        if (w.rooms.some(r => r.type === 'wash')) return null;                       // under construction: wait
        const tool = ctx.tool.get();
        const cx = TUTORIAL_WASH.x + TUTORIAL_WASH.w / 2, cy = TUTORIAL_WASH.y + TUTORIAL_WASH.h / 2;
        if (tool.kind === 'build' && tool.type === 'wash') {
          if (ctx.touch) return null;                                                 // ✓ not on screen yet
          return tileReason(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h) === 'ok' ? worldAim('spot', cx, cy, 2.1, true) : null;
        }
        if (ghostOn) return worldAim('ghost', cx, cy, 2.1, true);
        return null;
      }
      case 'stamp': {
        if (w.agents.some(a => a.state === 'atGate')) return worldAim('gate', GATE_X + 1, GATE_Y - 1.3, 1.9, true);
        const earl = w.agents.find(a => (a.flags & AF.earl) && isRascal(a) && a.state !== 'leaving');
        // reformed and on his way: the hand already waits at the gate (the player sees where the stamp will be)
        if (earl && earl.reform >= earl.sentence) return worldAim('gate', GATE_X + 1, GATE_Y - 1.3, 1.9, false);
        return earl ? worldAim('earl', earl.x, earl.y - 0.55, 1, false) : worldAim('gate', GATE_X + 1, GATE_Y - 1.3, 1.9, false);
      }
      case 'upgrade': {
        const c = bestRoom('canteen');
        if (!c) return null;
        return worldAim('canteen', c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) * 0.55, true);
      }
    }
    return null;
  }
  const waitLine = (): Key | null => {
    if (!active()) return null;
    const s = step();
    if (s === 'wash' && w.rooms.some(r => r.type === 'wash' && !r.built)) return 'tutorial.wait.build';
    if (s === 'stamp' && !w.agents.some(a => a.state === 'atGate')) {
      const earl = w.agents.find(a => (a.flags & AF.earl) && isRascal(a));
      return earl && earl.reform >= earl.sentence ? 'tutorial.wait.earlGate' : 'tutorial.wait.earl';
    }
    return null;
  };

  // ---------------------------------------------------------------- layout (≤ 10/s, plus once on every HUD change)
  const boxOf = (el: Element | null): Box | null => { if (!shown(el)) return null; const b = el.getBoundingClientRect(); return b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const pad = (b: Box, p: number): Box => ({ l: b.l - p, t: b.t - p, r: b.r + p, b: b.b + p });
  /** the target itself (what the bubble and the controls overlay must never cover) */
  const aimBox = (a: Aim): Box => ({ l: a.x - a.r - 4, t: a.y - a.r - 4, r: a.x + a.r + 4, b: a.y + a.r + 4 });
  /** the hand pointer, drawn from the target towards the lower right */
  const handBox = (a: Aim): Box => ({ l: a.x - 8, t: a.y - 8, r: a.x + 64, b: a.y + 70 });
  /** HUD layers the bubble keeps clear of (the open room panel, menus, tool chips/confirmations, toasts) */
  const AVOID_SEL = ['.bb-menu', '.pn', '.tl-chip', '.tl-confirm', '.tl-label', '.tl-bubble', '.ov-toasts'];
  function layout() {
    const vh = innerHeight;
    const tops = [...document.querySelectorAll('[data-hud="top"]')].map(boxOf).filter((b): b is Box => !!b);
    const bots = [...document.querySelectorAll('[data-hud="bottom"]')].map(boxOf).filter((b): b is Box => !!b);
    freeTop = (tops.length ? Math.max(...tops.map(b => b.b)) : 0) + 6;
    freeBottom = (bots.length ? Math.min(...bots.map(b => b.t)) : vh) - 6;
    botBoxes = bots.map(b => pad(b, 6));
    clipBox = boxOf(document.querySelector('.cb-card')) ?? boxOf(document.querySelector('.cb-chip'));
    // 6 px of slack: panels and toasts slide in by a few px, the box is measured mid-animation at worst
    avoid = [clipBox, ...AVOID_SEL.map(sel => boxOf(document.querySelector(`${sel}:not([hidden])`)))].filter((b): b is Box => !!b).map(b => pad(b, 6));
  }
  /** cheap per-frame fingerprint of the HUD layers in `avoid` – a change re-measures at once (not up to 100 ms later) */
  let hudSig = '';
  const hudSignature = () => {
    const toasts = document.querySelector('.ov-toasts');
    const sel = ctx.selection.get();
    return `${toasts ? toasts.childElementCount : 0}|${document.querySelector('.pn:not([hidden])') ? 1 : 0}|${ctx.menu.get()}|${ctx.tool.get().kind}|${sel ? sel.kind + sel.id : ''}|${document.querySelector('.cb--open') ? 1 : 0}`;
  };
  const applyBubMode = (m: BubMode) => { cls(bub, 'mini', m !== 'full'); cls(bub, 'stack', m === 'stack' || m === 'skip'); cls(bub, 'skiponly', m === 'skip'); };
  /** sizes of the three bubble forms (full every tick – its text changes; the text-free forms once per language / size) */
  function measureBubble() {
    const tmp = !bub.classList.contains('on') && !bub.classList.contains('bye');
    if (tmp) bub.classList.add('measure');            // laid out but invisible while it is away
    const read = () => { const r = bub.getBoundingClientRect(); return r.width > 0 ? { w: r.width, h: r.height } : null; };
    const key = `${ctx.lang()}|${innerWidth}x${innerHeight}`;
    applyBubMode('full'); bubSizes.full = read() ?? bubSizes.full;
    if (key !== bubSizesKey || !bubSizes.mini || !bubSizes.stack || !bubSizes.skip) {
      applyBubMode('mini'); bubSizes.mini = read();
      applyBubMode('stack'); bubSizes.stack = read();
      applyBubMode('skip'); bubSizes.skip = read();
      bubSizesKey = key;
    }
    applyBubMode(bubMode);
    if (tmp) bub.classList.remove('measure');
  }
  /** the room the current step is about stays visible too: the Wash Hut spot / the hut Earl showers in / the canteen */
  const roomBox = (x: number, y: number, rw: number, rh: number): Box => {
    const p = ctx.cam.worldToScreen(x * TILE, (y - 1.2) * TILE), q = ctx.cam.worldToScreen((x + rw) * TILE, (y + rh) * TILE); // incl. back wall / roof
    return { l: p.x, t: p.y, r: q.x, b: q.y };
  };
  function focusBoxes(): Box[] {
    if (!active()) return [];
    const s = step();
    if (s === 'wash') { const r = w.rooms.find(x => x.type === 'wash'); return [r ? roomBox(r.x, r.y, r.w, r.h) : roomBox(TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h + 0.9)]; }
    if (s === 'stamp') return w.rooms.filter(r => r.type === 'wash').slice(0, 2).map(r => roomBox(r.x, r.y, r.w, r.h));
    if (s === 'upgrade') { const c = bestRoom('canteen'); return c && ctx.selection.get() === null ? [roomBox(c.x, c.y, c.w, c.h)] : []; }
    return [];
  }
  /**
   * Where the bubble goes: near the target, inside the free play area, and NEVER over the target, the clipboard, the
   * controls overlay, an open panel / menu / tool layer or a toast (hard rule). A dense grid of spots is searched, so a
   * free spot is found whenever one exists. No free spot at full size → the bubble shrinks to progress dots + Skip
   * (beside the warden, then stacked without him), then to the Skip button alone, which may also use the strips beside
   * the build bar (a phone with a menu sheet open: Brief §6.2 "Skip tutorial ist dauerhaft sichtbar"); still none → it
   * steps aside until a spot is free again.
   */
  function placeBubble(a: Aim | null) {
    const vw = innerWidth;
    const hard = [...avoid, ...(ctlBox ? [pad(ctlBox, 4)] : []), ...(a ? [aimBox(a)] : []), ...focusBoxes()];
    const hand = a ? handBox(a) : null;
    const search = (bw: number, bh: number, strict: boolean, low = false) => {
      if (bw <= 0 || bh <= 0) return null;
      // low: down to the screen edge, the build bar itself is an obstacle then
      const x0 = 8, x1 = Math.max(x0, vw - 8 - bw), y0 = freeTop, y1 = Math.max(y0, (low ? innerHeight - 8 : freeBottom) - bh);
      const obst = low ? [...hard, ...botBoxes] : hard;
      const cands: { x: number; y: number }[] = [{ x: bubWant.x, y: bubWant.y }];
      if (a) {
        const g = a.r + 30;
        cands.push({ x: a.x + g, y: a.y - bh / 2 }, { x: a.x - g - bw, y: a.y - bh / 2 }, { x: a.x - bw / 2, y: a.y - g - bh }, { x: a.x - bw / 2, y: a.y + g + 40 });
      }
      for (let y = y0; y <= y1 + 15; y += 16) for (let x = x0; x <= x1 + 15; x += 16) cands.push({ x: Math.min(x, x1), y: Math.min(y, y1) });
      let best: { x: number; y: number } | null = null, bestS = Infinity;
      for (const c0 of cands) {
        const c = { x: Math.max(x0, Math.min(x1, c0.x)), y: Math.max(y0, Math.min(y1, c0.y)) };
        const box: Box = { l: c.x, t: c.y, r: c.x + bw, b: c.y + bh };
        let over = 0;
        for (const o of obst) over += inter(box, o);
        if (strict && over > 0) continue;
        let s = over * 50;
        if (hand) s += inter(box, hand) * 2;
        if (a) s += Math.hypot(c.x + bw / 2 - a.x, c.y + bh / 2 - a.y) * 4;
        s += Math.hypot(c.x - bubWant.x, c.y - bubWant.y) * 2;   // keep still: no jitter between equal spots
        if (s < bestS) { bestS = s; best = c; }
      }
      return best;
    };
    let mode: BubMode = bubMode, spot: { x: number; y: number } | null = null;
    for (const m of BUB_MODES) { const sz = bubSizes[m]; if (sz && (spot = search(sz.w, sz.h, true, m === 'skip'))) { mode = m; break; } }
    // not even the smallest form has a free spot (phone with a menu / sheet and a toast open): the bubble steps aside
    // until there is room again – then the clipboard card shows its own Skip (clipboard.css)
    bubAway = !spot;
    if (mode !== bubMode) { bubMode = mode; applyBubMode(mode); }
    if (spot) bubWant = spot;
  }
  /**
   * Controls overlay (Brief §6.2: bottom left, first 20 s). Tried in this order, one row, 2 × 2 or one column, the first spot that
   * covers neither the target (ferry + hand), the clipboard nor the build bar wins: bottom-left corner beside the build
   * bar, bottom left above it, left under the clipboard; only then the right side.
   */
  type CtlLayout = 'row' | 'grid' | 'col';
  const CTL_LAYOUTS: CtlLayout[] = ['row', 'grid', 'col'];
  const applyCtlLayout = (l: CtlLayout) => { cls(ctl, 'grid', l === 'grid'); cls(ctl, 'col', l === 'col'); };
  let ctlSizes: Record<CtlLayout, { w: number; h: number }> | null = null, ctlSizesKey = '', ctlSlot = '';
  function placeControls() {
    // a menu, a tool or a panel takes the screen: the controls overlay steps aside (its 20 s keep running)
    ctlBusy = ctx.menu.get() !== null || ctx.tool.get().kind !== 'none' || ctx.selection.get() !== null || modal;
    if (ctlLeft <= 0 || ctlBusy) { ctlBox = null; return; }
    const vw = innerWidth, vh = innerHeight;
    const key = `${ctx.lang()}|${vw}x${vh}`;
    if (!ctlSizes || ctlSizesKey !== key) {
      const size = (l: CtlLayout) => { applyCtlLayout(l); const r = ctl.getBoundingClientRect(); return { w: r.width, h: r.height }; };
      ctlSizes = { row: size('row'), grid: size('grid'), col: size('col') };
      ctlSizesKey = key; ctlSlot = '';
    }
    const bar = boxOf(document.querySelector('[data-hud="bottom"]'));
    const aim = aimNow();   // this tick's target (curAim is last frame's: stale right after a step change)
    const blocks = [clipBox, bar, ...(aim ? [aimBox(aim), handBox(aim)] : [])].filter((b): b is Box => !!b).map(b => pad(b, 4));
    const slots: [string, (s: { w: number; h: number }) => { x: number; y: number }][] = [
      ['bl', s => ({ x: 8, y: vh - 8 - s.h })],
      ['bla', s => ({ x: 8, y: freeBottom - s.h })],
      ['lc', () => ({ x: 8, y: (clipBox ? clipBox.b : freeTop) + 10 })],
      ['br', s => ({ x: vw - 8 - s.w, y: vh - 8 - s.h })],
      ['bra', s => ({ x: vw - 8 - s.w, y: freeBottom - s.h })],
    ];
    const opts: { id: string; l: CtlLayout; box: Box; over: number }[] = [];
    for (const [id, at] of slots) for (const l of CTL_LAYOUTS) {
      const s = ctlSizes[l], p = at(s);
      const box: Box = { l: p.x, t: p.y, r: p.x + s.w, b: p.y + s.h };
      const outside = box.l < 8 || box.r > vw - 8 || box.t < freeTop || box.b > vh - 8;
      opts.push({ id: `${id}:${l}`, l, box, over: outside ? Infinity : blocks.reduce((n, b) => n + inter(box, b), 0) });
    }
    // the most bottom-left free spot (the targets of the first 20 s – ferry dock, Wash Hut spot – do not move)
    const pick = opts.find(o => o.over === 0) ?? opts.reduce((m, o) => (o.over < m.over ? o : m), opts[0]);
    ctlSlot = pick.id;
    applyCtlLayout(pick.l);
    put(ctl, 'transform', `translate(${Math.round(pick.box.l)}px,${Math.round(pick.box.t)}px)`);
    ctlBox = pick.box;
  }
  function placeJit() {
    const below = clipBox ? clipBox.b + 8 : freeTop + 50;
    const x = clipBox ? clipBox.l : 8;
    put(jit, 'transform', `translate(${Math.round(x)}px,${Math.round(below)}px)`);
  }

  // ---------------------------------------------------------------- guide (after the tutorial, ≤ 10/s)
  /** the guide points through the first goals (up to Canteen level 5); the spot ghost helps with every build goal */
  const guideEra = () => w.tutorial.done && !w.obj.done.canteen5;
  let gSpotNow: { type: RoomType; x: number; y: number; w: number; h: number } | null = null;
  function measureGuide() {
    gEl = null;
    gSpotNow = null;
    const tool = ctx.tool.get();
    const toolType = tool.kind === 'build' ? tool.type : undefined;
    // suggested spot for the goal room while its build tool is on (re-searched when the layout changes)
    let spot: { x: number; y: number; w: number; h: number } | null = null;
    const bg = toolType ? buildGoal(w) : null;
    // the player opened this build tool: the spot helps as soon as the room itself is affordable (the payday reserve
    // only holds back the guide's own pointing, not a player who builds on purpose)
    if (bg && toolType === bg.type && w.coins >= bg.cost && !bg.building) {
      const c = gSpotCache;
      if (!c || c.type !== bg.type || c.ver !== w.cache.version || c.w !== bg.size.w || c.h !== bg.size.h) gSpotCache = { type: bg.type, ver: w.cache.version, w: bg.size.w, h: bg.size.h, rect: suggestSpot(w, bg.type, bg.size.w, bg.size.h) };
      spot = gSpotCache!.rect && tileReason(w, bg.type, gSpotCache!.rect.x, gSpotCache!.rect.y, gSpotCache!.rect.w, gSpotCache!.rect.h) === 'ok' ? gSpotCache!.rect : null;
    }
    gSpotNow = spot && toolType ? { type: toolType, ...spot } : null;
    const pending = !!document.querySelector('.tl-confirm:not([hidden]) .tl-yes');
    // the tutorial end gets its moment first (unlock toast, new goal, flow-bar intro), then the guide points
    const settled = handoverAt < 0 && flowIntroUntil < 0;
    const sel = ctx.selection.get();
    let st = w.tutorial.done ? guideStep(w, { menu: ctx.menu.get(), tool: { kind: tool.kind, type: toolType }, pending, spot, selRoom: sel?.kind === 'room' ? sel.id : undefined }) : null;
    if (st && !settled && st.kind !== 'spot' && st.kind !== 'confirm') st = null;
    if (st && !guideEra() && st.kind !== 'spot' && st.kind !== 'confirm') st = null;
    if (st && (st.kind === 'staff' || st.kind === 'hire' || st.kind === 'room' || st.kind === 'upgrade') && !guideEra()) st = null;
    // pointing at a room: only while no other panel is open (a rascal's card would hide it)
    if (st && st.kind === 'room' && sel && !(sel.kind === 'room' && sel.id === st.roomId)) st = null;
    // never on top of a modal, an open M5 panel, the clipboard overlays or a just-in-time tip
    if (modal || ctx.panel.get() !== null || !!document.querySelector('.cb--open, .cb--list') || !!jitCur) st = st && st.kind === 'spot' ? st : null;
    gStep = st;
    if (!st) return;
    let el: Element | null = null;
    if (st.kind === 'rooms') el = document.querySelector('.bb-rooms');
    else if (st.kind === 'card') el = document.querySelector(`.bb-card[data-room="${st.type}"]`);
    else if (st.kind === 'staff') el = document.querySelector('.bb-staff');
    else if (st.kind === 'hire') el = document.querySelector(`.bb-role[data-role="${st.role}"] .bb-hire`);
    else if (st.kind === 'confirm') el = document.querySelector('.tl-confirm:not([hidden]) .tl-yes');
    else if (st.kind === 'upgrade') el = [...document.querySelectorAll('.pn:not([hidden]) .pn-upbtn')].find(shown) ?? null;
    if (el && shown(el)) {
      // a card in a narrow, sideways-scrolling sheet (phones, 907 px with the clipboard beside it): bring it into view once
      // per opening, then only point at it while it is in view (the player may scroll on)
      const sc = el.closest<HTMLElement>('.bb-scroll');
      let b = el.getBoundingClientRect();
      const rb = sc?.getBoundingClientRect();
      const out = !!rb && (b.left < rb.left - 1 || b.right > rb.right + 1);
      const scrollKey = `${ctx.menu.get()}:${st.kind}:${'type' in st ? st.type : st.role}`;
      if (sc && rb && out && gScrolled !== scrollKey) {
        sc.scrollLeft += b.right > rb.right ? b.right - rb.right + 8 : b.left - rb.left - 8;
        gScrolled = scrollKey;
        b = el.getBoundingClientRect();
      }
      if (!rb || (b.left >= rb.left - 1 && b.right <= rb.right + 1)) gEl = { key: st.kind, box: b };
    }
    if (ctx.menu.get() === null) gScrolled = '';
  }
  function frameGuide(dt: number) {
    const st = gStep;
    let aim: Aim | null = gEl ? boxAim(gEl.key, gEl.box, true) : null;
    if (st && st.kind === 'room') { const r = w.rooms.find(x => x.id === st.roomId); if (r) aim = worldAim('groom', r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.45, true); }
    // spot: dashed footprint (projected every frame) + the drag demo until the first guided build
    let spotOn = false, dragOn = false;
    if (st && st.kind === 'spot') {
      const z = ctx.cam.zoom, p = ctx.cam.worldToScreen(st.x * TILE, st.y * TILE);
      const sw = st.w * TILE * z, sh = st.h * TILE * z;
      put(gSpot, 'transform', `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`);
      put(gSpot, '$width', `${Math.round(sw)}px`); put(gSpot, '$height', `${Math.round(sh)}px`);
      spotOn = true;
      if (!demoDone && !ptrDown) {
        gDemoT = (gDemoT + dt) % 2.4;
        const k = Math.min(1, Math.max(0, (gDemoT - 0.35) / 1.3)), e = k * k * (3 - 2 * k);
        // the build tool centres a minimum-size room on the pressed tile and grows it towards the drag (tools.ts
        // dragRect): press where that minimum room is the spot's top-left part, drag to the spot's far corner
        const mw = ROOMS[st.type].minW, mh = ROOMS[st.type].minH, T = TILE * z;
        const x0 = p.x + (((mw - 1) >> 1) + 0.5) * T, y0 = p.y + (((mh - 1) >> 1) + 0.5) * T, x1 = p.x + sw - 0.5 * T, y1 = p.y + sh - 0.5 * T;
        aim = { key: 'drag', x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e, r: 0, tap: false };
        put(gDrag, 'transform', `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`);
        put(gDrag, '$width', `${Math.round((mw + (st.w - mw) * e) * T)}px`); put(gDrag, '$height', `${Math.round((mh + (st.h - mh) * e) * T)}px`);
        dragOn = gDemoT > 0.3 && gDemoT < 2.0;
      }
    }
    if (aim) {
      const flipY = aim.y > innerHeight - 80 ? -1 : 1, flipX = aim.x > innerWidth - 70 ? -1 : 1;
      put(gHand, 'transform', `translate(${Math.round(aim.x)}px,${Math.round(aim.y)}px) scale(${flipX},${flipY}) translate(${-tipX}px,${-tipY}px)`);
      cls(gHand, 'tap', aim.tap);
      const demo = aim.r === 0 && !aim.tap;
      cls(gHand, 'drag', demo);
      if (aim.tap) put(gRing, 'transform', `translate(${Math.round(aim.x)}px,${Math.round(aim.y)}px)`);
    }
    cls(gHand, 'on', !!aim);
    cls(gRing, 'on', !!aim && aim.tap);
    cls(gSpot, 'on', spotOn);
    cls(gDrag, 'on', dragOn);
    // tools.ts builds exactly this footprint on a tap inside it (closer M5: a tap centred the minimum room on the tapped
    // tile, so a tap off the centre tile built elsewhere or failed with "Outside your land")
    // published whenever the goal room's tool is on and a good spot exists – also while a touch rectangle waits for ✓
    // (tools.ts moves its first touch rectangle there)
    const gs = ctx.guideSpot, cur = gs?.get() ?? null;
    const want = gSpotNow;
    if (gs && (want ? !cur || cur.type !== want.type || cur.x !== want.x || cur.y !== want.y || cur.w !== want.w || cur.h !== want.h : cur)) {
      gs.set(want ? { type: want.type, x: want.x, y: want.y, w: want.w, h: want.h } : null);
    }
  }
  /** tutorial end: close the panel the tutorial opened, highlight the flow bar once with its one-line explanation */
  function handover() {
    if (handoverAt >= 0 && clock >= handoverAt) {
      handoverAt = -1;
      const c = bestRoom('canteen'), sel = ctx.selection.get();
      if (c && sel?.kind === 'room' && sel.id === c.id) ctx.selection.set(null);
      flowEl = document.querySelector<HTMLElement>('.tb .pill.flow');
      if (flowEl) { flowEl.classList.add('tu-flow-intro'); flowIntroUntil = clock + 6000; }
    }
    if (flowIntroUntil >= 0 && clock >= flowIntroUntil) { flowIntroUntil = -1; flowEl?.classList.remove('tu-flow-intro'); }
    // the player already acts (a menu or a build tool is open): the chip makes room – it would sit on the build spot
    const on = flowIntroUntil >= 0 && !modal && ctx.menu.get() === null && ctx.tool.get().kind === 'none';
    if (on && flowEl) {
      const b = flowEl.getBoundingClientRect();
      const x = Math.max(8, Math.min(innerWidth - 8 - flowChip.offsetWidth, b.left + b.width / 2 - flowChip.offsetWidth / 2));
      // below the toast stack (the unlock / new-goal toasts of the tutorial end sit right under the top bar)
      const ts = document.querySelector('.ov-toasts'), tb = ts && ts.childElementCount ? ts.getBoundingClientRect() : null;
      const y = Math.max(b.bottom + 8, tb && tb.height > 0 && tb.right > x && tb.left < x + flowChip.offsetWidth ? tb.bottom + 8 : 0);
      put(flowChip, 'transform', `translate(${Math.round(x)}px,${Math.round(y)}px)`);
    }
    cls(flowChip, 'on', on);
  }
  /** step 3: the plate over Earl (shower icon, fill, ✓) – tweened so his reform jump reads as a bar filling up */
  function frameEarl(dt: number) {
    const earl = active() && step() === 'stamp' ? w.agents.find(a => (a.flags & AF.earl) && isRascal(a) && a.state !== 'leaving' && a.state !== 'atGate') : undefined;
    if (!earl || modal) { cls(earlPlate, 'on', false); return; }
    const want = Math.max(0, Math.min(1, earl.reform / Math.max(1, earl.sentence)));
    earlShown += (want - earlShown) * Math.min(1, dt * 4);
    if (Math.abs(want - earlShown) < 0.01) earlShown = want;
    const p = ctx.cam.worldToScreen(earl.x * TILE, (earl.y - 1.55) * TILE);
    put(earlPlate, 'transform', `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`);
    put(earlFill, 'transform', `scaleX(${Math.round(earlShown * 100) / 100})`);
    cls(earlPlate, 'done', earlShown >= 0.99);
    cls(earlPlate, 'on', true);
  }

  // ---------------------------------------------------------------- text (on change / language switch)
  function renderText() {
    const lang = ctx.lang();
    const langChanged = lang !== lastLang;
    lastLang = lang;
    if (active()) {
      const k = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, w.tutorial.step)), s = step();
      put(sayTxt, 'text', t(`tut.${s}`));
      const wl = waitLine();
      put(saySub, 'text', wl ? t(wl) : '');
      cls(saySub, 'hide', !wl);
      put(progN, 'text', `${k + 1}/${TUTORIAL_STEPS.length}`);
      put(prog, 'aria-label', t('tutorial.progress', { n: k + 1, total: TUTORIAL_STEPS.length }));
      dots.forEach((d, i) => { cls(d, 'done', i < k); cls(d, 'cur', i === k); });
      put(bub, 'aria-label', t('tutorial.warden'));
      put(skipTxt, 'text', t('tut.skip'));
      put(skip, 'aria-label', t('tut.skip'));
      put(ghost, 'aria-label', `${t('tutorial.ghost')} (${ctx.fmt(washCost())})`);
      put(ghostLblN, 'text', ctx.fmt(washCost()));
      if (k !== shownStep) {
        const first = shownStep < 0;
        shownStep = k;
        if (!first && !reduceMotion && typeof bubIn.animate === 'function') bubIn.animate([{ transform: 'scale(.9)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
      }
    }
    if (langChanged || ctlLeft > 0) for (const it of ctlItems) { put(it.cap, 'text', t(it.capK)); put(it.desc, 'text', t(it.descK)); }
    put(ctl, 'aria-label', t('tutorial.ctl.title'));
    put(flowChipTxt, 'text', t('tutorial.flowIntro'));
    if (jitCur) {
      const txt = jitText(jitCur);
      put(jitTxt, 'text', txt);
      put(jit, 'aria-label', `${t('tutorial.jit.title')}: ${txt}`);
    }
  }
  const jitText = (c: JitPick) => {
    if (c.kind === 'drag') return ctx.touch ? t('tutorial.jit.dragTouch') : t('tut.drag');
    if (c.kind === 'coins') return t('tutorial.jit.coins', { room: t(`room.${c.room ?? 'bunk'}`) });
    return t(`tutorial.jit.${c.kind}`);
  };

  // ---------------------------------------------------------------- throttled tick (≤ 10/s)
  function tick() {
    modal = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
    ghostOn = active() && ghostOk() && ctx.tool.get().kind === 'none' && ctx.menu.get() === null;
    clipOpen = !!document.querySelector('.cb--open');
    measureElAim();
    layout();
    renderText();      // before measuring: the controls overlay and the bubble are sized by their texts
    placeControls();
    measureBubble();
    // just-in-time tips
    if (w.tutorial.done && clock - doneAt >= JIT_AFTER_TUTORIAL_MS) {
      const buildTool = buildToolSeen && ctx.tool.get().kind === 'build';
      if (jitCur && (clock >= jitCur.until || !jitStillValid(w, jitCur.kind, jitCur, { buildTool }))) jitCur = null;
      const busy = modal || ctx.paused() || w.speed === 0 || !!document.querySelector('.cb--open, .cb--list') || jitCovered();
      if (!jitCur && !busy) {
        const pick = jitPick(w, jm, clock, { buildTool, guide: guideEra() });
        if (pick) { jitShown(jm, pick.kind, clock); jitCur = { ...pick, until: clock + JIT_SHOW_MS }; renderText(); }
      }
      if (jitCur && busy) jitCur.until = Math.min(jitCur.until, clock); // a modal / open clipboard list hides it
      cls(jit, 'on', !!jitCur);
      if (jitCur) placeJit();
    } else cls(jit, 'on', false);
    measureGuide();
  }

  /** an open menu sheet / M5 side panel lies on the tip's spot (compact layouts): the tip steps aside (M5 flow audit) */
  function jitCovered() {
    if (ctx.menu.get() === null && ctx.panel.get() === null) return false;
    const r = jit.getBoundingClientRect();
    if (!(r.width > 0)) return ctx.compact.get(); // not shown yet: on compact layouts a sheet / panel covers its corner
    for (const el of ctx.root.querySelectorAll<HTMLElement>('.bb-menu:not([hidden]), .m5p:not([hidden])')) {
      const o = el.getBoundingClientRect();
      if (o.width > 0 && r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- per frame: follow the camera (transform only)
  function frame(dt: number) {
    const on = active();
    const a = on ? aimNow() : null;
    curAim = a;
    // hand (glides to a new target, then sticks to it while the camera moves)
    if (a) {
      if (a.key !== lastKey) { glideFrom = handPos ? { ...handPos } : null; glide = glideFrom ? 0 : 1; lastKey = a.key; }
      glide = Math.min(1, glide + dt / 0.35);
      const e = 1 - Math.pow(1 - glide, 3);
      handPos = glideFrom ? { x: glideFrom.x + (a.x - glideFrom.x) * e, y: glideFrom.y + (a.y - glideFrom.y) * e } : { x: a.x, y: a.y };
      const flipY = handPos.y > innerHeight - 80 ? -1 : 1, flipX = handPos.x > innerWidth - 70 ? -1 : 1;
      put(hand, 'transform', `translate(${Math.round(handPos.x)}px,${Math.round(handPos.y)}px) scale(${flipX},${flipY}) translate(${-tipX}px,${-tipY}px)`);
      cls(hand, 'tap', a.tap);
      put(ring, 'transform', `translate(${Math.round(a.x)}px,${Math.round(a.y)}px)`);
      // veil hole around the target (veil is 2D × 2D with the hole in its centre)
      const D = Math.ceil(Math.hypot(innerWidth, innerHeight)) + 60;
      put(veil, '$width', `${2 * D}px`); put(veil, '$height', `${2 * D}px`);
      put(veil, '--r', `${Math.round(Math.max(30, a.r + 12) / 4) * 4}px`);
      put(veil, 'transform', `translate(${Math.round(a.x - D)}px,${Math.round(a.y - D)}px)`);
    }
    cls(hand, 'on', !!a);
    cls(ring, 'on', !!a && a.tap);
    cls(veil, 'on', !!a);
    // one-tap ghost
    const g = on && ghostOn && !modal;
    if (g) {
      const p = ctx.cam.worldToScreen(TUTORIAL_WASH.x * TILE, TUTORIAL_WASH.y * TILE), z = ctx.cam.zoom;
      put(ghost, 'transform', `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) scale(${Math.round(z * 1000) / 1000})`);
      const lx = p.x + TUTORIAL_WASH.w * TILE * z / 2, ly = p.y + TUTORIAL_WASH.h * TILE * z + 4;
      put(ghostLbl, 'transform', `translate(${Math.round(lx)}px,${Math.round(ly)}px) translateX(-50%)`);
    }
    cls(ghost, 'on', g);
    cls(ghostLbl, 'on', g);
    // bubble: re-placed every frame (the target, the camera and the HUD move); it jumps instead of gliding, a glide
    // would sweep over the target or a panel on its way. A long jump pops in with a short fade.
    const wantBub = on && !clipOpen;
    if (wantBub) placeBubble(a);   // no target (waiting): the bubble stays where it is while that spot stays free
    const bubOn = wantBub && !bubAway;
    const showBub = bubOn || ending > 0;
    if (ending > 0) ending -= dt * 1000;
    if (showBub) {
      const jump = bubPos ? Math.hypot(bubWant.x - bubPos.x, bubWant.y - bubPos.y) : 0;
      if (jump > 48 && !reduceMotion && typeof bubIn.animate === 'function') bubIn.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      bubPos = { ...bubWant };
      put(bub, 'transform', `translate(${Math.round(bubPos.x)}px,${Math.round(bubPos.y)}px)`);
    }
    cls(bub, 'on', bubOn);
    cls(bub, 'bye', !on && ending > 0);
    // one Skip on screen: while the bubble shows its Skip, the clipboard card hides its own (clipboard.css)
    cls(ctx.root, 'tu-bub-on', bubOn);
    // controls overlay
    if (ctlLeft > 0) ctlLeft -= dt * 1000;
    cls(ctl, 'on', ctlLeft > 0 && !ctlBusy);
    frameEarl(dt);
    if (!on) { handover(); frameGuide(dt); }
    else { for (const el of [gRing, gHand, gSpot, gDrag, flowChip]) cls(el, 'on', false); }
  }

  // test hook (tests/e2e/m4-fixes-ui.spec.ts): the current target in screen px and where the layers went
  (window as unknown as Record<string, unknown>).__tutorial = { aim: () => (curAim ? { ...curAim } : null), mini: () => bubMode !== 'full', mode: () => bubMode, away: () => bubAway, ctlSlot: () => ctlSlot,
    guide: () => {
      if (!gStep) return null;
      const st = gStep;
      const r = st.kind === 'room' ? w.rooms.find(x => x.id === st.roomId) : undefined;
      const el = gEl ? { x: gEl.box.left + gEl.box.width / 2, y: gEl.box.top + gEl.box.height / 2 } : r ? ctx.cam.worldToScreen((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE) : null;
      return { ...st, el };
    } };

  return {
    update(dt: number) {
      clock += dt * 1000;
      acc += dt * 1000;
      const sig = hudSignature();
      if (sig !== hudSig) { hudSig = sig; acc = TICK_MS; }
      if (acc >= TICK_MS || ctx.lang() !== lastLang) { acc = 0; tick(); }
      frame(dt);
    },
    destroy() {
      offEvent(); offTool(); stage.remove(); ctx.root.classList.remove('tu-bub-on'); flowEl?.classList.remove('tu-flow-intro');
      ctx.canvas.removeEventListener('pointerdown', onPtrDown); window.removeEventListener('pointerup', onPtrUp); window.removeEventListener('pointercancel', onPtrUp);
    },
  };
}
