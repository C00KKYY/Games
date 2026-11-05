/**
 * Juice pass (Brief §12.6 E, §7, STYLE_GUIDE §7): every interaction answers in the frame it is processed.
 * - coins: "+12" plaques (BitmapText on a cream-300/wood-700 3-slice plaque, constant screen size) at the source,
 *   "−120" for spending at the room; bigger amounts also fly coin icons into the topbar coin pill (screen space)
 * - build: dust puffs + grow-in pop on placement, scaffolds while under construction, bounce + sparkles on 'built',
 *   demolish dust, upgrade sparkles + level badge pop, milestone burst with a small screenshake
 * - release: confetti, a tossed cap and two happy hops; ferry horn: ripple rings on the water
 * - unlock / star / objective: short (≤ 1.5 s) screen-space confetti bursts; star + milestone shake (settings.shake)
 * - taps (horn, stamp, crates, escapee, rangler): ring at the finger + squash of the target, failed taps a small coral ring
 * - need plaques over rascals (hungry / tired / dirty / bored), sparingly: the lowest needs only, at most 8
 * - spoon-tunnel escapee (USP 4): a pulsing coral ring at its feet + a coral "!" plaque above it from 'tunnel' until
 *   'caught' / 'escaped' (constant screen size, follows the smoothed agent position) – the player sees whom to tap
 * Fixed pools (no per-frame allocation), all sprites from the one atlas (+ one BitmapFont page), no DOM writes.
 * Test hooks: window.__fxLog [{kind, t, frame}] (cap 300), window.__fxFrame (index of the frame being prepared),
 * window.__fxInput {t, frame} (last pointer input).
 */
import { BitmapFont, BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import type { UICtx, Component } from '../ui/ctx';
import type { SimEvent, Need } from '../sim/types';
import type { SimView } from './simView';
import { tex } from './atlas';
import { TILE } from './world';
import { P } from '../../art/palette';
import { NEEDS, WAGES, type StaffRole } from '../content/balance';
import { placePlaque } from './juiceMath';

const hex = (h: string) => parseInt(h.slice(1), 16);
const C = {
  gold: hex(P.gold500), cream: hex(P.cream300), creamD: hex(P.cream500), mint: hex(P.mint500), coral: hex(P.coral500), teal: hex(P.teal300),
  ink: hex(P.ink900), brick: hex(P.brick700), stone: hex(P.stone300), wood: hex(P.wood300),
};
const CONFETTI = [hex(P.gold500), hex(P.coral500), hex(P.mint500), hex(P.teal300), hex(P.cream300), hex(P.brick500), hex(P.sage300)];
const FONT = 'RrlNum';
const LOG_CAP = 300;
/** plaques / badges / need icons keep a constant on-screen height (STYLE_GUIDE §7: ≥ 14 px) */
const PLAQUE_PX = 22, NEED_PX = 24, BADGE_PX = 34;
/** escapee marker: "!" plaque at the need-icon size, ground ring diameter (screen px) */
const ALERT_PX = 26, ESC_RING_PX = 44;
const MAX_ESC = 2;
const MAX_NEEDS = 8;
const TAP_CMDS = new Set(['tapHorn', 'stamp', 'tapCrates', 'tapEscapee', 'tapRangler']);
const NEED_TEX: Record<Need, string> = { hunger: 'needHunger', energy: 'needEnergy', hygiene: 'needHygiene', fun: 'needFun' };
const NEED_KEYS: Need[] = ['hunger', 'energy', 'hygiene', 'fun'];
const NEED_STATES = new Set(['idle', 'walking', 'queued', 'wander']);

const enum M { Fly, Ring, Pop, Conf, Home }
interface Part {
  s: Sprite; on: boolean; mode: M; t: number; life: number; delay: number;
  x: number; y: number; vx: number; vy: number; g: number; drag: number;
  rot: number; spin: number; s0: number; s1: number; a0: number;
  /** Home: start, control and target points */
  x0: number; y0: number; cx: number; cy: number; tx: number; ty: number;
}

/** fixed sprite pool; when exhausted the oldest particle is recycled */
class Pool {
  parts: Part[] = [];
  private next = 0;
  onHome: ((p: Part) => void) | null = null;
  constructor(parent: Container, n: number, tx: Texture) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(tx); s.anchor.set(0.5); s.visible = false; parent.addChild(s);
      this.parts.push({ s, on: false, mode: M.Fly, t: 0, life: 1, delay: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, spin: 0, s0: 1, s1: 1, a0: 1, x0: 0, y0: 0, cx: 0, cy: 0, tx: 0, ty: 0 });
    }
  }
  get active() { let n = 0; for (const p of this.parts) if (p.on) n++; return n; }
  spawn(t: Texture, mode: M, x: number, y: number, life: number, tint = 0xffffff): Part {
    let p = this.parts[this.next];
    for (let i = 0; i < this.parts.length; i++) { const q = this.parts[(this.next + i) % this.parts.length]; if (!q.on) { p = q; this.next = (this.next + i + 1) % this.parts.length; break; } }
    if (p.on) this.next = (this.next + 1) % this.parts.length;
    const s = p.s;
    if (s.texture !== t) s.texture = t;
    s.tint = tint; s.rotation = 0;
    p.on = true; p.mode = mode; p.t = 0; p.life = life; p.delay = 0; p.x = x; p.y = y; p.vx = p.vy = p.g = p.drag = p.rot = p.spin = 0; p.s0 = p.s1 = 1; p.a0 = 1;
    s.position.set(x, y); s.scale.set(1); s.alpha = 1; s.visible = true;
    return p;
  }
  /** first frame transform right at spawn time → visible in the frame the event is processed */
  prime(p: Part) { if (p.delay > 0) p.s.visible = false; else this.step(p, 0); }
  update(dt: number) { for (const p of this.parts) if (p.on) this.step(p, dt); }
  private step(p: Part, dt: number) {
    const s = p.s;
    if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) return; s.visible = true; dt = 0; }
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { p.on = false; s.visible = false; if (p.mode === M.Home) this.onHome?.(p); return; }
    switch (p.mode) {
      case M.Fly: case M.Conf: {
        const f = p.drag ? Math.exp(-p.drag * dt) : 1;
        p.vx *= f; p.vy = p.vy * f + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        s.position.set(p.x, p.y); s.rotation = p.rot;
        const e = 1 - (1 - k) * (1 - k), sc = p.s0 + (p.s1 - p.s0) * e;
        if (p.mode === M.Conf) s.scale.set(sc * Math.cos(p.t * 9 + p.spin), sc); else s.scale.set(sc);
        s.alpha = p.a0 * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
        break;
      }
      case M.Ring: {
        const e = 1 - Math.pow(1 - k, 3);
        s.scale.set(p.s0 + (p.s1 - p.s0) * e); s.alpha = p.a0 * (1 - k);
        break;
      }
      case M.Pop: {
        // elastic grow-in, hold, fade the last 25 %
        const g = Math.min(1, p.t / 0.35), el = 1 - Math.pow(1 - g, 3) * Math.cos(g * Math.PI * 3);
        s.scale.set(p.s1 * el); s.rotation = p.rot + Math.sin(p.t * 6) * 0.06 * (1 - k);
        s.position.set(p.x, p.y - p.t * p.vy);
        s.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        break;
      }
      case M.Home: {
        // quadratic bezier into the coin pill, ease-in, shrinking at the end
        const e = k * k * (3 - 2 * k), u = 1 - e;
        s.position.set(u * u * p.x0 + 2 * u * e * p.cx + e * e * p.tx, u * u * p.y0 + 2 * u * e * p.cy + e * e * p.ty);
        // a0 < 1 marks a celebration star: plain shrink, no coin-style pop-in/out
        const base = p.s0 + (p.s1 - p.s0) * e;
        s.scale.set(p.a0 < 1 ? base : base * (k < 0.15 ? 0.4 + k / 0.15 * 0.6 : k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.5 : 1));
        s.rotation = Math.sin(p.t * 14 + p.spin) * 0.25;
        break;
      }
    }
  }
}

