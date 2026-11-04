/** Building rules (Brief §3.4–3.7, §6.4): validate, build, resize, door, upgrade/milestones, demolish/undo. */
import { ROOMS, roomCost, upCost, bulkCost, UPGRADE, RUF, type RoomType } from '../content/balance';
import { Ground } from '../content/site1';
import { type World, type Room, type Side, type PlaceReason, type CommandResult, UNREACHABLE } from './types';
import { idx, components, distanceField } from './pathfield';
import { bestDoor, packRoom, sizeOk } from './layout';
import { rebuild, makeRoom, roomById, isWalled, emit, spend, earn, addRuf, field } from './world';
import { releaseSlot, setState, teleportNear } from './agents';
import { PATH_Y, GATE_X } from '../content/site1';

const SIDES: Side[] = ['S', 'N', 'E', 'W'];

/** pure tile checks (no connectivity) */
export function tileReason(w: World, type: RoomType, x: number, y: number, ww: number, hh: number, ignoreId = 0): PlaceReason {
  if (!sizeOk(type, ww, hh)) return ww >= ROOMS[type].minW && hh >= ROOMS[type].minH ? 'tooLarge' : 'tooSmall';
  const g = w.grid;
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) {
    if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) return 'outside';
    const i = idx(xx, yy);
    if (!g.owned[i]) return 'outside';
    if (g.road[i]) return 'onRoad';
    if (g.fixed[i]) return 'overlap';
    const gr = g.ground[i];
    if (gr !== Ground.Grass && gr !== Ground.Path) return 'outside';
    const ri = g.roomAt[i];
    if (ri && w.rooms[ri - 1].id !== ignoreId) return 'overlap';
  }
  return 'ok';
}

/** choose the door side whose outside middle tile is closest to the main road */
export function chooseDoor(w: World, type: RoomType, x: number, y: number, ww: number, hh: number) {
  const road = roadField(w);
  const outsideOk = (dx: number, dy: number, side: Side) => {
    const ox = dx + (side === 'E' ? 1 : side === 'W' ? -1 : 0), oy = dy + (side === 'S' ? 1 : side === 'N' ? -1 : 0);
    if (ox < 0 || oy < 0 || ox >= w.grid.w || oy >= w.grid.h) return -1;
    const oi = idx(ox, oy);
    if (w.grid.roomAt[oi] || w.grid.blocked[oi] || w.grid.ground[oi] === Ground.Water || road[oi] === UNREACHABLE) return -1;
    return road[oi];
  };
  let best: { x: number; y: number; side: Side } | null = null, bd = Infinity;
  for (const side of SIDES) {
    const d = bestDoor(type, x, y, ww, hh, side, (dx, dy) => outsideOk(dx, dy, side) >= 0);
    const r = outsideOk(d.x, d.y, side);
    if (r < 0) continue;
    const cap = packRoom(type, ww, hh, d, 1, x, y).slots.length;
    const v = -cap * 1000 + r + (side === 'S' ? 0 : side === 'N' ? 2 : 4); // capacity first, then closeness to the road (prefer S, N)
    if (v < bd) { bd = v; best = d; }
  }
  return best;
}
function roadField(w: World): Uint16Array {
  let f = w.cache.fields.get('road');
  if (!f) {
    const t: number[] = [];
    for (let x = 1; x <= 17; x++) { t.push(idx(x, PATH_Y)); t.push(idx(x, PATH_Y + 1)); }
    f = distanceField(w.grid, t); w.cache.fields.set('road', f);
  }
  return f;
}

/** full validation incl. "does not block the dock↔gate path or another room's door" */
export function validatePlacement(w: World, type: RoomType, x: number, y: number, ww: number, hh: number, ignoreId = 0): { reason: PlaceReason; door?: { x: number; y: number; side: Side } } {
  const tr = tileReason(w, type, x, y, ww, hh, ignoreId);
  if (tr !== 'ok') return { reason: tr };
  const existing = ignoreId ? roomById(w, ignoreId) : undefined;
  const door = chooseDoor(w, type, x, y, ww, hh);
  if (!door) return { reason: 'blocksPath' };
  // trial placement
  const trial = makeRoom(w, type, x, y, ww, hh, door, true);
  w.nextId--; // trial id not kept
  const saved = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h, door: existing.door } : null;
  if (existing) w.rooms.splice(w.rooms.indexOf(existing), 1);
  w.rooms.push(trial);
  rebuild(w);
  const ok = connectivityOk(w);
  w.rooms.pop();
  if (existing && saved) { w.rooms.push(existing); w.rooms.sort((a, b) => a.id - b.id); }
  rebuild(w);
  return ok ? { reason: 'ok', door } : { reason: 'blocksPath' };
}

