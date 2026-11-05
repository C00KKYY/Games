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
 *    line, D1), progress "1/4" and a permanent "Skip tutorial" button styled like the clipboard buttons.
 *  - Dimming: a veil with a soft cut-out around the target dims the rest of the UI and the world. It never takes
 *    pointer events, the sim keeps running.
 *  - Controls overlay: the first 20 s of a fresh game, bottom left, mouse or touch variant. Fades out; the help modal
 *    (H key / "?" button in the top bar, both already exist) brings the full list back.
 *  - Just-in-time tips after the tutorial: ≤ 1 per 30 s, a small non-blocking chip under the clipboard that hides
 *    itself after a few seconds; tapping it shows the spot. Driven by world state (jitPick, pure and unit tested).
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
/** the optional wait line shown under the step text (counted for D1 together with the step text) */
export const STEP_WAIT: Partial<Record<Step, Key>> = { wash: 'tutorial.wait.build', stamp: 'tutorial.wait.earl' };
export const stepKeys = (s: Step): Key[] => [`tut.${s}`, ...(STEP_WAIT[s] ? [STEP_WAIT[s]!] : [])];
/** words a player reads in one tutorial step (step text + wait line), D1 */
export const stepWords = (s: Step, t: (k: Key) => string) => stepKeys(s).reduce((n, k) => n + t(k).split(/\s+/).filter(Boolean).length, 0);

