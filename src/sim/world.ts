/** World creation, derived rebuilds (walls, room map, distance fields), event log, money & reputation. */
import { ECON, STARS, PARCELS, type RoomType } from '../content/balance';
import { buildGround, Ground, START_ROOMS, PATH_Y, GATE_X, GATE_Y, DOCK, OFFICE, DEPOT, BOOTH } from '../content/site1';
import { W, H, TICKS_PER_HOUR, type World, type Room, type Tile, type SimEvent, type Side } from './types';
import { LEAD_SLOT_STARS } from '../content/progress';
import { makeGrid, idx, distanceField, rebuildWalls, components } from './pathfield';
import { packRoom } from './layout';

export const EVENT_CAP = 512;

export function createWorld(seed = 1, opts: { firstSession?: boolean; debug?: boolean } = {}): World {
  const grid = makeGrid(W, H);
  grid.ground.set(buildGround());
  const w: World = {
    seed, rngState: seed | 0, t: 7 * TICKS_PER_HOUR, rtMs: 0, speed: 1, site: 1,
    coins: ECON.startCoins, ruf: 0, keys: 0,
    grid, parcels: PARCELS.map((_, i) => i === 0), rooms: [], agents: [], nextId: 1,
    ferry: { state: 'away', sinceMs: 0, aboard: 0, tapped: false, nextT: 7 * TICKS_PER_HOUR },
    cart: { state: 'depot', load: 0, roomId: 0, id: 0, sinceMs: 0, tapMs: {} },
    poi: {
      dockQueue: [{ x: 0.5, y: 20.5 }, { x: 0.5, y: 21.5 }, { x: 1.5, y: 21.6 }, { x: 2.5, y: 21.6 }, { x: 1.5, y: 20.4 }, { x: 2.5, y: 20.4 }],
      ferryBerth: { x: DOCK.x + 0.5, y: DOCK.y + 1.5 },
      gateQueue: [{ x: GATE_X + 0.5, y: PATH_Y + 1.5 }, { x: GATE_X + 1.5, y: PATH_Y + 1.5 }, { x: GATE_X + 0.5, y: PATH_Y + 0.5 }, { x: GATE_X + 1.5, y: PATH_Y + 0.5 }, { x: GATE_X - 0.5, y: PATH_Y + 1.5 }, { x: GATE_X - 0.5, y: PATH_Y + 0.5 }],
      gateOut: { x: GATE_X + 1, y: GATE_Y + 0.6 },
      roadExit: { x: GATE_X + 1, y: H - 1.5 },
      depot: { x: DEPOT.x + 1.6, y: DEPOT.y + 0.5 },
      dockSell: { x: DOCK.x + 1.5, y: DOCK.y + 0.5 },
      fenceEscape: [],
      officeDoor: { x: OFFICE.x + 1.5, y: OFFICE.y + OFFICE.h + 0.5 },
    },
    unlocked: { bunk: true, canteen: true, wash: true, gate: true, dock: true, office: true },
    unpaidUntilT: 0,
    loan: { amount: 0, open: false },
    firstSession: opts.firstSession ?? true,
    tutorial: { active: true, step: 0, skipped: false, done: false },
    director: { nextMs: 0, active: null, activeSinceMs: 0, data: {} },
    obj: { done: {}, current: 0 },
    log: [],
    stats: { income: {}, spend: {}, rufBy: {}, released: 0, arrived: 0, caught: 0, escaped: 0, cratesSold: 0, teleports: 0, unsolved: 0, horntaps: 0, cratetaps: 0, lifetimeCoins: 0, minute: [] },
    events: [], eventSeq: 0,
    cache: { fields: new Map(), version: 0, doorRes: new Int32Array(W * H), evCursor: 0 },
    debug: !!opts.debug,
    ...m5Defaults(1),
  };
  markFixed(w);
  applyParcels(w);
  for (const r of START_ROOMS) addRoomRaw(w, r.type, r.x, r.y, r.w, r.h, { x: r.door.x, y: r.y + r.h - 1, side: r.door.side }, true);
  addFixedRoom(w, 'gate', GATE_X, Math.floor(GATE_Y) - 1, 2, 2);
  addFixedRoom(w, 'dock', DOCK.x, DOCK.y, DOCK.w, DOCK.h);
  addFixedRoom(w, 'office', OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h);
  rebuild(w);
  return w;
}