export function connectivityOk(w: World): boolean {
  const c = components(w.grid);
  const dock = c[idx(2, PATH_Y)];
  if (c[idx(GATE_X, PATH_Y + 1)] !== dock || c[idx(GATE_X, PATH_Y + 3)] !== dock) return false;
  for (const r of w.rooms) if (isWalled(r) && c[idx(r.door.x, r.door.y)] !== dock) return false;
  return true;
}

export function buildMs(ww: number, hh: number) { return Math.min(6000, 2000 + ww * hh * 120); }

export function build(w: World, type: RoomType, x: number, y: number, ww: number, hh: number): CommandResult & { roomId?: number } {
  if (!w.unlocked[type]) return { ok: false, reason: 'locked' };
  const v = validatePlacement(w, type, x, y, ww, hh);
  if (v.reason !== 'ok') return { ok: false, reason: v.reason };
  const cost = roomCost(type, ww, hh);
  if (!spend(w, 'build', cost)) return { ok: false, reason: 'coins', cost };
  const r = makeRoom(w, type, x, y, ww, hh, v.door!, false);
  r.buildEndMs = w.rtMs + buildMs(ww, hh);
  w.rooms.push(r);
  pushAgentsOut(w, r);
  rebuild(w);
  w.director.data.lastBuildId = r.id; w.director.data.lastBuildCost = cost; w.director.data.lastBuildMs = w.rtMs;
  emit(w, 'build', { roomId: r.id, rtype: type, cost });
  return { ok: true, cost, roomId: r.id };
}

/** agents standing on a new construction site are moved to the nearest free reachable tile (Brief §6.4) */
function pushAgentsOut(w: World, r: Room) {
  for (const a of w.agents) {
    if (a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h) {
      const nx = r.x + r.w / 2 > a.x ? r.x - 0.5 : r.x + r.w + 0.5;
      a.x = Math.max(0.5, Math.min(w.grid.w - 0.5, nx));
    }
  }
}

export function finishConstruction(w: World) {
  let changed = false;
  for (const r of w.rooms) if (!r.built && w.rtMs >= r.buildEndMs) {
    r.built = true; changed = true;
    emit(w, 'built', { roomId: r.id, rtype: r.type });
  }
  if (changed) rebuild(w);
}

/** edge drag: new rect, pay only the difference (Brief §6.4) */
export function resize(w: World, roomId: number, x: number, y: number, ww: number, hh: number): CommandResult {
  const r = roomById(w, roomId); if (!r || !isWalled(r)) return { ok: false, reason: 'noRoom' };
  const v = validatePlacement(w, r.type, x, y, ww, hh, r.id);
  if (v.reason !== 'ok') return { ok: false, reason: v.reason };
  const diff = Math.max(0, ROOMS[r.type].perTile * (ww * hh - r.w * r.h));
  if (!spend(w, 'build', diff)) return { ok: false, reason: 'coins', cost: diff };
  evictAll(w, r);
  Object.assign(r, { x, y, w: ww, h: hh, door: v.door! });
  repack(r);
  r.built = false; r.buildEndMs = w.rtMs + buildMs(ww, hh) * 0.6;
  pushAgentsOut(w, r);
  rebuild(w);
  emit(w, 'resize', { roomId: r.id, cost: diff });
  return { ok: true, cost: diff };
}

export function moveDoor(w: World, roomId: number, side: Side, offset: number): CommandResult {
  const r = roomById(w, roomId); if (!r || !isWalled(r)) return { ok: false, reason: 'noRoom' };
  const len = side === 'N' || side === 'S' ? r.w : r.h;
  const o = Math.max(0, Math.min(len - 1, offset));
  const door = { x: side === 'E' ? r.x + r.w - 1 : side === 'W' ? r.x : r.x + o, y: side === 'S' ? r.y + r.h - 1 : side === 'N' ? r.y : r.y + o, side };
  const old = r.door; r.door = door; repack(r); rebuild(w);
  if (!connectivityOk(w)) { r.door = old; repack(r); rebuild(w); return { ok: false, reason: 'blocksPath' }; }
  evictAll(w, r);
  return { ok: true };
}

