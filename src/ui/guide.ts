/**
 * Guided first builds (G2 feedback, docs/G2_FEEDBACK.md): pure helpers the onboarding layer (tutorial.ts), the clipboard
 * and the Rooms menu share. Read-only on the world – nothing here writes to the sim or draws from its RNG.
 *
 *  - buildGoal(w): the current clipboard goal when it asks for a room ("Build a Knitting Nook", "12 beds" …), with its
 *    price at the size the guide suggests and whether the player can afford it.
 *  - guideStep(w, ui): the ONE next action of the guided chain – Rooms button → goal card → drag at the suggested spot
 *    (touch: ✓) → Staff button → Hire – or null. It points only while the guide is on (first build goals, see GUIDED).
 *  - suggestSpot(w, type, ww, hh): a good, valid spot for a room (same idea as the casual bot's "good" layout: close to its
 *    partner room, packed against what is already there, the strip above the cells kept free for the edge drag).
 *  - savingsEta(w, cost): "~1 min" estimate from the income ring (offline.ts incomePerMin1x).
 */
import type { World, Room } from '../sim/types';
import { ROOMS, roomCost, upCost, STAFF_ROOM, type RoomType, type StaffRole } from '../content/balance';
import { currentGoal } from '../sim/objectives';
import { roomsOf } from '../sim/world';
import { tileReason, validatePlacement, priceBuild } from '../sim/rooms';
import { totalBeds } from '../sim/ferry';
import { staffOf, hireFee } from '../sim/staff';
import { incomePerMin1x } from '../sim/offline';
import { PATH_Y } from '../content/site1';

/** clipboard goals that ask for a room of this type */
export const GOAL_ROOM: Readonly<Record<string, RoomType>> = { wash: 'wash', workshop: 'workshop', classroom: 'classroom', guard: 'guard', beds12: 'bunk', yard: 'yard', beds24: 'bunk' };
/** the goals the guide points through step by step (Rooms → card → spot → staff); later ones only get the spot */
export const GUIDED: ReadonlySet<string> = new Set(['wash', 'workshop', 'classroom', 'guard', 'beds12']);
/** clipboard goals that ask for a room level: the guide points at the room, then at its upgrade button */
export const UPGRADE_GOAL: Readonly<Record<string, RoomType>> = { canteen5: 'canteen', workshop15: 'workshop' };
/** staff a freshly built room needs before it works (cook / janitor rooms work without a new hire at first) */
export const ROOM_STAFF: Partial<Record<RoomType, StaffRole>> = { workshop: 'foreman', classroom: 'teacher', guard: 'guard' };
export const minCost = (type: RoomType) => roomCost(type, ROOMS[type].minW, ROOMS[type].minH);

/** size the guide suggests for a goal room (beds: as many as are missing, 3 tiles per bed, rows of 3) */
export function goalSize(w: World, id: string, type: RoomType): { w: number; h: number } {
  const R = ROOMS[type];
  if (type !== 'bunk') return { w: R.minW, h: R.minH };
  const target = id === 'beds24' ? 24 : 12;
  const need = Math.max(3, target - totalBeds(w));
  const tiles = need * R.tilesPerSlot;
  return { w: Math.max(R.minW, Math.min(8, Math.ceil(tiles / 3))), h: 3 };
}

export interface BuildGoal { id: string; type: RoomType; size: { w: number; h: number }; cost: number; affordable: boolean; unlocked: boolean; guided: boolean; building: boolean }
/** the current goal when it is "build a room"; null otherwise (or when it is already being built) */
export function buildGoal(w: World): BuildGoal | null {
  const g = currentGoal(w);
  if (!g || g.kind !== 'objective') return null;
  const type = GOAL_ROOM[g.id];
  if (!type) return null;
  const size = goalSize(w, g.id, type);
  let cost = priceBuild(w, type, size.w, size.h);
  // can't afford the suggested bunk block yet → the smallest one still helps
  if (type === 'bunk' && w.coins < cost) { const m = priceBuild(w, type, ROOMS.bunk.minW, ROOMS.bunk.minH); if (w.coins >= m) { size.w = ROOMS.bunk.minW; size.h = ROOMS.bunk.minH; cost = m; } }
  const building = roomsOf(w, type).some(r => !r.built);
  return { id: g.id, type, size, cost, affordable: w.coins >= cost, unlocked: !!w.unlocked[type], guided: GUIDED.has(g.id), building };
}

/** a role a built room is still waiting for (the first one found, in build order) */
export function missingStaff(w: World): StaffRole | null {
  for (const r of w.rooms) {
    if (!r.built) continue;
    const role = ROOM_STAFF[r.type];
    if (role && staffOf(w, role).length === 0 && STAFF_ROOM[role] === r.type) return role;
  }
  return null;
}

export type GuideStep =
  | { kind: 'rooms'; type: RoomType }
  | { kind: 'card'; type: RoomType }
  | { kind: 'spot'; type: RoomType; x: number; y: number; w: number; h: number }
  | { kind: 'confirm'; type: RoomType }
  | { kind: 'staff'; role: StaffRole }
  | { kind: 'hire'; role: StaffRole }
  | { kind: 'room'; roomId: number; type: RoomType }
  | { kind: 'upgrade'; roomId: number; type: RoomType };
export interface GuideUi { menu: string | null; tool: { kind: string; type?: RoomType }; pending: boolean; spot: { x: number; y: number; w: number; h: number } | null; selRoom?: number }