interface Float {
  c: Container; l: Sprite; n: Sprite; m: Sprite; r: Sprite; txt: BitmapText; on: boolean;
  /** t: age (s); life: when it is gone (extended by merges); base: the original life (rise + fade length) */
  t: number; life: number; base: number;
  /** pt: pop age (restarted by a merge) */
  pt: number;
  /** x/y: base point (world), level: slot in the stack at that spot (lifted by level × 26 px) */
  x: number; y: number; level: number; amount: number; src: string;
}
interface Badge { c: Container; b: Sprite; txt: BitmapText; on: boolean; t: number; life: number; x: number; y: number }
interface RoomPop { items: Container[] | null; t: number; grow: boolean; signs: number[]; /** index of the first furniture sprite (walls come first) */ furn: number }
interface PropSquash { s: Sprite; t: number; amp: number }

type W = typeof window & { __fxLog?: { kind: string; t: number; frame: number }[]; __fxFrame?: number; __fxInput?: { t: number; frame: number; x: number; y: number }; __juice?: unknown };

let fontReady = false;
function installFont() {
  if (fontReady) return;
  BitmapFont.install({
    name: FONT,
    style: { fontFamily: 'Fredoka, system-ui, sans-serif', fontWeight: '700', fontSize: 40, fill: 0xffffff },
    chars: [['0', '9'], '+-−.,KMBT'],
    resolution: 1,
    padding: 2,
  });
  fontReady = true;
}

export interface Juice extends Component {
  /** tap feedback hook (world units): ring + optional squash target; logs kind for test E */
  tap(kind: string, wx: number, wy: number, ok: boolean): void;
}