type M5Keys = 'projects' | 'leads' | 'taps' | 'inspection' | 'prestige' | 'mail' | 'vip' | 'wall' | 'offline';
/**
 * Defaults of every M5 field (docs/M5_DESIGN.md §1.2). Used by createWorld and by the v1 → v2 save migration, so a
 * migrated M4 save and a fresh game have exactly the same shape. Per-site fields (projects, leads, inspection,
 * offline ring) are reset by a transfer; prestige, mail, vip, wall and taps survive it (prestige.ts).
 */
export function m5Defaults(site: number): Pick<World, M5Keys> {
  return {
    projects: { done: {}, running: null },
    leads: { slots: (LEAD_SLOT_STARS[site] ?? []).map(() => null), hiredMs: {} },
    taps: { horn: 0, crates: 0, hornTotal: 0, cratesTotal: 0 },
    inspection: { phase: 'idle', startMs: 0, walker: { x: 0, y: 0, dir: 'S', moving: false, wp: 0 }, route: [], retryDay: 0, hours: [], mark: { released: 0, escaped: 0, unsolved: 0, income: 0, wages: 0 }, last: null, best: 0, count: 0 },
    prestige: { perks: {}, lifetimeCoins: 0, completedSites: [], bestStars: [], transfers: 0, keysEarned: 0 },
    mail: { day: -1, tasks: [], streak: 0, daysCompleted: 0, seenDay: -1, visible: false, count: {} },
    vip: { phase: 'none', sessionEndMs: 0, sessionEndDay: 0, boardPermanent: false, arrivals: 0 },
    wall: { nowMs: 0, tzMin: 0, sessionStartMs: 0, sessions: 0 },
    offline: { ring: [], ringLife: 0, ringMs: 0, pending: null, collected: 0 },
  };
}

/** fixed structures: never buildable; office & booth are solid */
function markFixed(w: World) {
  const g = w.grid;
  const mark = (x0: number, y0: number, ww: number, hh: number, solid = false) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) if (x >= 0 && y >= 0 && x < W && y < H) { g.fixed[idx(x, y)] = 1; if (solid) g.blocked[idx(x, y)] = 1; }
  };
  mark(DOCK.x, DOCK.y, DOCK.w, DOCK.h);                       // dock
  mark(DEPOT.x, DEPOT.y, DEPOT.w, DEPOT.h);                   // cart depot (walkable)
  mark(OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h, true);         // office building (solid)
  mark(BOOTH.x, BOOTH.y, BOOTH.w, BOOTH.h, true);             // clerk booth (solid)
  // roads: walkable, never buildable
  for (let x = 1; x <= GATE_X + 1; x++) for (const y of [PATH_Y, PATH_Y + 1]) g.road[idx(x, y)] = 1;
  for (let y = PATH_Y; y < H; y++) for (let x = GATE_X; x <= GATE_X + 1; x++) g.road[idx(x, y)] = 1;
  for (let i = 0; i < W * H; i++) if (g.road[i]) g.fixed[i] = 1;
}

export function applyParcels(w: World) {
  const g = w.grid;
  g.owned.fill(0);
  PARCELS.forEach((p, k) => {
    if (!w.parcels[k]) return;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (x < W && y < H) g.owned[idx(x, y)] = 1;
  });
  computeFence(w);
}

/** escape targets: owned tiles on the border of the owned area that touch unowned land or map edge */
function computeFence(w: World) {
  const g = w.grid, out: Tile[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (!g.owned[i] || g.ground[i] === Ground.Water || g.fixed[i] || g.blocked[i] || g.roomAt[i]) continue;
    const edge = (x === W - 1 || y === 0 || y === H - 1) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && !g.owned[idx(nx, ny)] && g.ground[idx(nx, ny)] !== Ground.Water; });
    if (edge && (x + y) % 3 === 0) out.push({ x: x + 0.5, y: y + 0.5 });
  }
  w.poi.fenceEscape = out;
}