/** "Canteen level 5": the room to upgrade (highest level of its type) when the next level is affordable */
export function upgradeGoal(w: World): { roomId: number; type: RoomType } | null {
  const g = currentGoal(w);
  if (!g || g.kind !== 'objective') return null;
  const type = UPGRADE_GOAL[g.id];
  if (!type) return null;
  const r = roomsOf(w, type).filter(x => x.built).sort((a, b) => b.level - a.level || a.id - b.id)[0];
  if (!r || w.coins < upCost(type, r.level)) return null;
  return { roomId: r.id, type };
}

/**
 * The single next action, or null. Staff first (a built Nook without a foreman knits at half speed, a Classroom without a
 * teacher teaches nobody), then the build chain for the current goal – only when it is affordable and unlocked.
 */
export function guideStep(w: World, ui: GuideUi): GuideStep | null {
  if (!w.tutorial.done) return null;
  const role = missingStaff(w);
  if (role && w.coins >= hireFee(role)) {
    if (ui.tool.kind === 'none') return ui.menu === 'staff' ? { kind: 'hire', role } : ui.menu === null ? { kind: 'staff', role } : null;
  }
  const g = buildGoal(w);
  if (!g) {
    const u = upgradeGoal(w);
    if (!u || ui.tool.kind !== 'none' || ui.menu !== null) return null;
    return ui.selRoom === u.roomId ? { kind: 'upgrade', ...u } : { kind: 'room', ...u };
  }
  if (g.building || !g.unlocked || !g.affordable) return null;
  if (ui.tool.kind === 'build') {
    if (ui.tool.type !== g.type) return null;
    if (ui.pending) return { kind: 'confirm', type: g.type };
    return ui.spot ? { kind: 'spot', type: g.type, ...ui.spot } : null;
  }
  if (!g.guided) return null;
  if (ui.tool.kind !== 'none') return null;
  if (ui.menu === 'rooms') return { kind: 'card', type: g.type };
  if (ui.menu === null) return { kind: 'rooms', type: g.type };
  return null;
}

// ------------------------------------------------------------------ spot finder
/** a throw-away copy for trial placements (validatePlacement rebuilds the grid) – same as tools.ts */
function sandbox(w: World): World {
  const g = w.grid;
  const grid = { ...g, ground: g.ground.slice(), owned: g.owned.slice(), roomAt: g.roomAt.slice(), wallE: g.wallE.slice(), wallS: g.wallS.slice(), blocked: g.blocked.slice(), fixed: g.fixed.slice(), road: g.road.slice() };
  return { ...w, grid, rooms: w.rooms.map(r => ({ ...r, links: r.links.slice() })), poi: { ...w.poi }, cache: { ...w.cache, fields: new Map(w.cache.fields), doorRes: new Int32Array(0) }, events: [], log: [] };
}
const PARTNER: Partial<Record<RoomType, RoomType>> = { wash: 'bunk', workshop: 'dock', yard: 'canteen', classroom: 'bunk', bunk: 'wash', guard: 'yard' };
function blockedAt(w: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.grid.w || y >= w.grid.h) return 1;
  const i = y * w.grid.w + x;
  return w.grid.roomAt[i] || w.grid.blocked[i] || !w.grid.owned[i] || (w.grid.fixed[i] && !w.grid.road[i]) ? 1 : 0;
}
/** best valid top-left corner for a ww×hh room of `type`, or null */
export function suggestSpot(w: World, type: RoomType, ww: number, hh: number): { x: number; y: number; w: number; h: number } | null {
  const pType = PARTNER[type];
  const partner: Room | undefined = pType ? roomsOf(w, pType)[0] : undefined;
  const px = partner ? partner.x + partner.w / 2 : 9, py = partner ? partner.y + partner.h / 2 : PATH_Y;
  const bunks = roomsOf(w, 'bunk');
  const cands: { x: number; y: number; s: number }[] = [];
  for (let y = 0; y + hh <= w.grid.h; y++) for (let x = 0; x + ww <= w.grid.w; x++) {
    if (tileReason(w, type, x, y, ww, hh) !== 'ok') continue;
    const cx = x + ww / 2, cy = y + hh / 2;
    let s = Math.hypot(cx - px, cy - py) + Math.abs(cy - PATH_Y) * 0.3;
    // keep the strip above the cells free for their edge drag, and noisy rooms away from beds
    if (type !== 'bunk') for (const b of bunks) if (x < b.x + b.w && x + ww > b.x && y + hh > b.y - 3 && y < b.y) s += 40;
    if (type === 'workshop' || type === 'yard') for (const b of bunks) { const gap = Math.max(b.x - (x + ww), x - (b.x + b.w), b.y - (y + hh), y - (b.y + b.h)); if (gap < 3) s += 20; }
    let touch = 0;
    for (let xx = x; xx < x + ww; xx++) touch += blockedAt(w, xx, y - 1) + blockedAt(w, xx, y + hh);
    for (let yy = y; yy < y + hh; yy++) touch += blockedAt(w, x - 1, yy) + blockedAt(w, x + ww, yy);
    s -= touch * 0.9;
    cands.push({ x, y, s });
  }
  cands.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
  if (!cands.length) return null;
  const sb = sandbox(w);
  for (const c of cands.slice(0, 24)) if (validatePlacement(sb, type, c.x, c.y, ww, hh).reason === 'ok') return { x: c.x, y: c.y, w: ww, h: hh };
  return null;
}

/** whole minutes (≥ 1) until `cost` is affordable at the current income, or null when there is no income yet */
export function savingsEta(w: World, cost: number): number | null {
  const short = cost - w.coins;
  if (short <= 0) return 0;
  const perMin = incomePerMin1x(w);
  if (!(perMin > 1)) return null;
  return Math.max(1, Math.ceil(short / perMin));
}