export type JitKind = 'escape' | 'horn' | 'drag' | 'beds' | 'queue' | 'dirty' | 'crates' | 'coins' | 'mood';
/** priority order: urgent world taps first, then build advice */
export const JIT_ORDER: JitKind[] = ['escape', 'horn', 'drag', 'beds', 'queue', 'dirty', 'crates', 'coins', 'mood'];
/** how long a condition must hold before it counts (ms) */
const SUSTAIN: Partial<Record<JitKind, number>> = { queue: 5000, dirty: 3000, crates: 5000, coins: 15000, mood: 10000, beds: 3000 };
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
  const crates = w.rooms.find(r => r.type === 'workshop' && r.built && r.stack >= 4);
  if (crates) out.push({ kind: 'crates', roomId: crates.id, ...centreOf(crates) });
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
export function jitPick(w: World, m: JitMemo, nowMs: number, opts: { buildTool: boolean }): JitPick | null {
  if (!w.tutorial.done) return null;
  const conds = jitConditions(w, opts.buildTool);
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
  const veil = h('div', 'tu-veil', stage);
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

  // ---------------------------------------------------------------- state
  let clock = 0;                          // visible ms since mount (wall clock of update dt)
  let acc = TICK_MS, lastLang = '';
  const fresh = w.tutorial.active && !w.tutorial.done && w.rtMs < CONTROLS_MS;
  let ctlLeft = fresh ? CONTROLS_MS : 0;  // controls overlay time left
  let ghostFailed = false;
  let modal = false;
  let curAim: Aim | null = null;
  let elAim: { key: string; box: DOMRect } | null = null;  // element target, re-measured ≤ 10/s
  let handPos: { x: number; y: number } | null = null, glideFrom: { x: number; y: number } | null = null, glide = 1, lastKey = '';
  let bubPos: { x: number; y: number } | null = null, bubWant = { x: 16, y: 80 }, bubSize = { w: 300, h: 100 };
  let shownStep = -1;
  let ending = 0;                         // ms left of the fade-out after the tutorial ended
  const jm = newJitMemo();
  let jitCur: (JitPick & { until: number }) | null = null;
  let doneAt = w.tutorial.done ? -1e9 : Infinity;
  let buildToolSeen = false;
  let freeTop = 50, freeBottom = 600, clipBox: Box | null = null, ctlBox: Box | null = null, avoid: Box[] = [];
  let skipped = false;
  let ctlSide: 'l' | 'r' = 'l', ctlBusy = false;

  const step = (): Step => TUTORIAL_STEPS[Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, w.tutorial.step))];
  const active = () => w.tutorial.active && !skipped;
  const vis = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && (typeof (el as HTMLElement).checkVisibility !== 'function' || (el as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }));
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
    const r = ctx.cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h);
    if (r.ok) ctx.sound('build');
    else { ghostFailed = true; ctx.feedback(r); }
    ghostOn = false; acc = TICK_MS;
  });
  jit.addEventListener('pointerdown', e => e.stopPropagation());
  jit.addEventListener('click', e => {
    e.stopPropagation();
    const c = jitCur; if (!c) return;
    ctx.sound('click');
    if (c.kind === 'beds' || c.kind === 'coins') ctx.menu.set('rooms');
    else if (c.kind === 'dirty') ctx.menu.set('staff');
    else if (c.roomId) { const r = w.rooms.find(x => x.id === c.roomId); if (r) { ctx.focusTile(r.x + r.w / 2, r.y + r.h / 2); ctx.selection.set({ kind: 'room', id: r.id }); } }
    else if (c.agentId && c.kind === 'mood') { const a = w.agents.find(x => x.id === c.agentId); if (a) { ctx.focusTile(a.x, a.y); ctx.selection.set({ kind: 'agent', id: a.id }); } }
    else if (c.x !== undefined && c.y !== undefined) ctx.focusTile(c.x, c.y);
    jitCur = null; cls(jit, 'on', false);
  });
  const offEvent = ctx.onEvent(e => {
    if (e.type === 'tutorialDone') { doneAt = clock; if (!e.skipped) ending = 900; acc = TICK_MS; }
    if (e.type === 'tutorialStep') acc = TICK_MS;
  });
  const offTool = ctx.tool.on(v => { if (v.kind === 'build' && w.tutorial.done) buildToolSeen = true; });

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
    if (s === 'wash' && !w.rooms.some(r => r.type === 'wash')) {
      if (tool.kind === 'build' && tool.type === 'wash') { if (ctx.touch) { el = document.querySelector('.tl-confirm:not([hidden]) .tl-yes'); key = 'yes'; } }
      else if (ctx.menu.get() === 'rooms') { el = document.querySelector('.bb-card[data-room="wash"]'); key = 'card'; }
      else if (!ghostOn) { el = document.querySelector('.bb-rooms'); key = 'rooms'; }
    } else if (s === 'upgrade') {
      const c = bestRoom('canteen'), sel = ctx.selection.get();
      if (c && sel?.kind === 'room' && sel.id === c.id) { el = [...document.querySelectorAll('.pn:not([hidden]) .pn-upbtn')].find(vis) ?? null; key = 'up'; }
    }
    if (el && vis(el)) elAim = { key, box: el.getBoundingClientRect() };
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
    if (s === 'stamp' && !w.agents.some(a => a.state === 'atGate')) return 'tutorial.wait.earl';
    return null;
  };

  // ---------------------------------------------------------------- layout (≤ 10/s)
  const boxOf = (el: Element | null): Box | null => { if (!vis(el)) return null; const b = el.getBoundingClientRect(); return b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  function layout() {
    const vh = innerHeight;
    const tops = [...document.querySelectorAll('[data-hud="top"]')].map(boxOf).filter((b): b is Box => !!b);
    const bots = [...document.querySelectorAll('[data-hud="bottom"]')].map(boxOf).filter((b): b is Box => !!b);
    freeTop = (tops.length ? Math.max(...tops.map(b => b.b)) : 0) + 6;
    freeBottom = (bots.length ? Math.min(...bots.map(b => b.t)) : vh) - 6;
    clipBox = boxOf(document.querySelector('.cb-card')) ?? boxOf(document.querySelector('.cb-chip'));
    avoid = [clipBox, ctlBox, ...['.bb-menu', '.pn', '.tl-chip', '.tl-confirm', '.tl-label', '.tl-bubble'].map(sel => boxOf(document.querySelector(`${sel}:not([hidden])`)))].filter((b): b is Box => !!b);
    const bb = bub.getBoundingClientRect();
    if (bb.width > 0) bubSize = { w: bb.width, h: bb.height };
  }
  /** where the bubble wants to be: next to the target, inside the free play area, away from other HUD */
  function placeBubble(a: Aim | null) {
    const vw = innerWidth, { w: bw, h: bh } = bubSize;
    const clampX = (x: number) => Math.max(8, Math.min(vw - 8 - bw, x));
    const clampY = (y: number) => Math.max(freeTop, Math.min(freeBottom - bh, y));
    const cands: { x: number; y: number }[] = [];
    if (a) {
      const g = a.r + 30;
      cands.push({ x: a.x + g, y: a.y - bh / 2 }, { x: a.x - g - bw, y: a.y - bh / 2 }, { x: a.x - bw / 2, y: a.y - g - bh }, { x: a.x - bw / 2, y: a.y + g + 40 },
        { x: a.x + g, y: a.y - g - bh }, { x: a.x - g - bw, y: a.y - g - bh });
    }
    cands.push({ x: vw / 2 - bw / 2, y: freeTop + 8 }, { x: vw - bw - 16, y: freeTop + 8 }, { x: vw / 2 - bw / 2, y: freeBottom - bh - 8 });
    const target: Box | null = a ? { l: a.x - a.r - 8, t: a.y - a.r - 8, r: a.x + a.r + 64, b: a.y + a.r + 70 } : null; // target + hand
    let best = bubWant, bestS = Infinity;
    for (const c0 of cands) {
      const c = { x: clampX(c0.x), y: clampY(c0.y) };
      const box: Box = { l: c.x, t: c.y, r: c.x + bw, b: c.y + bh };
      let s = 0;
      if (target) s += inter(box, target) * 6;
      for (const o of avoid) s += inter(box, o) * 3;
      if (a) s += Math.hypot(c.x + bw / 2 - a.x, c.y + bh / 2 - a.y) * 4;
      // keep still: moving costs a little (no jitter between equal spots)
      s += Math.hypot(c.x - bubWant.x, c.y - bubWant.y) * 2;
      if (s < bestS) { bestS = s; best = c; }
    }
    bubWant = best;
  }
  function placeControls() {
    // a menu, a tool or a panel takes the screen: the controls overlay steps aside (its 20 s keep running)
    ctlBusy = ctx.menu.get() !== null || ctx.tool.get().kind !== 'none' || ctx.selection.get() !== null || modal;
    if (ctlLeft <= 0 || ctlBusy) { ctlBox = null; return; }
    cls(ctl, 'grid', ctx.compact.get());       // compact: 2 × 2 so it fits beside the build bar
    const vw = innerWidth, cb = ctl.getBoundingClientRect();
    const bar = boxOf(document.querySelector('[data-hud="bottom"]'));
    const cw = cb.width, ch = cb.height;
    // beside the build bar when there is room, else above it; mirrored to the right when it would cover the target
    const fits = (side: 'l' | 'r') => !bar || (side === 'l' ? 8 + cw <= bar.l - 8 : vw - 8 - cw >= bar.r + 8);
    const at = (side: 'l' | 'r') => { const x = side === 'l' ? 8 : vw - 8 - cw; return { x, y: fits(side) ? innerHeight - 8 - ch : freeBottom - ch }; };
    const covers = (p: { x: number; y: number }) => !!curAim && inter({ l: p.x, t: p.y, r: p.x + cw, b: p.y + ch }, { l: curAim.x - curAim.r, t: curAim.y - curAim.r, r: curAim.x + curAim.r + 56, b: curAim.y + curAim.r + 56 }) > 0;
    // bottom left (Brief §6.2); it moves to the right only while it would cover the target, and stays there (no ping-pong)
    if (covers(at(ctlSide))) { const o = ctlSide === 'l' ? 'r' : 'l'; if (!covers(at(o))) ctlSide = o; }
    const { x, y } = at(ctlSide);
    put(ctl, 'transform', `translate(${Math.round(x)}px,${Math.round(y)}px)`);
    ctlBox = { l: x, t: y, r: x + cw, b: y + ch };
  }
  function placeJit() {
    const below = clipBox ? clipBox.b + 8 : freeTop + 50;
    const x = clipBox ? clipBox.l : 8;
    put(jit, 'transform', `translate(${Math.round(x)}px,${Math.round(below)}px)`);
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
    measureElAim();
    layout();
    placeControls();
    renderText();
    // just-in-time tips
    if (w.tutorial.done && clock - doneAt >= JIT_AFTER_TUTORIAL_MS) {
      if (jitCur && clock >= jitCur.until) jitCur = null;
      const busy = modal || ctx.paused() || w.speed === 0 || !!document.querySelector('.cb--open, .cb--list');
      if (!jitCur && !busy) {
        const tool = ctx.tool.get();
        const pick = jitPick(w, jm, clock, { buildTool: buildToolSeen && tool.kind === 'build' });
        if (pick) { jitShown(jm, pick.kind, clock); jitCur = { ...pick, until: clock + JIT_SHOW_MS }; renderText(); }
      }
      if (jitCur && busy) jitCur.until = Math.min(jitCur.until, clock); // a modal / open clipboard list hides it
      cls(jit, 'on', !!jitCur);
      if (jitCur) placeJit();
    } else cls(jit, 'on', false);
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
    // bubble
    const showBub = on || ending > 0;
    if (ending > 0) ending -= dt * 1000;
    if (showBub) {
      if (on && (a || !bubPos)) placeBubble(a);   // no target (waiting): the bubble stays where it is
      const k = bubPos ? Math.min(1, dt * 7) : 1;
      bubPos = bubPos ? { x: bubPos.x + (bubWant.x - bubPos.x) * k, y: bubPos.y + (bubWant.y - bubPos.y) * k } : { ...bubWant };
      put(bub, 'transform', `translate(${Math.round(bubPos.x)}px,${Math.round(bubPos.y)}px)`);
    }
    cls(bub, 'on', on);
    cls(bub, 'bye', !on && ending > 0);
    // controls overlay
    if (ctlLeft > 0) ctlLeft -= dt * 1000;
    cls(ctl, 'on', ctlLeft > 0 && !ctlBusy);
  }

  return {
    update(dt: number) {
      clock += dt * 1000;
      acc += dt * 1000;
      if (acc >= TICK_MS || ctx.lang() !== lastLang) { acc = 0; tick(); }
      frame(dt);
    },
    destroy() { offEvent(); offTool(); stage.remove(); },
  };
}