export function mountJuice(ctx: UICtx, view: SimView): Juice {
  const win = window as W;
  const w = ctx.w;
  installFont();
  const T = (n: string) => tex(n);
  const tx = {
    ring: T('fxRing'), spark: T('sparkle'), star: T('fxStar'), hat: T('hatToss'), puff: T('puff'), conf: T('confetti'), coin: T('coin'),
    scaffold: T('scaffold'), badge: T('lvlBadge'), plqL: T('plqL'), plqM: T('plqM'), plqR: T('plqR'), alert: T('alertMark'),
  };
  const needTex: Record<Need, Texture> = { hunger: T(NEED_TEX.hunger), energy: T(NEED_TEX.energy), hygiene: T(NEED_TEX.hygiene), fun: T(NEED_TEX.fun) };

  // ------------------------------------------------------------------ layers
  const wv = view.world;
  const sea = new Container(); sea.label = 'juice-sea'; wv.sea.addChild(sea);
  const scaffoldLayer = wv.objects;
  const top = new Container(); top.label = 'juice-world'; wv.top.addChild(top);
  const stage = view.container.parent!;
  const screen = new Container(); screen.label = 'juice-screen'; screen.eventMode = 'none'; stage.addChild(screen);
  const seaPool = new Pool(sea, 18, tx.ring);
  const wp = new Pool(top, 260, tx.puff);
  const needLayer = new Container(); top.addChild(needLayer);
  const floatLayer = new Container(); top.addChild(floatLayer);
  const sp = new Pool(screen, 150, tx.conf);

  // ------------------------------------------------------------------ instrumentation (test E)
  const log: { kind: string; t: number; frame: number }[] = win.__fxLog = [];
  let frame = 0;
  win.__fxFrame = 0;
  const input = win.__fxInput = { t: -1, frame: -1, x: 0, y: 0 };
  const fx = (kind: string) => { log.push({ kind, t: performance.now(), frame }); if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP); };
  const onPtr = (e: PointerEvent) => { input.t = performance.now(); input.frame = frame; input.x = e.clientX; input.y = e.clientY; };
  ctx.canvas.addEventListener('pointerdown', onPtr, { passive: true });
  ctx.canvas.addEventListener('pointerup', onPtr, { passive: true });
  /** world point of the last pointer input when it is fresh (a player tap), else null (bot / script command) */
  const pointerWorld = () => {
    if (input.t < 0 || performance.now() - input.t > 600) return null;
    const r = ctx.canvas.getBoundingClientRect();
    return ctx.cam.screenToWorld(input.x - r.left, input.y - r.top);
  };

  /** zoom applied to the world container this frame (the camera fly in app.frame may change cam.zoom after apply) */
  const zoom = () => view.container.scale.x || ctx.cam.zoom;

  // ------------------------------------------------------------------ primitives
  const ring = (pool: Pool, x: number, y: number, tint: number, s0: number, s1: number, life: number, delay = 0, a0 = 0.95) => {
    const p = pool.spawn(tx.ring, M.Ring, x, y, life, tint); p.s0 = s0; p.s1 = s1; p.a0 = a0; p.delay = delay; pool.prime(p); return p;
  };
  const puffs = (x: number, y: number, n: number, rx: number, ry: number, tint = 0xffffff, up = 18) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const p = wp.spawn(tx.puff, M.Fly, x + Math.cos(a) * rx, y + Math.sin(a) * ry, 0.55 + Math.random() * 0.35, tint);
      p.vx = Math.cos(a) * (14 + Math.random() * 16); p.vy = -up - Math.random() * 10; p.drag = 3; p.s0 = 0.5 + Math.random() * 0.3; p.s1 = 1.3 + Math.random() * 0.4; p.a0 = 0.9;
      p.spin = (Math.random() - 0.5) * 2; wp.prime(p);
    }
  };
  const sparkles = (pool: Pool, x: number, y: number, n: number, r: number, tint = C.gold, life = 0.7, scale = 1, stagger = true) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      const p = pool.spawn(tx.spark, M.Fly, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, life * (0.7 + Math.random() * 0.5), tint);
      p.vy = -18 - Math.random() * 22; p.vx = Math.cos(a) * 8; p.drag = 1.5; p.s0 = 0.2 * scale; p.s1 = (0.9 + Math.random() * 0.5) * scale; p.spin = (Math.random() - 0.5) * 6;
      p.delay = stagger ? Math.random() * 0.18 : 0; pool.prime(p);
    }
  };
  /** confetti burst; `speed` in units/s, gravity pulls it back down */
  const confetti = (pool: Pool, x: number, y: number, n: number, speed: number, g: number, spread = Math.PI * 0.9, scale = 1, life = 1.3) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.6);
      const p = pool.spawn(tx.conf, M.Conf, x, y, life * (0.8 + Math.random() * 0.2), CONFETTI[i % CONFETTI.length]);
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.g = g; p.drag = 1.6; p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 14;
      p.s0 = p.s1 = scale * (0.9 + Math.random() * 0.5); pool.prime(p);
    }
  };

  // ------------------------------------------------------------------ floating "+coins" plaques
  const floats: Float[] = [];
  for (let i = 0; i < 24; i++) {
    const c = new Container(); c.visible = false; floatLayer.addChild(c);
    // left end: cap with a coin (income) or the mirrored right cap (spending, number only)
    const l = new Sprite(tx.plqL), n = new Sprite(tx.plqR), m = new Sprite(tx.plqM), r = new Sprite(tx.plqR);
    n.scale.x = -1;
    const txt = new BitmapText({ text: '0', style: { fontFamily: FONT, fontSize: 19 } });
    txt.anchor.set(0, 0.5); txt.position.set(1, 0.5); txt.tint = C.ink;
    c.addChild(l, n, m, r, txt);
    floats.push({ c, l, n, m, r, txt, on: false, t: 0, life: 1, base: 1, pt: 0, x: 0, y: 0, level: 0, amount: 0, src: '' });
  }
  let floatNext = 0;
  const setFloatText = (f: Float) => {
    const v = f.amount, neg = v < 0;
    f.txt.text = (neg ? '\u2212' : '+') + ctx.fmt(Math.abs(v));
    f.txt.tint = neg ? C.brick : C.ink;
    const tw = Math.ceil(f.txt.width) + 2;
    f.l.visible = !neg; f.n.visible = neg;
    f.m.width = tw; f.r.position.set(tw, 0);
    f.c.pivot.set(neg ? tw / 2 : (tw - 14) / 2, 0);
  };
  /**
   * `src` groups plaques that may merge (same source + sign, started < 300 ms ago at the same spot: e.g. a night skip
   * paying several incomes in one frame) – the merged plaque shows the sum and pops again. At most 3 stack at one spot.
   */
  const floatText = (x: number, y: number, amount: number, src = 'misc') => {
    const v = Math.round(amount);
    if (v === 0) return;
    const act = placePlaque(floats, src, x, y, v);
    let f: Float;
    if (act.kind === 'merge') {
      f = floats[act.index];
      f.amount += v; f.pt = 0; f.life = Math.max(f.life, f.t + f.base * 0.8);
      setFloatText(f); layoutFloat(f);
      fx('coinsMerge');
      return;
    }
    if (act.kind === 'replace') f = floats[act.index];
    else {
      const free = floats.find(q => !q.on);
      if (free) f = free; else { f = floats[floatNext]; floatNext = (floatNext + 1) % floats.length; }
    }
    const neg = v < 0;
    f.amount = v; f.src = src; f.level = act.level;
    setFloatText(f);
    f.on = true; f.t = 0; f.pt = 0; f.base = f.life = neg ? 1.3 : 1.15; f.x = x; f.y = y;
    f.c.visible = true;
    layoutFloat(f);
    fx(neg ? 'coinsSpent' : 'coinsFloat');
  };
  const layoutFloat = (f: Float) => {
    const z = zoom(), sc = PLAQUE_PX / 24 / z;
    const pop = f.pt < 0.18 ? 0.5 + 0.5 * Math.sin((f.pt / 0.18) * Math.PI / 2) * 1.12 : f.pt < 0.3 ? 1.06 - (f.pt - 0.18) / 0.12 * 0.06 : 1;
    f.c.scale.set(sc * pop);
    const rise = 1 - Math.pow(1 - Math.min(1, (f.t / f.base) * 1.4), 2);
    f.c.position.set(f.x, f.y - f.level * 26 / z - rise * 26 / z * 1.2);
    const fade = f.base * 0.3;
    f.c.alpha = f.t < f.life - fade ? 1 : Math.max(0, (f.life - f.t) / fade);
  };

  // ------------------------------------------------------------------ level badges
  const badges: Badge[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new Container(); c.visible = false; top.addChild(c);
    const b = new Sprite(tx.badge); b.anchor.set(0.5);
    const txt = new BitmapText({ text: '2', style: { fontFamily: FONT, fontSize: 19 } }); txt.anchor.set(0.5, 0.55); txt.tint = C.ink;
    c.addChild(b, txt);
    badges.push({ c, b, txt, on: false, t: 0, life: 1.5, x: 0, y: 0 });
  }
  const badge = (x: number, y: number, level: number, big: boolean) => {
    const b = badges.find(q => !q.on) ?? badges[0];
    b.txt.text = ctx.fmt(level);
    b.txt.scale.set(String(level).length > 1 ? 0.85 : 1);
    b.on = true; b.t = 0; b.life = big ? 1.5 : 1.3; b.x = x; b.y = y; b.c.visible = true;
    layoutBadge(b);
  };
  const layoutBadge = (b: Badge) => {
    const k = b.t / b.life, z = zoom();
    const g = Math.min(1, b.t / 0.4), el = 1 - Math.pow(1 - g, 3) * Math.cos(g * Math.PI * 3);
    b.c.scale.set((BADGE_PX / 34 / z) * el);
    b.c.position.set(b.x, b.y - b.t * 10 / z);
    b.c.rotation = Math.sin(b.t * 7) * 0.08 * (1 - k);
    b.c.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
  };

  // ------------------------------------------------------------------ room pops (grow-in on placement, bounce on 'built')
  const pops: RoomPop[] = [];
  for (let i = 0; i < 6; i++) pops.push({ items: null, t: 0, grow: false, signs: [], furn: 0 });
  const roomPop = (roomId: number, grow: boolean) => {
    const items = wv.roomViews.get(String(roomId));
    if (!items) return;
    const p = pops.find(q => !q.items) ?? pops.reduce((a, b) => (a.t > b.t ? a : b));
    endPop(p);
    p.items = items; p.t = 0; p.grow = grow;
    const room = w.rooms.find(r => r.id === roomId);
    p.furn = Math.max(0, items.length - (room?.furniture.length ?? 0));
    p.signs.length = 0;
    for (const s of items) p.signs.push(s.scale.x < 0 ? -1 : 1);
    stepPop(p, 0);
  };
  const POP_T = 0.5;
  const stepPop = (p: RoomPop, dt: number) => {
    if (!p.items) return;
    p.t += dt;
    const n = p.items.length;
    let alive = false;
    for (let i = 0; i < n; i++) {
      const s = p.items[i];
      if (s.destroyed) continue;
      // grow-in: walls first, furniture a beat later (added after the walls). Bounce: the walls move as one
      // (a staggered wall reads as broken), the furniture hops one after another
      const wall = i < p.furn;
      const k = (p.t - (p.grow ? Math.min(0.25, i * 0.01) : wall ? 0 : 0.08 + Math.min(0.3, (i - p.furn) * 0.04))) / POP_T;
      const sg = p.signs[i] ?? 1;
      if (k < 0) { if (p.grow) s.scale.set(0.001 * sg, 0.001); alive = true; continue; }
      if (k >= 1) { s.scale.set(sg, 1); continue; }
      alive = true;
      let sy: number;
      if (p.grow) sy = Math.max(0.001, 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 3));
      else sy = 1 + Math.sin(k * Math.PI * 3) * (1 - k) * (wall ? 0.1 : 0.3);
      s.scale.set(sg * (p.grow ? Math.min(1.15, sy) : 1 - (sy - 1) * 0.6), sy);
    }
    if (!alive) endPop(p);
  };
  const endPop = (p: RoomPop) => {
    if (!p.items) return;
    p.items.forEach((s, i) => { if (!s.destroyed) s.scale.set(p.signs[i] ?? 1, 1); });
    p.items = null;
  };

  // ------------------------------------------------------------------ prop squash (ferry, gate, booth) and agents
  const props: PropSquash[] = [{ s: view.ferry, t: 1, amp: 0 }, { s: view.gate, t: 1, amp: 0 }, { s: view.booth, t: 1, amp: 0 }];
  const squash = (s: Sprite, amp = 0.12) => { const q = props.find(p => p.s === s); if (q) { q.t = 0; q.amp = amp; stepSquash(q, 0); } };
  const stepSquash = (q: PropSquash, dt: number) => {
    if (q.t >= 0.4) return;
    q.t += dt;
    if (q.t >= 0.4) { q.s.scale.set(1, 1); return; }
    const k = q.t / 0.4, a = Math.cos(k * Math.PI * 3) * (1 - k) * q.amp;
    q.s.scale.set(1 + a * 0.6, 1 - a);
  };

  // ------------------------------------------------------------------ screenshake (camera offset only)
  let shakeT = 1, shakeAmp = 0;
  const shake = (amp: number) => { if (!ctx.settings.get().shake) return; shakeT = 0; shakeAmp = amp; fx('shake'); };

  // ------------------------------------------------------------------ screen helpers
  const rectCache = new Map<string, { el: HTMLElement | null; x: number; y: number; at: number }>();
  /** centre of the first visible HUD element matching one of `sels` in screen px (layout read only, cached 300 ms) */
  const hudPoint = (...sels: string[]): { x: number; y: number } | null => {
    const key = sels.join('|');
    let c = rectCache.get(key);
    const now = performance.now();
    if (c && now - c.at < 300 && (!c.el || c.el.isConnected)) return c.el ? c : null;
    const cr = ctx.canvas.getBoundingClientRect();
    c = { el: null, x: 0, y: 0, at: now };
    for (const sel of sels) {
      for (const el of ctx.root.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        c.el = el; c.x = r.left + r.width / 2 - cr.left; c.y = r.top + r.height / 2 - cr.top;
        break;
      }
      if (c.el) break;
    }
    rectCache.set(key, c);
    return c.el ? c : null;
  };
  const toScreen = (wx: number, wy: number) => ctx.cam.worldToScreen(wx, wy);
  const coinPill = () => hudPoint('.pill.coins');
  let coinPulse = 0;
  sp.onHome = (p) => {
    // tiny sparkle where the coin lands in the pill (the topbar tweens/pops its own counter)
    coinPulse++;
    if (coinPulse % 2 === 0) sparkles(sp, p.tx, p.ty, 1, 6, C.gold, 0.45, 0.9);
  };
  const flyCoins = (sx: number, sy: number, n: number) => {
    const pill = coinPill();
    if (!pill) return;
    for (let i = 0; i < n; i++) {
      const p = sp.spawn(tx.coin, M.Home, sx, sy, 0.62 + i * 0.05);
      p.x0 = sx + (Math.random() - 0.5) * 24; p.y0 = sy + (Math.random() - 0.5) * 14;
      p.tx = pill.x - 18 + Math.random() * 6; p.ty = pill.y;
      p.cx = (p.x0 + p.tx) / 2 + (Math.random() - 0.5) * 120; p.cy = Math.min(p.y0, p.ty) - 40 - Math.random() * 60;
      p.s0 = p.s1 = 1.35; p.spin = Math.random() * 6; p.delay = i * 0.045;
      sp.prime(p);
    }
    fx('coinsFly');
  };

  // ------------------------------------------------------------------ celebrations (screen space, ≤ 1.5 s, non-blocking)
  const celebrate = (kind: 'star' | 'unlock' | 'objective' | 'milestone' | 'first', at?: { x: number; y: number } | null) => {
    const W = ctx.cam.viewW, H = ctx.cam.viewH;
    const ox = at?.x ?? W / 2, oy = at?.y ?? H * 0.3;
    if (kind === 'star') {
      // the HUD is DOM above the canvas: the star pops in the middle of the play area, then flies into the stars pill
      const c = ctx.cam.centreScreen(), sx = c.x, sy = c.y - 40;
      const p = sp.spawn(tx.star, M.Pop, sx, sy, 0.95); p.s1 = 2.6; p.vy = 6; sp.prime(p);
      ring(sp, sx, sy, C.gold, 0.5, 3.2, 0.6);
      sparkles(sp, sx, sy, 12, 46, C.gold, 0.8, 1.7);
      if (at) {
        const h = sp.spawn(tx.star, M.Home, sx, sy, 0.5); h.delay = 0.72; h.x0 = sx; h.y0 = sy - 6; h.tx = ox; h.ty = oy;
        h.cx = (sx + ox) / 2; h.cy = Math.min(sy, oy) - 30; h.s0 = 2.4; h.s1 = 0.7; h.a0 = 0.99; sp.prime(h);
      }
      confetti(sp, W * 0.3, H * 0.14, 24, 560, 900, Math.PI * 0.8, 2.2, 1.4);
      confetti(sp, W * 0.7, H * 0.14, 24, 560, 900, Math.PI * 0.8, 2.2, 1.4);
      shake(5);
    } else if (kind === 'unlock') {
      confetti(sp, ox, oy, 36, 600, 950, Math.PI * 0.7, 2.2, 1.35);
      sparkles(sp, ox, oy, 8, 40, C.cream, 0.7, 1.5);
      ring(sp, ox, oy, C.mint, 0.4, 2.4, 0.55);
    } else if (kind === 'objective') {
      confetti(sp, ox, oy, 24, 440, 900, Math.PI * 0.9, 2, 1.2);
      sparkles(sp, ox, oy, 6, 30, C.mint, 0.6, 1.4);
    } else if (kind === 'first') {
      confetti(sp, W * 0.5, H * 0.2, 44, 640, 950, Math.PI * 1.1, 2.2, 1.45);
    } else {
      confetti(sp, ox, oy, 32, 500, 900, Math.PI, 2.1, 1.4);
      shake(4);
    }
    fx(`celebrate:${kind}`);
  };

  // ------------------------------------------------------------------ room rect cache (demolish happens after the room is gone)
  const rects = new Map<number, { x: number; y: number; w: number; h: number }>();
  let rectVersion = -1;
  const refreshRects = () => {
    if (w.cache.version === rectVersion) return;
    rectVersion = w.cache.version;
    for (const r of w.rooms) {
      const c = rects.get(r.id);
      if (c) { c.x = r.x; c.y = r.y; c.w = r.w; c.h = r.h; } else rects.set(r.id, { x: r.x, y: r.y, w: r.w, h: r.h });
    }
  };
  refreshRects();
  const roomCentre = (id: number) => { const r = w.rooms.find(q => q.id === id) ?? rects.get(id); return r ? { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE, r } : null; };

  // ------------------------------------------------------------------ taps
  const tap = (kind: string, wx: number, wy: number, ok: boolean) => {
    if (ok) {
      ring(wp, wx, wy, C.cream, 0.5, 1.25, 0.4);
      ring(wp, wx, wy, C.gold, 0.3, 0.85, 0.32);
      sparkles(wp, wx, wy, 3, 8, C.gold, 0.45, 0.8, false);
    } else ring(wp, wx, wy, C.coral, 0.2, 0.7, 0.3, 0, 0.8);
    fx(`tap:${kind}${ok ? '' : ':fail'}`);
  };
  const crateRoom = () => {
    for (let i = w.log.length - 1; i >= Math.max(0, w.log.length - 6); i--) if (w.log[i].cmd === 'tapCrates') return w.rooms.find(r => r.id === w.log[i].args[0]) ?? null;
    return null;
  };
  const ferryPt = () => ({ x: view.ferry.x, y: view.ferry.y - 84 });
  const gatePt = () => ({ x: view.gate.x + 36, y: view.gate.y - 36 });
  const agentPt = (id: unknown) => { const d = typeof id === 'number' ? view.agentPos(id) : null; return d ? { x: d.x, y: d.y - 18 } : null; };

  // ------------------------------------------------------------------ sim events
  const onEvent = (e: SimEvent) => {
    switch (e.type) {
      case 'cmd': {
        const name = String(e.name);
        if (!TAP_CMDS.has(name)) return;
        const pw = pointerWorld();
        let at = pw;
        if (!at) at = name === 'tapHorn' ? ferryPt() : name === 'stamp' ? gatePt() : null;
        if (name === 'tapCrates' && !at) { const r = crateRoom(); if (r) at = { x: (r.door.x + 1.6) * TILE, y: (r.door.y + 1) * TILE }; }
        if (at) tap(name, at.x, at.y, !!e.ok);
        if (e.ok) {
          if (name === 'tapHorn') squash(view.ferry, 0.08);
          else if (name === 'stamp') { squash(view.booth, 0.16); squash(view.gate, 0.07); const g = gatePt(); ring(wp, g.x, g.y + 30, C.coral, 0.3, 1.4, 0.45); }
          else if (name === 'tapCrates' && at) puffs(at.x, at.y + 6, 4, 8, 3, C.creamD, 10);
        }
        return;
      }
      case 'hornTap': { const f = ferryPt(); for (let i = 0; i < 2; i++) ring(seaPool, f.x, f.y + 30, C.cream, 0.6, 3.2, 1.0, i * 0.18, 0.7); fx('hornTap'); return; }
      case 'ferryHorn': {
        const f = ferryPt();
        for (let i = 0; i < 3; i++) ring(seaPool, f.x, f.y - 50, C.teal, 0.5, 3.6, 1.3, i * 0.28, 0.85);
        fx('ferryHorn'); return;
      }
      case 'ferryDock': { const f = ferryPt(); ring(seaPool, f.x, f.y + 70, C.cream, 0.8, 2.6, 0.9, 0, 0.6); puffs(f.x + 40, f.y + 80, 4, 14, 4, C.creamD, 6); fx('ferryDock'); return; }
      case 'coins': {
        const amount = Number(e.amount) || 0;
        if (typeof e.x === 'number' && typeof e.y === 'number') {
          const x = e.x * TILE, y = e.y * TILE - 34;
          floatText(x, y, amount, `coins:${String(e.kind)}`);
          if (amount >= 40) { const s = toScreen(x, y); flyCoins(s.x, s.y, Math.max(2, Math.min(8, Math.round(amount / 40)))); }
        } else if (amount >= 40) {
          // objective rewards etc. come from the clipboard
          const cb = hudPoint('.cb-card', '.cb-chip', '.cb') ?? { x: ctx.cam.viewW / 2, y: ctx.cam.viewH / 2 };
          flyCoins(cb.x, cb.y, Math.max(3, Math.min(8, Math.round(amount / 40))));
        }
        return;
      }
      case 'build': {
        const c = roomCentre(Number(e.roomId)); if (!c) return;
        const r = c.r;
        floatText(c.x, c.y - 10, -(Number(e.cost) || 0));
        puffs(c.x, c.y + 8, 10, r.w * TILE / 2, r.h * TILE / 2, 0xffffff, 12);
        roomPop(Number(e.roomId), true);
        fx('build'); return;
      }
      case 'resize': { const c = roomCentre(Number(e.roomId)); if (!c) return; floatText(c.x, c.y - 10, -(Number(e.cost) || 0)); puffs(c.x, c.y, 6, c.r.w * TILE / 2, c.r.h * TILE / 2); roomPop(Number(e.roomId), false); fx('resize'); return; }
      case 'built': {
        const c = roomCentre(Number(e.roomId)); if (!c) return;
        const r = c.r;
        puffs(c.x, (r.y + r.h) * TILE, 12, r.w * TILE / 2 + 6, 8, 0xffffff, 16);
        sparkles(wp, c.x, c.y, 8, Math.min(r.w, r.h) * TILE / 2, C.cream, 0.8, 1.1);
        ring(wp, c.x, c.y, C.cream, 0.6, 1.2 + Math.max(r.w, r.h) * 0.75, 0.55, 0, 0.7);
        roomPop(Number(e.roomId), false);
        fx('built'); return;
      }
      case 'demolish': {
        const r = rects.get(Number(e.roomId)); if (!r) return;
        const x = (r.x + r.w / 2) * TILE, y = (r.y + r.h / 2) * TILE;
        puffs(x, y, 16, r.w * TILE / 2, r.h * TILE / 2, C.stone, 22);
        if (Number(e.refund) > 0) floatText(x, y - 10, Number(e.refund));
        fx('demolish'); return;
      }
      case 'upgrade': {
        const c = roomCentre(Number(e.roomId)); if (!c) return;
        floatText(c.x, c.y + 6, -(Number(e.cost) || 0));
        sparkles(wp, c.x, c.y, 10, Math.min(c.r.w, c.r.h) * TILE / 2, C.gold, 0.9, 1.1);
        badge(c.x, c.r.y * TILE - 6, Number(e.to) || 1, false);
        roomPop(Number(e.roomId), false);
        fx('upgrade'); return;
      }
      case 'milestone': {
        const c = roomCentre(Number(e.roomId)); if (!c) return;
        sparkles(wp, c.x, c.y, 22, Math.max(c.r.w, c.r.h) * TILE / 2, C.gold, 1.1, 1.4);
        confetti(wp, c.x, c.y, 30, 260, 420, Math.PI, 1.3, 1.4);
        ring(wp, c.x, c.y, C.gold, 0.5, 2 + Math.max(c.r.w, c.r.h), 0.7);
        badge(c.x, c.r.y * TILE - 6, Number(e.level) || 5, true);
        celebrate('milestone', toScreen(c.x, c.y));
        return;
      }
      case 'release': {
        const a = agentPt(e.id) ?? gatePt();
        confetti(wp, a.x, a.y - 14, 34, 260, 400, Math.PI * 0.9, 1.5, 1.35);
        const h = wp.spawn(tx.hat, M.Fly, a.x, a.y - 22, 1.25);
        h.vx = 26 + Math.random() * 12; h.vy = -210; h.g = 330; h.spin = 9; h.s0 = h.s1 = 0.85; wp.prime(h);
        if (typeof e.id === 'number') view.agentView(e.id)?.hop(2);
        sparkles(wp, a.x, a.y - 16, 5, 14, C.gold, 0.7, 1);
        fx('release'); return;
      }
      case 'happytime': if (e.reason === 'firstRelease') celebrate('first'); return;
      case 'admit': { const a = agentPt(e.id); if (a) { sparkles(wp, a.x, a.y - 10, 2, 6, C.mint, 0.5, 0.8); } return; }
      case 'caught': case 'calmed': {
        if (e.type === 'caught' && typeof e.id === 'number') unmarkEscapee(e.id);
        const a = agentPt(e.id); if (!a) return;
        if (typeof e.id === 'number') view.agentView(e.id)?.squash();
        ring(wp, a.x, a.y, e.type === 'caught' ? C.gold : C.mint, 0.3, 1.5, 0.45);
        puffs(a.x, a.y + 10, 5, 10, 4, C.creamD, 12);
        sparkles(wp, a.x, a.y - 14, 4, 10, e.type === 'caught' ? C.gold : C.mint, 0.6, 1);
        fx(e.type); return;
      }
      case 'crateSold': fx('crateSold'); return;
      case 'hire': {
        const a = agentPt(e.id);
        const fee = WAGES[e.role as StaffRole];
        if (a) { puffs(a.x, a.y + 12, 6, 10, 4, 0xffffff, 12); sparkles(wp, a.x, a.y - 10, 4, 10, C.cream, 0.6, 1); if (fee) floatText(a.x, a.y - 20, -fee); }
        fx('hire'); return;
      }
      case 'tunnel':
        if (typeof e.x === 'number' && typeof e.y === 'number') { puffs(e.x * TILE, e.y * TILE, 8, 10, 5, C.wood, 14); fx('tunnel'); }
        if (typeof e.id === 'number') markEscapee(e.id);
        return;
      case 'escaped': if (typeof e.id === 'number') unmarkEscapee(e.id); return;
      case 'foodFight': { const c = roomCentre(Number(e.roomId)); if (c) { puffs(c.x, c.y, 8, c.r.w * TILE / 3, c.r.h * TILE / 3, C.creamD, 18); fx('foodFight'); } return; }
      case 'star': celebrate('star', hudPoint('.pill.stars')); return;
      case 'unlock': { const bb = hudPoint('[data-hud="bottom"]'); celebrate('unlock', { x: ctx.cam.viewW / 2, y: (bb ? bb.y : ctx.cam.viewH) - 60 }); return; }
      case 'objective': celebrate('objective', hudPoint('.cb-card', '.cb-chip', '.cb')); return;
    }
  };
  const offEv = ctx.onEvent(onEvent);

  // ------------------------------------------------------------------ scaffolds + construction dust
  const scaffolds: Sprite[] = [];
  for (let i = 0; i < 16; i++) { const s = new Sprite(tx.scaffold); s.visible = false; scaffoldLayer.addChild(s); scaffolds.push(s); }
  let dustT = 0;
  const updateScaffolds = (dt: number) => {
    let k = 0;
    dustT += dt;
    const dust = dustT > 0.45;
    if (dust) dustT = 0;
    for (const r of w.rooms) {
      if (r.built || r.type === 'gate' || r.type === 'dock' || r.type === 'office') continue;
      const X = r.x * TILE, Y = r.y * TILE, Wd = r.w * TILE, Hd = r.h * TILE;
      for (let c = 0; c < 4 && k < scaffolds.length; c++, k++) {
        const s = scaffolds[k];
        const sx = c & 1 ? X + Wd + 2 : X - 2, sy = c & 2 ? Y + Hd + 10 : Y + 12;
        s.position.set(sx, sy); s.zIndex = sy + 1; s.visible = true;
        s.scale.x = c & 1 ? -1 : 1;
      }
      if (dust && w.speed > 0) puffs(X + Math.random() * Wd, Y + Hd * (0.3 + Math.random() * 0.6), 1, 2, 2, 0xffffff, 10);
    }
    for (; k < scaffolds.length; k++) if (scaffolds[k].visible) scaffolds[k].visible = false;
  };

  // ------------------------------------------------------------------ need plaques
  const needSpr: Sprite[] = [];
  const needId = new Int32Array(MAX_NEEDS).fill(-1), needK = new Int8Array(MAX_NEEDS), needV = new Float32Array(MAX_NEEDS), needAge = new Float32Array(MAX_NEEDS);
  const candId = new Int32Array(MAX_NEEDS), candK = new Int8Array(MAX_NEEDS), candV = new Float32Array(MAX_NEEDS);
  for (let i = 0; i < MAX_NEEDS; i++) { const s = new Sprite(needTex.hunger); s.visible = false; needLayer.addChild(s); needSpr.push(s); }
  let needAcc = 1;
  const pickNeeds = () => {
    let n = 0;
    for (const a of w.agents) {
      if ((a.kind !== 'rascal' && a.kind !== 'vip') || (a.flags & 192) || !NEED_STATES.has(a.state)) continue;
      let lo = 101, lk = 0;
      for (let j = 0; j < 4; j++) { const v = a.needs[NEED_KEYS[j]]; if (v < lo) { lo = v; lk = j; } }
      if (lo >= NEEDS.iconBelow) continue;
      // insertion into the fixed top-N (lowest first)
      let i = n < MAX_NEEDS ? n++ : MAX_NEEDS;
      if (i === MAX_NEEDS) { if (lo >= candV[MAX_NEEDS - 1]) continue; i = MAX_NEEDS - 1; }
      while (i > 0 && candV[i - 1] > lo) { candV[i] = candV[i - 1]; candId[i] = candId[i - 1]; candK[i] = candK[i - 1]; i--; }
      candV[i] = lo; candId[i] = a.id; candK[i] = lk;
    }
    // keep slots stable for agents that stay in the set (so their pop-in does not restart)
    for (let s = 0; s < MAX_NEEDS; s++) {
      const id = needId[s];
      let keep = -1;
      for (let c = 0; c < n; c++) if (candId[c] === id) { keep = c; break; }
      if (keep < 0) { needId[s] = -1; continue; }
      needK[s] = candK[keep]; needV[s] = candV[keep]; candId[keep] = -2;
    }
    for (let c = 0; c < n; c++) {
      if (candId[c] === -2) continue;
      for (let s = 0; s < MAX_NEEDS; s++) if (needId[s] === -1) { needId[s] = candId[c]; needK[s] = candK[c]; needV[s] = candV[c]; needAge[s] = 0; break; }
    }
  };
  let needLogged = false;
  const updateNeeds = (dt: number) => {
    needAcc += dt;
    if (needAcc >= 0.25) { needAcc = 0; pickNeeds(); }
    const z = zoom(), base = NEED_PX / 34 / z;
    for (let s = 0; s < MAX_NEEDS; s++) {
      const spr = needSpr[s], id = needId[s];
      const d = id >= 0 ? view.agentPos(id) : null;
      if (!d) { if (spr.visible) spr.visible = false; continue; }
      needAge[s] += dt;
      const t = needTex[NEED_KEYS[needK[s]]];
      if (spr.texture !== t) spr.texture = t;
      const age = needAge[s], pop = age < 0.25 ? Math.sin((age / 0.25) * Math.PI / 2) * 1.1 : 1;
      const alarm = needV[s] < NEEDS.alarmBelow ? 1 + Math.sin(age * 8) * 0.07 : 1;
      spr.scale.set(base * pop * alarm);
      spr.position.set(d.x, d.y - 42 + Math.sin(age * 2.4 + id) * 1.5);
      spr.visible = true;
      if (!needLogged) { needLogged = true; fx('needIcon'); }
    }
  };

  // ------------------------------------------------------------------ spoon-tunnel escapee marker (USP 4 readability)
  // one ground ring (steady pulse, flattened like a shadow), one expanding pulse ring and the "!" plaque per slot;
  // all atlas sprites in the need layer → batched with the need icons (no extra draw call)
  interface Esc { id: number; t: number; edge: Sprite; ring: Sprite; inner: Sprite; pulse: Sprite; mark: Sprite; all: Sprite[] }
  const escs: Esc[] = [];
  const EDGE = hex(P.brick900);
  for (let i = 0; i < MAX_ESC; i++) {
    // ground ring = dark brick-900 edge + two coral strokes (reads on cobbles, grass and sand alike)
    const edge = new Sprite(tx.ring), ring = new Sprite(tx.ring), inner = new Sprite(tx.ring), pulse = new Sprite(tx.ring), mark = new Sprite(tx.alert);
    const all = [edge, ring, inner, pulse, mark];
    for (const r of [edge, ring, inner, pulse]) r.anchor.set(0.5); // the "!" plaque keeps its atlas anchor (tail tip)
    edge.tint = EDGE; ring.tint = C.coral; inner.tint = C.coral; pulse.tint = C.coral;
    for (const sp of all) { sp.visible = false; needLayer.addChild(sp); }
    escs.push({ id: -1, t: 0, edge, ring, inner, pulse, mark, all });
  }
  const showEsc = (q: Esc, on: boolean) => { for (const sp of q.all) sp.visible = on; };
  const markEscapee = (id: number) => {
    if (escs.some(q => q.id === id)) return;
    const q = escs.find(e => e.id < 0) ?? escs[0];
    q.id = id; q.t = 0;
    layoutEsc(q, 0);
    fx('escapeeMark');
  };
  const unmarkEscapee = (id: number) => { for (const q of escs) if (q.id === id) { q.id = -1; showEsc(q, false); } };
  const layoutEsc = (q: Esc, dt: number) => {
    const d = q.id >= 0 ? view.agentPos(q.id) : null;
    if (!d) { showEsc(q, false); return; }
    q.t += dt;
    const z = zoom(), t = q.t, base = ESC_RING_PX / 42 / z, flat = 0.55;
    // ground ring: ~44 px wide on screen at every zoom, breathing ±8 %
    const rs = base * (1 + Math.sin(t * 7) * 0.08);
    q.edge.scale.set(rs * 1.04, rs * flat * 1.06); q.edge.position.set(d.x, d.y + 2); q.edge.alpha = 0.7;
    q.ring.scale.set(rs, rs * flat); q.ring.position.set(d.x, d.y + 1);
    q.inner.scale.set(rs * 0.93, rs * flat * 0.93); q.inner.position.set(d.x, d.y + 1);
    // pulse: grows from the ring to 1.9× and fades, every 0.8 s
    const k = (t % 0.8) / 0.8, ps = base * (1 + k * 0.9);
    q.pulse.scale.set(ps, ps * flat); q.pulse.position.set(d.x, d.y + 1); q.pulse.alpha = 0.9 * (1 - k);
    // "!" plaque right above the head: pop-in, then a quick heartbeat + hop
    const pop = t < 0.25 ? Math.sin((t / 0.25) * Math.PI / 2) * 1.15 : 1;
    const beat = 1 + Math.max(0, Math.sin(t * 9)) * 0.12;
    q.mark.scale.set((ALERT_PX / 34 / z) * pop * beat);
    q.mark.position.set(d.x, d.y - 38 - Math.abs(Math.sin(t * 6)) * 3 / z);
    showEsc(q, true);
  };
  let escScan = 0;
  const updateEscapees = (dt: number) => {
    // also covers a tunnel that started before this view existed (save loaded mid-event) or a missed end event
    escScan += dt;
    if (escScan >= 0.25) {
      escScan = 0;
      for (const q of escs) if (q.id >= 0 && !w.agents.some(a => a.id === q.id && a.state === 'escaping')) unmarkEscapee(q.id);
      for (const a of w.agents) if (a.state === 'escaping' && !(a.flags & 192)) markEscapee(a.id);
    }
    for (const q of escs) if (q.id >= 0) layoutEsc(q, dt);
  };

  // ------------------------------------------------------------------ frame
  const juice: Juice = {
    tap,
    update(dt: number) {
      refreshRects();
      seaPool.update(dt); wp.update(dt); sp.update(dt);
      for (const f of floats) {
        if (!f.on) continue;
        f.t += dt; f.pt += dt;
        if (f.t >= f.life) { f.on = false; f.c.visible = false; continue; }
        layoutFloat(f);
      }
      for (const b of badges) {
        if (!b.on) continue;
        b.t += dt;
        if (b.t >= b.life) { b.on = false; b.c.visible = false; continue; }
        layoutBadge(b);
      }
      for (const p of pops) stepPop(p, dt);
      for (const q of props) stepSquash(q, dt);
      updateScaffolds(dt);
      updateNeeds(dt);
      updateEscapees(dt);
      if (shakeT < 0.4) {
        shakeT += dt;
        const k = Math.min(1, shakeT / 0.4), a = shakeAmp * (1 - k) * (1 - k);
        view.container.position.x += Math.sin(shakeT * 70) * a;
        view.container.position.y += Math.cos(shakeT * 57) * a * 0.7;
      }
      frame++;
      win.__fxFrame = frame;
    },
    destroy() {
      offEv();
      ctx.canvas.removeEventListener('pointerdown', onPtr);
      ctx.canvas.removeEventListener('pointerup', onPtr);
      screen.destroy({ children: true }); top.destroy({ children: true }); sea.destroy({ children: true });
      for (const s of scaffolds) s.destroy();
    },
  };
  win.__juice = { stats: () => ({ world: wp.active, screen: sp.active, sea: seaPool.active, floats: floats.filter(f => f.on).length, plaques: floats.filter(f => f.on).map(f => ({ x: f.x, y: f.y, level: f.level, amount: f.amount, src: f.src, t: f.t })), needs: needSpr.filter(s => s.visible).length, escapees: escs.filter(q => q.id >= 0).map(q => q.id) }), celebrate, juice };
  return juice;
}
