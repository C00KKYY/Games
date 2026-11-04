/**
 * Canvas tools (docs/UI_DESIGN.md §4, §5): selection and world taps, build ghost (drag a rectangle, touch ✓ / ✕),
 * edge-drag resize, demolish with a confirmation bubble, guard radius overlay and the game hotkeys.
 * World-space drawing lives in src/render/ghost.ts; DOM bits (cursor label, ✓ / ✕, bubble, tool chip) are overlays.
 *
 * Placement checks: tileReason() is pure and runs on every rectangle change; the full validatePlacement() (which does a
 * trial placement + rebuild) only ever runs on a throw-away SANDBOX copy of the world (cloned grid, rooms, poi, cache),
 * so the live world is never touched and the renderer is not forced to rebuild its rooms.
 */
import './tools.css';
import type { UICtx, Component, TipContent, Tool } from './ctx';
import { ROOM_ICON } from './ctx';
import { GhostLayer, handlePos, type Rect, type Edge, type Line, type CrateStack } from '../render/ghost';
import { TILE } from '../render/world';
import { ROOMS, roomCost, roomSlots, GUARD_RADIUS, type RoomType } from '../content/balance';
import { FERRY_POS, GATE_X, GATE_Y, BOOTH, DOCK } from '../content/site1';
import { MAX_ROOM, LAYOUT, packRoom, adjacencyBonuses, noisePenalty } from '../sim/layout';
import { tileReason, validatePlacement } from '../sim/rooms';
import { rebuild, makeRoom, isWalled, roomById } from '../sim/world';
import { distanceField, idx } from '../sim/pathfield';
import { UNREACHABLE, AF, type World, type Room, type Agent, type CommandResult, type Side } from '../sim/types';

const WRITE_MS = 100;                    // DOM writes ≤ 10 / s
const CLICK_PX = 6, CLICK_MS = 250;      // click vs drag
const DOUBLE_MS = 400;
const PICK_TILES = 0.6;                  // agent pick radius around the foot point
const TAP_TILES = 0.8;                   // escapee / brawler / crates
const BODY_TILES = 0.7;                  // the pick area reaches this far up the body
const TOUCH_PICK_PX = 22;                // minimum pick radius on touch (≈ 44 px target)