export function makeRoom(w: World, type: RoomType, x: number, y: number, ww: number, hh: number, door: { x: number; y: number; side: Side }, built: boolean): Room {
  const lay = packRoom(type, ww, hh, door, 1, x, y);
  return {
    id: w.nextId++, type, x, y, w: ww, h: hh, level: 1, stage: 1, door, links: [],
    slots: lay.slots, queue: lay.queue, furniture: lay.furniture, staffSpots: lay.staffSpots,
    slotUser: lay.slots.map(() => 0), queueUsers: [],
    built, buildEndMs: 0, clean: 100, stack: 0, blockedUntilMs: 0, reachable: true,
    usesToday: 0, moodSumToday: 0, walkTicksSum: 0, walkSamples: 0,
  };
}
export function addRoomRaw(w: World, type: RoomType, x: number, y: number, ww: number, hh: number, door: { x: number; y: number; side: Side }, built: boolean) {
  const r = makeRoom(w, type, x, y, ww, hh, door, built);
  w.rooms.push(r);
  return r;
}
function addFixedRoom(w: World, type: RoomType, x: number, y: number, ww: number, hh: number) {
  const r: Room = {
    id: w.nextId++, type, x, y, w: ww, h: hh, level: 1, stage: 1, door: { x, y, side: 'S' }, links: [],
    slots: [], queue: [], furniture: [], staffSpots: [], slotUser: [], queueUsers: [],
    built: true, buildEndMs: 0, clean: 100, stack: 0, blockedUntilMs: 0, reachable: true,
    usesToday: 0, moodSumToday: 0, walkTicksSum: 0, walkSamples: 0,
  };
  w.rooms.push(r);
  return r;
}
export const FIXED_TYPES: ReadonlySet<RoomType> = new Set<RoomType>(['gate', 'dock', 'office']);
export const isWalled = (r: Room) => !FIXED_TYPES.has(r.type);
export const roomById = (w: World, id: number) => w.rooms.find(r => r.id === id);
export const roomsOf = (w: World, type: RoomType) => w.rooms.filter(r => r.type === type);

/** recompute walls, room map, links between touching rooms, reachability; invalidates fields */
export function rebuild(w: World) {
  const g = w.grid;
  g.roomAt.fill(0);
  const walled = w.rooms.filter(isWalled);
  // links: touching rooms get a connecting door in the middle of the shared edge
  for (const r of walled) r.links = [];
  for (let a = 0; a < walled.length; a++) for (let b = a + 1; b < walled.length; b++) {
    const A = walled[a], B = walled[b];
    const link = sharedEdge(A, B);
    if (link) { A.links.push({ ...link.a, toRoom: B.id }); B.links.push({ ...link.b, toRoom: A.id }); }
  }
  w.rooms.forEach((r, k) => {
    if (!isWalled(r)) return;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g.roomAt[idx(x, y)] = k + 1;
  });
  rebuildWalls(g, walled.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, door: r.door, links: r.links })));
  // construction sites block entry
  for (const r of walled) {
    const v = r.built ? 0 : 1;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g.blocked[idx(x, y)] = v;
  }
  computeFence(w);           // escape targets never inside rooms (review finding)
  w.cache.fields.clear();
  w.cache.version++;
  const comp = components(g);
  const dockC = comp[idx(2, PATH_Y)];
  for (const r of w.rooms) r.reachable = !isWalled(r) || !r.built || comp[idx(r.door.x, r.door.y)] === dockC;
}