function repack(r: Room) {
  const lay = packRoom(r.type, r.w, r.h, r.door, r.stage, r.x, r.y);
  r.slots = lay.slots; r.queue = lay.queue; r.furniture = lay.furniture; r.staffSpots = lay.staffSpots;
  r.slotUser = lay.slots.map(() => 0); r.queueUsers = [];
}
/** everyone using/queued/assigned to the room re-plans; beds are re-assigned by the ferry module */
function evictAll(w: World, r: Room) {
  for (const a of w.agents) {
    if (a.act?.roomId === r.id) { releaseSlot(w, a); a.act = null; if (a.state !== 'leaving' && a.state !== 'atGate' && a.state !== 'toGate') setState(w, a, 'idle'); }
    if (a.bed === r.id) { a.bed = 0; a.bedSlot = -1; }
  }
  reassignBeds(w);
}
export function reassignBeds(w: World) {
  const taken = new Set<string>();
  for (const a of w.agents) if (a.bed) taken.add(a.bed + ':' + a.bedSlot);
  const free: { id: number; s: number }[] = [];
  for (const r of w.rooms) if (r.type === 'bunk') r.slots.forEach((_, s) => { if (!taken.has(r.id + ':' + s)) free.push({ id: r.id, s }); });
  for (const a of w.agents) if ((a.kind === 'rascal' || a.kind === 'vip') && !a.bed && a.state !== 'waitingDock' && a.state !== 'leaving') {
    const f = free.shift();
    if (f) { a.bed = f.id; a.bedSlot = f.s; }
    else { a.state = 'waitingDock'; } // no bed anymore → back to the dock queue
  }
}

/** buy n levels (bulk, geometric sum); milestones double output, change the look, +5 Ruf */
export function upgrade(w: World, roomId: number, n: number): CommandResult {
  const r = roomById(w, roomId); if (!r) return { ok: false, reason: 'noRoom' };
  n = Math.min(n, UPGRADE.maxLevel - r.level);
  if (n <= 0) return { ok: false, reason: 'max' };
  const cost = bulkCost(r.type, r.level, n);
  if (!spend(w, 'upgrade', cost)) return { ok: false, reason: 'coins', cost };
  const before = r.level;
  r.level += n;
  emit(w, 'upgrade', { roomId, from: before, to: r.level, cost });
  for (const ms of UPGRADE.milestones) if (before < ms && r.level >= ms) {
    r.stage = UPGRADE.milestones.indexOf(ms) + 2 > 3 ? 3 : UPGRADE.milestones.indexOf(ms) + 2;
    if (isWalled(r)) { const keepUsers = r.slotUser.slice(); repack(r); r.slotUser = r.slots.map((_, i) => keepUsers[i] ?? 0); }
    addRuf(w, 'milestone', RUF.milestone);
    emit(w, 'milestone', { roomId, level: ms, stage: r.stage });
  }
  return { ok: true, cost };
}
export const nextUpCost = (r: Room) => upCost(r.type, r.level);

export function demolish(w: World, roomId: number): CommandResult {
  const r = roomById(w, roomId); if (!r || !isWalled(r)) return { ok: false, reason: 'noRoom' };
  if (w.rooms.filter(x => x.type === r.type).length <= 1 && (r.type === 'bunk' || r.type === 'canteen')) return { ok: false, reason: 'lastOfType' };
  const lastBuild = w.director.data.lastBuildId === r.id && (!r.built || w.rtMs - r.buildEndMs <= 10000);
  const base = roomCost(r.type, r.w, r.h);
  const refund = lastBuild ? (w.director.data.lastBuildCost ?? base) : base * 0.5;
  evictAll(w, r);
  for (const a of w.agents) if (a.kind === 'staff' && a.roomId === r.id) a.roomId = 0;
  w.rooms.splice(w.rooms.indexOf(r), 1);
  rebuild(w);
  reassignBeds(w);
  // anyone now standing inside walls/unreachable gets moved
  for (const a of w.agents) { const f = field(w, 'dockSell'); if (f[idx(Math.floor(a.x), Math.floor(a.y))] === UNREACHABLE) teleportNear(w, a); }
  earn(w, 'refund', refund);
  emit(w, 'demolish', { roomId, refund });
  return { ok: true, cost: -refund };
}

/** Ctrl+Z: only the last build, while under construction or ≤ 10 s after completion, 100 % refund */
export function undoLastBuild(w: World): CommandResult {
  const id = w.director.data.lastBuildId;
  const r = id ? roomById(w, id) : undefined;
  if (!r || (r.built && w.rtMs - r.buildEndMs > 10000)) return { ok: false, reason: 'tooLate' };
  const res = demolish(w, r.id);
  w.director.data.lastBuildId = 0;
  return res;
}