const svg = (s: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${s}</svg>`)}`;
const ICON = {
  no: svg('<circle cx="12" cy="12" r="8.5" fill="#f8f0de" stroke="#a93e34" stroke-width="3"/><path d="M6.5 17.5 17.5 6.5" stroke="#a93e34" stroke-width="3" stroke-linecap="round"/>'),
  size: svg('<rect x="4" y="4" width="16" height="16" rx="2" fill="#f8f0de" stroke="#a93e34" stroke-width="2.2" stroke-dasharray="3 2.4"/><path d="M8 12h8M12 8v8" stroke="#a93e34" stroke-width="2.4" stroke-linecap="round"/>'),
  fence: svg('<path d="M5 20V7l2-2 2 2v13M11 20V7l2-2 2 2v13M17 20V7l2-2 2 2v13" fill="#d39c63" stroke="#4a3022" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 11h19M3 16h19" stroke="#4a3022" stroke-width="1.8"/><path d="M4 21 20 3" stroke="#a93e34" stroke-width="2.6" stroke-linecap="round"/>'),
  overlap: svg('<rect x="3" y="3" width="12" height="12" rx="2" fill="#efe3c8" stroke="#4a3022" stroke-width="1.8"/><rect x="9" y="9" width="12" height="12" rx="2" fill="#df6450" fill-opacity=".85" stroke="#a93e34" stroke-width="1.8"/>'),
  lock: svg('<path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="#4a3022" stroke-width="2.6" stroke-linecap="round"/><rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="#e8b13a" stroke="#4a3022" stroke-width="1.8"/><circle cx="12" cy="15.6" r="1.7" fill="#4a3022"/>'),
  up: svg('<circle cx="12" cy="12" r="9" fill="#5fc39a" stroke="#2f8a68" stroke-width="2"/><path d="M12 17V8M8 11.5 12 7.5l4 4" fill="none" stroke="#f8f0de" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  down: svg('<circle cx="12" cy="12" r="9" fill="#df6450" stroke="#a93e34" stroke-width="2"/><path d="M12 7v9M8 12.5l4 4 4-4" fill="none" stroke="#f8f0de" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
};

type Reason = 'ok' | 'tooSmall' | 'outside' | 'overlap' | 'blocksPath' | 'onRoad' | 'tooLarge' | 'coins' | 'locked';
interface Bonus { kind: string; value: number; partner: number }
interface Eval { reason: Reason; door: { x: number; y: number; side: Side } | null; cap: number; bonuses: Bonus[]; noise: { partner: number; bunkIsTrial: boolean }[] }
interface Press { id: number; sx: number; sy: number; t: number; button: number; type: string; moved: number }
interface Tile { x: number; y: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const FIXED = new Set<RoomType>(['gate', 'dock', 'office']);
const reasonIcon = (ctx: UICtx, r: Reason) => r === 'coins' ? ctx.icon('coin') : r === 'locked' ? ICON.lock
  : r === 'tooSmall' || r === 'tooLarge' ? ICON.size : r === 'outside' ? ICON.fence : r === 'overlap' ? ICON.overlap : ICON.no;

/** a throw-away copy of the world for trial placements: everything validatePlacement()/rebuild() write is cloned */
function sandbox(w: World): World {
  const g = w.grid;
  const grid = { ...g, ground: g.ground.slice(), owned: g.owned.slice(), roomAt: g.roomAt.slice(), wallE: g.wallE.slice(), wallS: g.wallS.slice(), blocked: g.blocked.slice(), fixed: g.fixed.slice(), road: g.road.slice() };
  return {
    ...w, grid, rooms: w.rooms.map(r => ({ ...r, links: r.links.slice() })), poi: { ...w.poi },
    cache: { ...w.cache, fields: new Map(w.cache.fields), doorRes: new Int32Array(0) }, events: [], log: [],
  };
}

export function mountTools(ctx: UICtx): Component {
  const { w, t, cam } = ctx;
  const layer = new GhostLayer(ctx.overlay);

  // ------------------------------------------------------------------ DOM kit (memoised writes)
  const memo = new WeakMap<Element, Map<string, string>>();
  const put = (el: Element, k: string, v: string) => {
    let m = memo.get(el); if (!m) { m = new Map(); memo.set(el, m); }
    if (m.get(k) === v) return;
    m.set(k, v);
    if (k === 'text') el.textContent = v;
    else if (k === 'hidden') (el as HTMLElement).hidden = v === '1';
    else if (k.startsWith('.')) el.classList.toggle(k.slice(1), v === '1');
    else if (k.startsWith('~')) (el as HTMLElement).style.setProperty(k.slice(1), v);
    else if (k === 'src') (el as HTMLImageElement).src = v;
    else el.setAttribute(k, v);
  };
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement) => {
    const el = document.createElement(tag); el.className = cls; parent.appendChild(el); return el;
  };
  const img = (src: string, cls: string, parent: HTMLElement) => { const i = h('img', cls, parent); i.src = src; i.alt = ''; i.draggable = false; return i; };
  const button = (cls: string, parent: HTMLElement, icon: string, tip: () => TipContent, onClick: () => void) => {
    const b = h('button', cls, parent); b.type = 'button';
    img(icon, 'tl-bi', b);
    b.dataset.tip = '1';
    ctx.tip(b, tip);
    b.addEventListener('click', e => { e.stopPropagation(); ctx.sound('click'); onClick(); urgent = true; });
    b.addEventListener('pointerdown', e => e.stopPropagation());
    return b;
  };
  const overlay = (cls: string, parent: HTMLElement) => { const el = h('div', cls, parent); el.dataset.overlay = '1'; el.hidden = true; return el; };

  const wrap = h('div', 'tl', ctx.root);
  if (ctx.touch) wrap.classList.add('touch');
  // cursor label
  const label = overlay('tl-label', wrap);
  const lHead = h('div', 'tl-row tl-head', label);
  const lIcon = img(ctx.icon('rooms'), 'tl-ic', lHead);
  const lName = h('span', 'tl-name', lHead);
  const lSize = h('span', 'tl-size num', lHead);
  const lStats = h('div', 'tl-row tl-stats', label);
  const lPrice = h('span', 'tl-price', lStats);
  img(ctx.icon('coin'), 'tl-ic', lPrice);
  const lPriceN = h('span', 'num', lPrice);
  const lCap = h('span', 'tl-cap', lStats);
  const lCapIc = img(ctx.icon('bed'), 'tl-ic', lCap);
  const lCapN = h('span', '', lCap);
  const lLines: { row: HTMLElement; ic: HTMLImageElement; tx: HTMLElement }[] = [];
  for (let i = 0; i < 5; i++) { const row = h('div', 'tl-row tl-line', label); row.hidden = true; lLines.push({ row, ic: img(ICON.up, 'tl-ic', row), tx: h('span', '', row) }); }
  // touch ✓ / ✕
  const confirm = overlay('tl-confirm', wrap);
  const yes = button('tl-btn tl-yes', confirm, ctx.icon('check'), () => {
    const r = pending, tl = tool;
    if (!r || tl.kind !== 'build') return { title: t('build.confirm') };
    const e = evalFor(tl.type, r, 0);
    return { title: t('build.confirm'), body: e.reason === 'ok' ? t('tools.buildBody', { room: t(`room.${tl.type}`), w: r.w, h: r.h, n: ctx.fmt(roomCost(tl.type, r.w, r.h)) }) : reasonText(e.reason) };
  }, () => { if (pending && tool.kind === 'build') doBuild(pending, false); });
  const no = button('tl-btn tl-no', confirm, ctx.icon('close'), () => ({ title: t('build.cancel'), body: cancelBody(), hotkey: 'Esc' }), () => cancelTool());
  // demolish bubble
  const bubble = overlay('tl-bubble', wrap);
  bubble.setAttribute('role', 'dialog');
  const bQ = h('div', 'tl-bq', bubble);
  const bRow = h('div', 'tl-row tl-brow', bubble);
  const bIc = img(ctx.icon('coin'), 'tl-ic', bRow);
  const bN = h('span', 'num', bRow);
  const bNote = h('span', 'tl-note', bRow);
  const bBtns = h('div', 'tl-bbtns', bubble);
  const bYes = button('tl-btn tl-byes', bBtns, ctx.icon('demolish'), () => {
    const r = roomById(w, bubbleRoom);
    return { title: t('build.demolish'), body: r ? t('tools.refundBody', { n: ctx.fmt(refundOf(r).n), p: refundOf(r).full ? 100 : 50 }) : undefined };
  }, () => doDemolish());
  const bYesT = h('span', 'tl-bt', bYes);
  const bNo = button('tl-btn tl-bno', bBtns, ctx.icon('close'), () => ({ title: t('build.cancel'), body: t('tools.keepBody'), hotkey: 'Esc' }), () => { bubbleRoom = 0; dirtyPixi = true; });
  // tool chip with ✕
  const chip = overlay('tl-chip', wrap);
  const cIc = img(ctx.icon('rooms'), 'tl-ic', chip);
  const cTx = h('span', 'tl-chip-t', chip);
  const cX = button('tl-btn tl-chip-x', chip, ctx.icon('close'), () => ({ title: t('build.cancel'), body: cancelBody(), hotkey: 'Esc' }), () => cancelTool());

  // ------------------------------------------------------------------ state
  let tool: Tool = ctx.tool.get();
  let hover: { x: number; y: number } | null = null;   // screen px of the mouse over the canvas
  const hoverWorld = () => (hover ? cam.screenToWorld(hover.x, hover.y) : null);
  let camKey = 0;
  let lastPointer = ctx.touch ? 'touch' : 'mouse';
  let prevPending: Rect | null = null;
  let space = false;
  const pointers = new Set<number>();
  let press: Press | null = null;
  let rect: Rect | null = null;          // build ghost (hover or drag)
  let dragging = false, anchor: Tile = { x: 0, y: 0 }, base: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let pending: Rect | null = null;       // touch: rectangle waiting for ✓ / ✕
  let edge: { id: number; e: Edge; orig: Rect; cur: Rect } | null = null;
  let hoverEdge: Edge | null = null;
  let bubbleRoom = 0, hoverRoom = 0;
  let showRadius = false;
  let lastClick = { t: 0, room: 0 };
  let urgent = true, acc = 1, dirtyPixi = true, pixiAcc = 0;
  let lastLang = '', lastVersion = -1, lastZoom = 0;
  let ringX = 0, ringY = 0, ringId = 0;

  const syncOwn = () => { ctx.input.ownsPointer = tool.kind !== 'none' || !!edge; };
  const minOf = (type: RoomType) => ({ w: ROOMS[type].minW, h: ROOMS[type].minH });
  const centred = (type: RoomType, tile: Tile): Rect => { const m = minOf(type); return { x: tile.x - ((m.w - 1) >> 1), y: tile.y - ((m.h - 1) >> 1), w: m.w, h: m.h }; };
  const tileOf = (p: { x: number; y: number }): Tile => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  const rectOf = (r: Room): Rect => ({ x: r.x, y: r.y, w: r.w, h: r.h });
  const sameRect = (a: Rect | null, b: Rect | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const resizable = (r: Room | undefined): r is Room => !!r && isWalled(r) && !FIXED.has(r.type);
  const cancelBody = () => t(lastPointer === 'touch' ? 'tools.cancelBodyTouch' : 'tools.cancelBody');

  // ------------------------------------------------------------------ evaluation (memoised per world version)
  const evals = new Map<string, Eval>();
  function evalFor(type: RoomType, r: Rect, ignoreId: number): Eval {
    const key = `${type},${r.x},${r.y},${r.w},${r.h},${ignoreId}`;
    let e = evals.get(key);
    if (e) return e;
    if (evals.size > 96) evals.clear();
    e = evaluate(type, r, ignoreId);
    evals.set(key, e);
    return e;
  }
  function evaluate(type: RoomType, r: Rect, ignoreId: number): Eval {
    const out: Eval = { reason: w.unlocked[type] || ignoreId ? tileReason(w, type, r.x, r.y, r.w, r.h, ignoreId) : 'locked', door: null, cap: roomSlots(type, r.w, r.h), bonuses: [], noise: [] };
    if (out.reason !== 'ok') return out;
    const sb = sandbox(w);
    const v = validatePlacement(sb, type, r.x, r.y, r.w, r.h, ignoreId);
    out.reason = v.reason;
    if (!v.door || v.reason !== 'ok') return out;
    out.door = v.door;
    out.cap = type === 'guard' ? 0 : packRoom(type, r.w, r.h, v.door, 1, r.x, r.y).slots.length;
    // layout bonuses of the finished layout: trial room in the sandbox, every room counted as built
    const trial = makeRoom(sb, type, r.x, r.y, r.w, r.h, v.door, true);
    sb.rooms = sb.rooms.filter(x => x.id !== ignoreId);
    for (const x of sb.rooms) x.built = true;
    sb.rooms.push(trial);
    rebuild(sb);
    const f = distanceField(sb.grid, [idx(v.door.x, v.door.y)]);
    const walk = (a: number, b: number) => {
      const o = a === trial.id ? b : b === trial.id ? a : 0;
      const R = o ? sb.rooms.find(x => x.id === o) : undefined;
      if (!R) return Infinity;
      const d = f[idx(R.door.x, R.door.y)];
      return d === UNREACHABLE ? Infinity : d / 10;
    };
    for (const b of adjacencyBonuses(sb.rooms, walk)) {
      if (b.a !== trial.id && b.b !== trial.id) continue;
      out.bonuses.push({ kind: b.kind, value: b.value, partner: b.a === trial.id ? b.b : b.a });
    }
    for (const n of noisePenalty(sb.rooms)) {
      if (n.bunkId === trial.id) out.noise.push({ partner: n.sourceId, bunkIsTrial: true });
      else if (n.sourceId === trial.id) out.noise.push({ partner: n.bunkId, bunkIsTrial: false });
    }
    return out;
  }
  const reasonText = (r: Reason) => t(`place.${r}`);
  /** same rule as demolish() in src/sim/rooms.ts */
  function refundOf(r: Room) {
    const full = w.director.data.lastBuildId === r.id && (!r.built || w.rtMs - r.buildEndMs <= 10000);
    const baseCost = roomCost(r.type, r.w, r.h);
    return { n: Math.round(full ? (w.director.data.lastBuildCost ?? baseCost) : baseCost * 0.5), full };
  }
  const isLastOfType = (r: Room) => (r.type === 'bunk' || r.type === 'canteen') && w.rooms.filter(x => x.type === r.type).length <= 1;

  // ------------------------------------------------------------------ commands
  function fail(r: CommandResult) {
    if (r.ok || r.reason === 'unchanged' || r.reason === 'none' || r.reason === 'noFerry' || r.reason === 'empty') return;
    const k = `tools.reason.${r.reason}`, msg = t(k);
    if (msg !== k) ctx.toast(msg, { kind: 'bad', ms: 2200 });
    else ctx.feedback(r);
  }
  function doBuild(r: Rect, keep: boolean) {
    if (tool.kind !== 'build') return;
    const res = ctx.cmd.build(w, tool.type, r.x, r.y, r.w, r.h);
    if (!res.ok) { fail(res); return; }
    ctx.sound('build');
    evals.clear();
    if (keep) { pending = null; dirtyPixi = true; urgent = true; }
    else ctx.tool.set({ kind: 'none' });
  }
  function doDemolish() {
    const r = roomById(w, bubbleRoom);
    bubbleRoom = 0; dirtyPixi = true;
    if (!r) return;
    const res = ctx.cmd.demolish(w, r.id);
    if (!res.ok) { fail(res); return; }
    ctx.sound('demolish');
    evals.clear();
    const sel = ctx.selection.get();
    if (sel?.kind === 'room' && sel.id === r.id) ctx.selection.set(null);
    if (!shiftHeld) ctx.tool.set({ kind: 'none' });
  }
  let shiftHeld = false;
  function cancelTool() {
    if (tool.kind !== 'none') ctx.tool.set({ kind: 'none' });
    else { edge = null; syncOwn(); }
    urgent = true; dirtyPixi = true;
  }

  // ------------------------------------------------------------------ hit tests
  const pickR = (tiles: number) => Math.max(tiles, ctx.touch || lastPointer === 'touch' ? TOUCH_PICK_PX / cam.zoom / TILE : 0);
  /** front-most (largest y) agent whose foot point / lower body is within r tiles of p (tile coords) */
  function agentAt(px: number, py: number, rTiles: number, ok: (a: Agent) => boolean): Agent | null {
    let best: Agent | null = null;
    for (const a of w.agents) {
      if (!ok(a)) continue;
      const dx = px - a.x, dy = py < a.y - BODY_TILES ? py - (a.y - BODY_TILES) : py > a.y ? py - a.y : 0;
      if (dx * dx + dy * dy <= rTiles * rTiles && (!best || a.y > best.y)) best = a;
    }
    return best;
  }
  const selectable = (a: Agent) => a.kind !== 'cart' && !(a.flags & (AF.gone | AF.offDuty));
  function roomAt(tx: number, ty: number): Room | undefined {
    let hit: Room | undefined;
    for (const r of w.rooms) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) { if (!hit || (isWalled(r) && !isWalled(hit))) hit = r; }
    return hit;
  }
  /** crate stack spot (tile coords, foot point) beside a workshop door – drawn by render/ghost.ts */
  function crateSpot(r: Room) {
    const d = r.door;
    switch (d.side) {
      case 'N': return { x: d.x + 1.6, y: r.y - 0.15 };
      case 'E': return { x: r.x + r.w + 0.55, y: d.y + 1.7 };
      case 'W': return { x: r.x - 0.55, y: d.y + 1.7 };
      default: return { x: d.x + 1.6, y: r.y + r.h + 0.8 };
    }
  }
  function inFerry(px: number, py: number) {
    // ferry sprite 84×172 px, bottom-centre anchor at FERRY_POS; it glides in from x = −9 while arriving
    const slack = pickR(0) * TILE;
    const x0 = -9 * TILE - 42 - slack, x1 = Math.max(FERRY_POS.x * TILE + 42, (DOCK.x + 1) * TILE) + slack;
    return px >= x0 && px <= x1 && py >= FERRY_POS.y * TILE - 172 - slack && py <= FERRY_POS.y * TILE + 8 + slack;
  }
  function inGate(px: number, py: number) {
    // gate arch 76×88 px at (GATE_X − 0.125, GATE_Y), the clerk's booth and the queue tiles in front of it
    const slack = pickR(0) * TILE;
    const gx0 = (GATE_X - 0.25) * TILE - slack, gx1 = (GATE_X + 2.25) * TILE + slack, gy0 = (GATE_Y - 2.8) * TILE - slack, gy1 = (GATE_Y + 0.4) * TILE + slack;
    const bx0 = (BOOTH.x - 0.1) * TILE - slack, bx1 = (BOOTH.x + BOOTH.w) * TILE + slack, by0 = (BOOTH.y - 1.1) * TILE - slack, by1 = (BOOTH.y + 1.1) * TILE + slack;
    return (px >= gx0 && px <= gx1 && py >= gy0 && py <= gy1) || (px >= bx0 && px <= bx1 && py >= by0 && py <= by1);
  }
  const handleRoom = (): Room | undefined => {
    if (tool.kind === 'resize') { const r = roomById(w, tool.roomId); return resizable(r) ? r : undefined; }
    if (tool.kind !== 'none') return undefined;
    const s = ctx.selection.get();
    if (s?.kind !== 'room') return undefined;
    const r = roomById(w, s.id);
    return resizable(r) ? r : undefined;
  };
  const touchy = () => ctx.touch || lastPointer === 'touch';
  const handleHalf = () => (touchy() ? 16 : 11) / cam.zoom;    // world units, constant on screen
  function hitHandle(r: Rect, sx: number, sy: number): Edge | null {
    const hit = touchy() ? 48 : 32;                              // hit box ≥ 44 px on touch, ≥ 32 px on desktop
    let best: Edge | null = null, bd = Infinity;
    for (const e of ['N', 'S', 'E', 'W'] as Edge[]) {
      const p = handlePos(r, e), s = cam.worldToScreen(p.x, p.y);
      const horiz = e === 'N' || e === 'S';
      const along = Math.max(hit, handleHalf() * 2 * cam.zoom) / 2, across = hit / 2;
      const dx = Math.abs(sx - s.x), dy = Math.abs(sy - s.y);
      if ((horiz ? dx <= along && dy <= across : dx <= across && dy <= along) && dx + dy < bd) { bd = dx + dy; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ rectangles
  function dragRect(c: Tile): Rect {
    let x0 = base.x, x1 = base.x + base.w - 1, y0 = base.y, y1 = base.y + base.h - 1;
    if (c.x > anchor.x) x1 = Math.max(x1, Math.min(c.x, x0 + MAX_ROOM - 1)); else if (c.x < anchor.x) x0 = Math.min(x0, Math.max(c.x, x1 - MAX_ROOM + 1));
    if (c.y > anchor.y) y1 = Math.max(y1, Math.min(c.y, y0 + MAX_ROOM - 1)); else if (c.y < anchor.y) y0 = Math.min(y0, Math.max(c.y, y1 - MAX_ROOM + 1));
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function edgeRect(o: Rect, e: Edge, type: RoomType, p: { x: number; y: number }): Rect {
    const m = minOf(type), bx = Math.round(p.x / TILE), by = Math.round(p.y / TILE);
    const r = { ...o };
    if (e === 'E') r.w = clamp(bx - o.x, m.w, MAX_ROOM);
    else if (e === 'W') { const right = o.x + o.w; r.x = clamp(bx, right - MAX_ROOM, right - m.w); r.w = right - r.x; }
    else if (e === 'S') r.h = clamp(by - o.y, m.h, MAX_ROOM);
    else { const bottom = o.y + o.h; r.y = clamp(by, bottom - MAX_ROOM, bottom - m.h); r.h = bottom - r.y; }
    return r;
  }

  /** touch start: a valid min-size spot near the camera centre (pure tile check first, a few full checks after) */
  function nearestSpot(type: RoomType, c: Tile): Rect {
    let first: Rect | null = null, full = 0;
    for (let rad = 0; rad <= 9; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
      const r = centred(type, { x: c.x + dx, y: c.y + dy });
      if (tileReason(w, type, r.x, r.y, r.w, r.h) !== 'ok') continue;
      first ??= r;
      if (evalFor(type, r, 0).reason === 'ok') return r;
      if (++full >= 8) return first;
    }
    return first ?? centred(type, c);
  }

  // ------------------------------------------------------------------ pointer input
  const canvas = ctx.canvas;
  const toWorld = (e: PointerEvent) => cam.screenToWorld(e.clientX, e.clientY);
  function onDown(e: PointerEvent) {
    lastPointer = e.pointerType;
    pointers.add(e.pointerId);
    if (pointers.size > 1) {
      // second finger: the camera pinches / pans (input.ts) – drop our gesture
      if (dragging) { dragging = false; pending = prevPending; rect = pending; }
      edge = null; press = null; syncOwn(); dirtyPixi = true; urgent = true;
      return;
    }
    shiftHeld = e.shiftKey;
    press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType, moved: 0 };
    if (e.button !== 0 || space) return;     // right / middle / Space+left pan (input.ts); right click cancels on release
    const p = toWorld(e);
    if (tool.kind === 'build') {
      anchor = tileOf(p); base = centred(tool.type, anchor); rect = base; dragging = true;
      prevPending = pending; pending = null; dirtyPixi = true; urgent = true;
      return;
    }
    if (tool.kind === 'demolish') return;
    const hr = handleRoom();
    if (hr) {
      const he = hitHandle(rectOf(hr), e.clientX, e.clientY);
      if (he) { edge = { id: hr.id, e: he, orig: rectOf(hr), cur: rectOf(hr) }; syncOwn(); dirtyPixi = true; urgent = true; }
    }
  }
  function onMove(e: PointerEvent) {
    if (e.pointerType !== 'touch') lastPointer = e.pointerType;
    const p = toWorld(e);
    if (e.pointerType !== 'touch') {
      hover = { x: e.clientX, y: e.clientY };
      if (tool.kind === 'build' && !dragging && !pending) { const g = centred(tool.type, tileOf(p)); if (!sameRect(g, rect)) { rect = g; dirtyPixi = true; } }
      if (tool.kind === 'demolish') { const r = roomAt(p.x / TILE, p.y / TILE); const id = r ? r.id : 0; if (id !== hoverRoom) { hoverRoom = id; dirtyPixi = true; } }
      if (!press && !edge) {
        const hr = handleRoom(), he = hr ? hitHandle(rectOf(hr), e.clientX, e.clientY) : null;
        if (he !== hoverEdge) { hoverEdge = he; dirtyPixi = true; urgent = true; }
      }
    }
    if (press && e.pointerId === press.id) press.moved = Math.max(press.moved, Math.hypot(e.clientX - press.sx, e.clientY - press.sy));
    if (dragging && press && e.pointerId === press.id && tool.kind === 'build') {
      const r = dragRect(tileOf(p)); if (!sameRect(r, rect)) { rect = r; dirtyPixi = true; }
    }
    if (edge && press && e.pointerId === press.id) {
      const room = roomById(w, edge.id);
      if (!room) { edge = null; syncOwn(); return; }
      const r = edgeRect(edge.orig, edge.e, room.type, p);
      if (!sameRect(r, edge.cur)) { edge.cur = r; dirtyPixi = true; }
    }
  }
  function onUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (!press || press.id !== e.pointerId) return;
    const pr = press; press = null;
    const click = pr.moved < CLICK_PX && performance.now() - pr.t < CLICK_MS;
    const p = toWorld(e);
    urgent = true; dirtyPixi = true;
    if (pr.button === 2) { if (click && (tool.kind !== 'none' || edge)) cancelTool(); return; }
    if (pr.button !== 0) return;
    if (edge) {
      const ed = edge; edge = null; syncOwn();
      if (!sameRect(ed.cur, ed.orig)) { const res = ctx.cmd.resize(w, ed.id, ed.cur.x, ed.cur.y, ed.cur.w, ed.cur.h); if (res.ok) { ctx.sound('build'); evals.clear(); } else fail(res); }
      return;
    }
    if (dragging && tool.kind === 'build') {
      dragging = false;
      const r = rect; if (!r) return;
      if (pr.type !== 'touch') doBuild(r, e.shiftKey);
      else { pending = r; rect = r; }
      return;
    }
    if (tool.kind === 'demolish') {
      if (pr.moved >= CLICK_PX) return;
      const r = roomAt(p.x / TILE, p.y / TILE);
      bubbleRoom = r ? r.id : 0;
      return;
    }
    if (click && !space) select(p.x / TILE, p.y / TILE);
  }
  function onCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (press?.id !== e.pointerId) return;
    press = null;
    if (dragging) { dragging = false; pending = prevPending; rect = pending; }
    edge = null; syncOwn(); dirtyPixi = true; urgent = true;
  }
  function onLeave(e: PointerEvent) {
    if (e.pointerType === 'touch' || press) return;
    hover = null; hoverRoom = 0; hoverEdge = null;
    if (tool.kind === 'build' && !pending) rect = null;
    dirtyPixi = true; urgent = true;
  }

  /** no tool: world taps first, then agents, then rooms */
  function select(tx: number, ty: number) {
    const px = tx * TILE, py = ty * TILE;
    const tap = (r: CommandResult, snd: string) => { if (r.ok) ctx.sound(snd); else fail(r); };
    if (w.ferry.state === 'arriving' && inFerry(px, py)) return tap(ctx.cmd.tapHorn(w), 'horn');
    if (w.agents.some(a => a.state === 'atGate') && inGate(px, py)) return tap(ctx.cmd.stamp(w), 'stamp');
    const cr = pickR(TAP_TILES);
    for (const r of w.rooms) {
      if (r.type !== 'workshop' || r.stack <= 0) continue;
      const s = crateSpot(r);
      if (Math.hypot(tx - s.x, ty - (s.y - 0.35)) <= cr) return tap(ctx.cmd.tapCrates(w, r.id), 'tap');
    }
    const esc = agentAt(tx, ty, cr, a => a.state === 'escaping');
    if (esc) return tap(ctx.cmd.tapEscapee(w, esc.id), 'tap');
    const brawl = agentAt(tx, ty, cr, a => a.state === 'brawling');
    if (brawl) return tap(ctx.cmd.tapRangler(w, brawl.id), 'tap');
    const a = agentAt(tx, ty, pickR(PICK_TILES), selectable);
    if (a) { ctx.selection.set({ kind: 'agent', id: a.id }); lastClick = { t: 0, room: 0 }; return; }
    const r = roomAt(tx, ty);
    if (!r) { ctx.selection.set(null); lastClick = { t: 0, room: 0 }; return; }
    const now = performance.now();
    if (lastClick.room === r.id && now - lastClick.t < DOUBLE_MS) { ctx.focusTile(r.x + r.w / 2, r.y + r.h / 2); lastClick = { t: 0, room: 0 }; }
    else lastClick = { t: now, room: r.id };
    ctx.selection.set({ kind: 'room', id: r.id });
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);

  // ------------------------------------------------------------------ hotkeys
  const modalOpen = () => [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
  const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLInputElement);
  function onKey(e: KeyboardEvent) {
    if (e.code === 'Space') space = true;
    if (e.key === 'Shift') shiftHeld = true;
    if (typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (modalOpen()) { if (k === 'escape') ctx.closeModal(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (e.repeat) return;
      const res = ctx.cmd.undo(w);
      if (res.ok) { ctx.sound('demolish'); evals.clear(); ctx.toast(t('tools.undone', { n: ctx.fmt(-(res.cost ?? 0)) }), { kind: 'good', ms: 1800 }); }
      else fail(res);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'escape') { escape(); return; }
    if (e.repeat) return;
    switch (k) {
      case 'b': ctx.menu.set(ctx.menu.get() === 'rooms' ? null : 'rooms'); break;
      case 'h': ctx.openModal('help'); break;
      case 'o': {
        showRadius = !showRadius; dirtyPixi = true;
        const any = w.rooms.some(r => r.type === 'guard');
        ctx.toast(t(!showRadius ? 'tools.radiusOff' : any ? 'tools.radiusOn' : 'tools.radiusNone'), { kind: 'info', ms: 1600 });
        break;
      }
      case 'delete': ctx.tool.set(tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' }); break;
      case 'p': ctx.setPaused(!ctx.paused()); break;
      case '1': case '2': case '3': {
        const n = Number(k);
        if (n === 3 && !w.unlocked.speed3) { ctx.feedback(ctx.cmd.setSpeed(w, 3)); break; }
        ctx.setPaused(false);
        const res = ctx.cmd.setSpeed(w, n);
        if (!res.ok) ctx.feedback(res);
        break;
      }
      default: return;
    }
    e.preventDefault();
  }
  function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') space = false; if (e.key === 'Shift') shiftHeld = false; }
  function escape() {
    if (edge) { edge = null; syncOwn(); }
    else if (bubbleRoom) bubbleRoom = 0;
    else if (tool.kind !== 'none') ctx.tool.set({ kind: 'none' });
    else if (ctx.menu.get()) ctx.menu.set(null);
    else ctx.selection.set(null);
    dirtyPixi = true; urgent = true;
  }
  const onBlur = () => { space = false; shiftHeld = false; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ------------------------------------------------------------------ stores
  const offTool = ctx.tool.on(v => {
    tool = v; dragging = false; pending = null; edge = null; bubbleRoom = 0; hoverRoom = 0; rect = null; press = null;
    if (v.kind === 'build') {
      if (touchy()) pending = nearestSpot(v.type, tileOf({ x: cam.x, y: cam.y }));
      else { const hw = hoverWorld(); if (hw) rect = centred(v.type, tileOf(hw)); }
      rect = pending ?? rect;
    }
    syncOwn(); dirtyPixi = true; urgent = true;
  });
  const offSel = ctx.selection.on(() => { if (edge) { edge = null; syncOwn(); } dirtyPixi = true; urgent = true; });
  syncOwn();

  // ------------------------------------------------------------------ Pixi overlays
  const lines: Line[] = [];
  const stacks: CrateStack[] = [];
  const centres: { x: number; y: number; ghost?: boolean }[] = [];
  /** the rectangle + evaluation currently previewed (build ghost or edge drag) */
  function preview(): { r: Rect; type: RoomType; e: Eval; ignore: number; cost: number; room?: Room } | null {
    if (edge) {
      const room = roomById(w, edge.id); if (!room) return null;
      const e = evalFor(room.type, edge.cur, room.id);
      const cost = Math.max(0, ROOMS[room.type].perTile * (edge.cur.w * edge.cur.h - room.w * room.h));
      return { r: edge.cur, type: room.type, e, ignore: room.id, cost, room };
    }
    if (tool.kind !== 'build' || !rect) return null;
    return { r: rect, type: tool.type, e: evalFor(tool.type, rect, 0), ignore: 0, cost: roomCost(tool.type, rect.w, rect.h) };
  }
  const reasonOf = (pv: NonNullable<ReturnType<typeof preview>>): Reason => (pv.e.reason !== 'ok' ? pv.e.reason : pv.cost > w.coins ? 'coins' : 'ok');

  function drawPixi() {
    const pv = preview();
    const reason = pv ? reasonOf(pv) : 'ok';
    const unchangedEdge = !!edge && sameRect(edge.cur, edge.orig);
    layer.setGhost(pv && !unchangedEdge ? pv.r : null, reason === 'ok', pv?.e.door ?? null);
    // frame: selection (gold) / demolish target (coral)
    const sel = ctx.selection.get();
    if (tool.kind === 'demolish') { const r = roomById(w, bubbleRoom || hoverRoom); layer.setFrame(r ? rectOf(r) : null, 'bad'); }
    else if (edge && !unchangedEdge) layer.setFrame(null);
    else if (sel?.kind === 'room' && tool.kind !== 'build') { const r = roomById(w, sel.id); layer.setFrame(r ? rectOf(r) : null, 'sel'); }
    else if (tool.kind === 'resize') { const r = roomById(w, tool.roomId); layer.setFrame(r ? rectOf(r) : null, 'sel'); }
    else layer.setFrame(null);
    // handles
    const hr = handleRoom();
    layer.setHandles(edge ? edge.cur : hr ? rectOf(hr) : null, edge ? edge.e : hoverEdge, Math.round(handleHalf() * 2) / 2);
    // adjacency / noise lines from the previewed door
    lines.length = 0;
    if (pv?.e.door) {
      const d = pv.e.door, x1 = (d.x + 0.5) * TILE, y1 = (d.y + 0.5) * TILE;
      for (const b of pv.e.bonuses) { const o = roomById(w, b.partner); if (o) lines.push({ x1, y1, x2: (o.door.x + 0.5) * TILE, y2: (o.door.y + 0.5) * TILE, good: true }); }
      for (const n of pv.e.noise) { const o = roomById(w, n.partner); if (o) lines.push({ x1: (pv.r.x + pv.r.w / 2) * TILE, y1: (pv.r.y + pv.r.h / 2) * TILE, x2: (o.x + o.w / 2) * TILE, y2: (o.y + o.h / 2) * TILE, good: false }); }
    }
    layer.setAdj(lines);
    // guard radius: toggled with O, always while placing / resizing a guard post
    centres.length = 0;
    const guardPv = pv && pv.type === 'guard';
    if (showRadius || guardPv) {
      for (const r of w.rooms) if (r.type === 'guard' && r.id !== pv?.ignore) centres.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      if (guardPv && pv) centres.push({ x: pv.r.x + pv.r.w / 2, y: pv.r.y + pv.r.h / 2, ghost: true });
    }
    layer.setRadius(centres, GUARD_RADIUS + (w.unlocked.projWhistle ? 2 : 0));
    // crate stacks
    stacks.length = 0;
    for (const r of w.rooms) if (r.type === 'workshop' && r.stack > 0 && stacks.length < 4) { const s = crateSpot(r); stacks.push({ x: s.x, y: s.y, n: Math.ceil(r.stack) }); }
    layer.setCrates(stacks);
  }

  function updateRing(dt: number) {
    const sel = ctx.selection.get();
    let a: Agent | undefined;
    if (sel?.kind === 'agent') for (const x of w.agents) if (x.id === sel.id) { a = x; break; }
    if (!a || (a.flags & AF.offDuty)) { layer.setRing(0, 0, false); ringId = 0; return; }
    const tx = a.x * TILE, ty = a.y * TILE;
    if (ringId !== a.id || Math.hypot(tx - ringX, ty - ringY) > TILE * 2) { ringX = tx; ringY = ty; ringId = a.id; }
    else { const k = Math.min(1, dt * 14); ringX += (tx - ringX) * k; ringY += (ty - ringY) * k; }
    layer.setRing(ringX, ringY, true);
  }

  // ------------------------------------------------------------------ DOM
  const fmtVal = (kind: string, v: number) => {
    const sign = v < 0 ? '−' : '+', abs = Math.abs(v);
    if (kind === 'mood') return `${sign}${abs}`;
    return `${sign}${Math.round(abs * 100)}${ctx.lang() === 'de' ? ' %' : '%'}`;
  };
  const place = (el: HTMLElement, x: number, y: number) => put(el, '~transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  const box = (el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight });
  const view = () => ({ w: window.innerWidth, h: window.innerHeight, top: cam.inset.top + 4, bottom: window.innerHeight - cam.inset.bottom - 4 });

  const labelBox = { x: 0, y: 0, w: 0, h: 0 };
  function renderLabel(pv: ReturnType<typeof preview>) {
    const show = !!pv && (!!edge || dragging || !!pending || (lastPointer !== 'touch' && !!hover));
    put(label, 'hidden', show ? '0' : '1');
    if (!show || !pv) return;
    const { r, type, e } = pv;
    const reason = reasonOf(pv);
    put(lIcon, 'src', ctx.icon(ROOM_ICON[type] ?? 'rooms'));
    put(lName, 'text', t(`room.${type}`));
    const o = pv.room;
    put(lSize, 'text', o && !sameRect(rectOf(o), r) ? `${o.w}×${o.h} → ${r.w}×${r.h}` : `${r.w}×${r.h}`);
    put(lPriceN, 'text', (o ? '+' : '') + ctx.fmt(pv.cost));
    put(lPrice, '.bad', pv.cost > w.coins ? '1' : '0');
    if (type === 'guard') { put(lCapIc, 'src', ctx.icon('staff')); put(lCapN, 'text', t('tools.capGuard', { n: GUARD_RADIUS + (w.unlocked.projWhistle ? 2 : 0) })); }
    else {
      put(lCapIc, 'src', ctx.icon(ROOM_ICON[type] ?? 'rooms'));
      put(lCapN, 'text', t(`tools.cap.${type}`, { n: o && o.slots.length !== e.cap ? `${o.slots.length} → ${e.cap}` : e.cap }));
    }
    // lines: reason, bonuses (one per kind), noise, shrink note
    let i = 0;
    const line = (icon: string, text: string, cls: string) => {
      if (i >= lLines.length) return;
      const L = lLines[i++];
      put(L.row, 'hidden', '0'); put(L.ic, 'src', icon); put(L.tx, 'text', text); put(L.row, 'class', `tl-row tl-line ${cls}`);
    };
    if (reason !== 'ok') line(reasonIcon(ctx, reason), reasonText(reason), 'bad');
    const seen = new Set<string>();
    for (const b of e.bonuses) {
      if (seen.has(b.kind)) continue; seen.add(b.kind);
      const p = roomById(w, b.partner);
      line(ICON.up, t(`tools.adj.${b.kind}`, { room: p ? t(`room.${p.type}`) : '', v: fmtVal(b.kind, b.value) }), 'good');
    }
    const seenN = new Set<number>();
    for (const n of e.noise) {
      const p = roomById(w, n.partner); if (!p || seenN.has(p.type === 'bunk' ? 1 : p.type === 'workshop' ? 2 : 3)) continue;
      seenN.add(p.type === 'bunk' ? 1 : p.type === 'workshop' ? 2 : 3);
      line(ICON.down, t(n.bunkIsTrial ? 'tools.noise.bunk' : 'tools.noise.src', { room: t(`room.${p.type}`), v: fmtVal('noise', LAYOUT.noiseEnergyMult - 1) }), 'bad');
    }
    if (o && r.w * r.h < o.w * o.h) line(ICON.down, t('tools.noRefund'), 'note');
    for (; i < lLines.length; i++) put(lLines[i].row, 'hidden', '1');
    // position: right of the rectangle, else left; clamped into the play area
    const v = view(), b = box(label);
    const tl = cam.worldToScreen(r.x * TILE, r.y * TILE), br = cam.worldToScreen((r.x + r.w) * TILE, (r.y + r.h) * TILE);
    let x = br.x + 10;
    if (x + b.w > v.w - 6) x = tl.x - 10 - b.w;
    if (x < 6) x = clamp(br.x - b.w, 6, v.w - b.w - 6);
    const y = clamp(tl.y, v.top, Math.max(v.top, v.bottom - b.h));
    place(label, x, y);
    labelBox.x = x; labelBox.y = y; labelBox.w = b.w; labelBox.h = b.h;
  }

  function renderConfirm() {
    const show = !!pending && tool.kind === 'build' && !dragging;
    put(confirm, 'hidden', show ? '0' : '1');
    if (!show || !pending || tool.kind !== 'build') return;
    const e = evalFor(tool.type, pending, 0), cost = roomCost(tool.type, pending.w, pending.h);
    const ok = e.reason === 'ok' && cost <= w.coins;
    put(yes, '.off', ok ? '0' : '1');
    put(yes, 'aria-label', `${t('build.confirm')}: ${t(`room.${tool.type}`)} ${pending.w}×${pending.h}, ${ctx.fmt(cost)}`);
    put(no, 'aria-label', t('build.cancel'));
    const v = view(), b = box(confirm);
    const tl = cam.worldToScreen(pending.x * TILE, pending.y * TILE), br = cam.worldToScreen((pending.x + pending.w) * TILE, (pending.y + pending.h) * TILE);
    let x = clamp((tl.x + br.x) / 2 - b.w / 2, 6, v.w - b.w - 6);
    let y = br.y + 10;
    if (y + b.h > v.bottom) y = tl.y - 10 - b.h;
    y = clamp(y, v.top, Math.max(v.top, v.bottom - b.h));
    // never under the cursor label: slide left of it
    const L = labelBox;
    if (!label.hidden && x < L.x + L.w + 6 && x + b.w > L.x - 6 && y < L.y + L.h + 6 && y + b.h > L.y - 6) x = Math.max(6, L.x - b.w - 10);
    place(confirm, x, y);
  }

  function renderBubble() {
    const r = bubbleRoom ? roomById(w, bubbleRoom) : undefined;
    if (bubbleRoom && !r) bubbleRoom = 0;
    put(bubble, 'hidden', r ? '0' : '1');
    if (!r) return;
    const name = t(`room.${r.type}`);
    const fixed = !isWalled(r) || FIXED.has(r.type), last = !fixed && isLastOfType(r);
    put(bubble, '.locked', fixed || last ? '1' : '0');
    put(bubble, 'aria-label', t('tools.demolishQ', { room: name }));
    if (fixed || last) {
      put(bQ, 'text', name);
      put(bIc, 'src', ICON.lock);
      put(bN, 'text', '');
      put(bNote, 'text', t(fixed ? 'tools.fixed' : 'tools.reason.lastOfType'));
      put(bYes, 'hidden', '1');
    } else {
      const rf = refundOf(r);
      put(bQ, 'text', t('tools.demolishQ', { room: name }));
      put(bIc, 'src', ctx.icon('coin'));
      put(bN, 'text', `+${ctx.fmt(rf.n)}`);
      put(bNote, 'text', t(rf.full ? 'tools.refundFull' : 'tools.refundHalf'));
      put(bYes, 'hidden', '0');
      put(bYesT, 'text', t('build.demolish'));
      put(bYes, 'aria-label', `${t('build.demolish')}: ${name}, +${ctx.fmt(rf.n)}`);
    }
    put(bNo, 'aria-label', t('build.cancel'));
    const v = view(), b = box(bubble);
    const top = cam.worldToScreen((r.x + r.w / 2) * TILE, r.y * TILE), bot = cam.worldToScreen((r.x + r.w / 2) * TILE, (r.y + r.h) * TILE);
    let y = top.y - 12 - b.h;
    if (y < v.top) y = bot.y + 12;
    place(bubble, clamp(top.x - b.w / 2, 6, v.w - b.w - 6), clamp(y, v.top, Math.max(v.top, v.bottom - b.h)));
  }

  function renderChip() {
    const show = tool.kind !== 'none';
    put(chip, 'hidden', show ? '0' : '1');
    if (!show) return;
    const tch = lastPointer === 'touch';
    if (tool.kind === 'build') {
      put(cIc, 'src', ctx.icon(ROOM_ICON[tool.type] ?? 'rooms'));
      put(cTx, 'text', `${t(`room.${tool.type}`)} · ${t(tch ? 'tools.hint.buildTouch' : 'tools.hint.build')}`);
    } else if (tool.kind === 'demolish') {
      put(cIc, 'src', ctx.icon('demolish'));
      put(cTx, 'text', `${t('build.demolish')} · ${t(tch ? 'tools.hint.demolishTouch' : 'tools.hint.demolish')}`);
    } else if (tool.kind === 'resize') {
      const r = roomById(w, tool.roomId);
      put(cIc, 'src', ctx.icon(r ? ROOM_ICON[r.type] ?? 'rooms' : 'rooms'));
      put(cTx, 'text', t('tools.hint.resize'));
    }
    put(cX, 'aria-label', t('build.cancel'));
    put(chip, '~bottom', `${Math.round(cam.inset.bottom + 8)}px`);
  }

  function renderDom() {
    // cursor feedback on the canvas (memoised)
    const ed = edge ? edge.e : hoverEdge;
    put(canvas, '~cursor', ed ? (ed === 'N' || ed === 'S' ? 'ns-resize' : 'ew-resize') : tool.kind === 'build' ? 'crosshair' : tool.kind === 'demolish' ? 'pointer' : 'default');
    const pv = preview();
    renderLabel(pv);
    renderConfirm();
    renderBubble();
    renderChip();
  }

  return {
    update(dt: number) {
      // language switch → all texts are recomputed (memo writes only what changed)
      const lang = ctx.lang();
      if (lang !== lastLang) { lastLang = lang; urgent = true; }
      if (w.cache.version !== lastVersion) { lastVersion = w.cache.version; evals.clear(); dirtyPixi = true; urgent = true; }
      if (Math.abs(cam.zoom - lastZoom) > 0.01) { lastZoom = cam.zoom; dirtyPixi = true; }
      // the camera moved under a resting mouse: the hover ghost follows the tile under the cursor
      const ck = cam.x * 31 + cam.y * 17 + cam.zoom * 1e5;
      if (ck !== camKey) {
        camKey = ck;
        if (tool.kind === 'build' && !dragging && !pending && hover) { const hw = hoverWorld(); if (hw) { const g = centred(tool.type, tileOf(hw)); if (!sameRect(g, rect)) { rect = g; dirtyPixi = true; } } }
        if (tool.kind !== 'none' || bubbleRoom || pending || edge) urgent = true;   // overlays follow the camera
      }
      // a selected room that vanished drops its edge drag
      if (edge && !roomById(w, edge.id)) { edge = null; syncOwn(); }
      pixiAcc += dt;
      if (pixiAcc >= 0.25) { pixiAcc = 0; dirtyPixi = true; }   // sim-driven bits: crate stacks, guard posts, coins
      if (dirtyPixi) { dirtyPixi = false; drawPixi(); }
      updateRing(dt);
      acc += dt * 1000;
      if (acc >= WRITE_MS && (urgent || tool.kind !== 'none' || bubbleRoom || pending || edge)) { acc = 0; urgent = false; renderDom(); }
    },
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      offTool(); offSel();
      ctx.input.ownsPointer = false;
      layer.destroy();
      wrap.remove();
    },
  };
}