function sharedEdge(A: Room, B: Room): { a: { x: number; y: number; side: Side }; b: { x: number; y: number; side: Side } } | null {
  // vertical shared edge (A left of B or B left of A)
  const ov = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0, b0), Math.min(a1, b1)] as const;
  if (A.x + A.w === B.x || B.x + B.w === A.x) {
    const [y0, y1] = ov(A.y, A.y + A.h, B.y, B.y + B.h);
    if (y1 - y0 >= 1) {
      const y = y0 + Math.floor((y1 - y0 - 1) / 2);
      const left = A.x + A.w === B.x ? A : B, right = left === A ? B : A;
      const l = { x: left.x + left.w - 1, y, side: 'E' as Side }, r = { x: right.x, y, side: 'W' as Side };
      return left === A ? { a: l, b: r } : { a: r, b: l };
    }
  }
  if (A.y + A.h === B.y || B.y + B.h === A.y) {
    const [x0, x1] = ov(A.x, A.x + A.w, B.x, B.x + B.w);
    if (x1 - x0 >= 1) {
      const x = x0 + Math.floor((x1 - x0 - 1) / 2);
      const top = A.y + A.h === B.y ? A : B, bot = top === A ? B : A;
      const t = { x, y: top.y + top.h - 1, side: 'S' as Side }, b = { x, y: bot.y, side: 'N' as Side };
      return top === A ? { a: t, b } : { a: b, b: t };
    }
  }
  return null;
}

/** cached distance field to a key: '#<id>' (room door tile), 't:x,y' (tile), 'fence', or a POI name */
export function field(w: World, key: string): Uint16Array {
  let f = w.cache.fields.get(key);
  if (f) return f;
  const targets: number[] = [];
  if (key[0] === '#') {
    const r = roomById(w, Number(key.slice(1)));
    if (r) targets.push(idx(r.door.x, r.door.y));
  } else if (key.startsWith('t:')) {
    const [x, y] = key.slice(2).split(',').map(Number); targets.push(idx(x, y));
  } else if (key === 'fence') {
    for (const p of w.poi.fenceEscape) targets.push(idx(Math.floor(p.x), Math.floor(p.y)));
  } else {
    const p = (w.poi as unknown as Record<string, Tile>)[key];
    if (p && 'x' in p) targets.push(idx(Math.floor(p.x), Math.floor(p.y)));
  }
  f = distanceField(w.grid, targets);
  w.cache.fields.set(key, f);
  return f;
}

// ------------------------------------------------------------------ events, money, reputation
export function emit(w: World, type: string, data: Record<string, unknown> = {}) {
  const e: SimEvent = { t: w.t, rtMs: w.rtMs, ...data, type };
  w.events.push(e); w.eventSeq++;
  if (w.events.length > EVENT_CAP) w.events.splice(0, w.events.length - EVENT_CAP);
}
export function earn(w: World, kind: string, amount: number, at?: { x: number; y: number }) {
  if (!(amount > 0)) return;
  // loan repayment: 25 % of running income
  if (w.loan.open) {
    const pay = Math.min(w.loan.amount, amount * ECON.loanRepayShare);
    w.loan.amount -= pay; amount -= pay;
    if (w.loan.amount <= 0.0001) { w.loan.open = false; w.loan.amount = 0; emit(w, 'loanRepaid'); }
  }
  w.coins += amount;
  w.stats.income[kind] = (w.stats.income[kind] ?? 0) + amount;
  w.stats.lifetimeCoins += amount;
  emit(w, 'coins', { kind, amount, x: at?.x, y: at?.y });
}
export function spend(w: World, kind: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (amount > w.coins + 1e-9) return false;
  w.coins = Math.max(0, w.coins - amount);
  w.stats.spend[kind] = (w.stats.spend[kind] ?? 0) + amount;
  return true;
}
export const starsOf = (ruf: number) => STARS.filter(s => ruf >= s).length;
export function addRuf(w: World, kind: string, v: number) {
  const before = starsOf(w.ruf);
  w.ruf = Math.max(0, w.ruf + v);
  w.stats.rufBy[kind] = (w.stats.rufBy[kind] ?? 0) + v;
  emit(w, 'ruf', { kind, v });
  const after = starsOf(w.ruf);
  for (let s = before + 1; s <= after; s++) emit(w, 'star', { stars: s });
}
