/**
 * Balance bots (Brief §4.1): headless players that use the same command API as the UI.
 *  - casual: reaction 3–8 s, 30 % suboptimal purchases, follows the clipboard
 *  - optimal: reaction 1 s, ROI-driven
 *  - naive / random (H2): cheapest-first / random affordable
 * `layout`: 'good' places rooms near their partners, 'random' anywhere valid (H1b).
 */
import { newGame, tick, cmd } from '../src/sim/sim';
import type { World, Room } from '../src/sim/types';
import { roomsOf, starsOf } from '../src/sim/world';
import { validatePlacement } from '../src/sim/rooms';
import { OBJECTIVES, mandatoryDone } from '../src/sim/objectives';
import { totalBeds } from '../src/sim/ferry';
import { staffOf } from '../src/sim/staff';
import { rascals } from '../src/sim/agents';
import { flow } from '../src/sim/flow';
import { roomCost, upCost, ROOMS, PARCELS, STARS, type RoomType, type StaffRole } from '../src/content/balance';
import { TUTORIAL_WASH, PATH_Y } from '../src/content/site1';

export type Profile = 'casual' | 'optimal' | 'naive' | 'random';
export interface BotOpts { profile: Profile; seed?: number; layout?: 'good' | 'random'; minutes?: number; skipTutorial?: boolean }

export interface Milestone { key: string; rt: number }
export interface BotReport {
  profile: Profile; layout: string; seed: number;
  milestones: Record<string, number>;
  minutes: World['stats']['minute'];
  income: Record<string, number>; spend: Record<string, number>; rufBy: Record<string, number>;
  idleGaps: number[];      // seconds without affordable purchase or trackable objective
  newThings: number[];     // rt seconds of "something new" (unlock, built, milestone, event, hire)
  final: { coins: number; ruf: number; stars: number; released: number; rascals: number; beds: number; caught: number; escaped: number; teleports: number; inspectionAt: number };
  world: World;
}

class Rng { constructor(public s: number) {} next() { this.s = (this.s + 0x6d2b79f5) | 0; let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } }

/** per-tick bot brain; usable headless (runBot) and in the browser (?sim&bot=casual) */
export class BotDriver {
  rnd: Rng; nextActMs: number; ms: Record<string, number> = {}; newThings: number[] = []; idleGaps: number[] = [];
  private lastSeq = 0; private idleSince = -1; private layout: 'good' | 'random'; private pending: Record<string, number> = {};
  constructor(public w: World, public o: BotOpts) {
    this.rnd = new Rng((o.seed ?? 1) * 7919 + (o.profile === 'casual' ? 1 : 2));
    this.layout = o.layout ?? 'good';
    this.nextActMs = this.react();
  }
  react() { const p = this.o.profile; return p === 'optimal' ? 1000 : p === 'casual' ? 3000 + this.rnd.next() * 5000 : 2000; }
  mark(k: string) { if (this.ms[k] === undefined) this.ms[k] = Math.round(this.w.rtMs / 100) / 10; }
  /** call after every sim tick */
  step() {
    const w = this.w;
    if (w.eventSeq !== this.lastSeq) {
      const n = Math.min(w.events.length, w.eventSeq - this.lastSeq); this.lastSeq = w.eventSeq;
      for (const e of w.events.slice(w.events.length - n)) {
        const t = e.type;
        if (t === 'star') this.mark(`star${e.stars}`);
        if (t === 'release') { this.mark('release1'); if (w.stats.released === 4) this.mark('release4'); }
        if (t === 'tutorialDone') this.mark('tutorialDone');
        if (t === 'built') this.mark(`built:${e.rtype}`);
        if (t === 'milestone') this.mark(`milestone:${roomTypeOf(w, e.roomId as number)}${e.level}`);
        if (t === 'tunnel') this.mark('tunnel1');
        if (t === 'foodFight') this.mark('foodFight1');
        if (t === 'parcel') this.mark(`parcel${e.k}`);
        if (t === 'unlock') this.mark(`unlock:${e.what}`);
        if (t === 'objective') this.mark(`obj:${e.id}`);
        if (['unlock', 'built', 'milestone', 'tunnel', 'foodFight', 'hire', 'objective', 'star', 'release'].includes(t)) this.newThings.push(Math.round(w.rtMs / 1000));
      }
    }
    if (mandatoryDone(w)) this.mark('inspectionReady');
    reflexes(w, this.o.profile, this.rnd, this.pending);
    if (w.rtMs >= this.nextActMs) {
      const acted = decide(w, this.o.profile, this.rnd, this.layout, !!this.o.skipTutorial);
      this.nextActMs = w.rtMs + this.react();
      if (!acted && !anyAffordable(w)) { if (this.idleSince < 0) this.idleSince = w.rtMs; }
      else if (this.idleSince >= 0) { this.idleGaps.push((w.rtMs - this.idleSince) / 1000); this.idleSince = -1; }
    }
  }
}

export function runBot(o: BotOpts): BotReport {
  const seed = o.seed ?? 1;
  const w = newGame(seed, { debug: false });
  const bot = new BotDriver(w, o);
  const endMs = (o.minutes ?? 30) * 60000;
  while (w.rtMs < endMs) { tick(w); bot.step(); }
  const beds = totalBeds(w);
  const ms = bot.ms;
  return {
    profile: o.profile, layout: o.layout ?? 'good', seed, milestones: ms, minutes: w.stats.minute,
    income: { ...w.stats.income }, spend: { ...w.stats.spend }, rufBy: { ...w.stats.rufBy }, idleGaps: bot.idleGaps, newThings: bot.newThings,
    final: { coins: Math.round(w.coins), ruf: w.ruf, stars: starsOf(w.ruf), released: w.stats.released, rascals: rascals(w).length, beds, caught: w.stats.caught, escaped: w.stats.escaped, teleports: w.stats.teleports, inspectionAt: ms.inspectionReady ?? -1 },
    world: w,
  };
}
const roomTypeOf = (w: World, id: number) => w.rooms.find(r => r.id === id)?.type ?? '?';

// ------------------------------------------------------------------ reflexes
function reflexes(w: World, p: Profile, rnd: Rng, pending: Record<string, number>) {
  const delay = (key: string, ms: number) => { if (pending[key] === undefined) pending[key] = w.rtMs + ms; return w.rtMs >= pending[key]; };
  const clear = (key: string) => { delete pending[key]; };
  const rt = p === 'optimal' ? 600 : p === 'casual' ? 1800 + rnd.next() * 2500 : 1500;
  if (w.ferry.state === 'arriving') { if (delay('horn', rt)) { cmd.tapHorn(w); clear('horn'); } } else clear('horn');
  for (const a of w.agents) {
    if (a.state === 'escaping') {
      const key = 'esc' + a.id;
      // the first (scripted) tunnel has a pointer hint → casual reacts within 2–4 s; later 2.2–8.2 s (may miss)
      const first = w.stats.caught + w.stats.escaped === 0;
      if (delay(key, p === 'optimal' ? 900 : first ? 2000 + rnd.next() * 2000 : 2200 + rnd.next() * 6000)) { cmd.tapEscapee(w, a.id); clear(key); }
    }
    if (a.state === 'brawling') { const key = 'br' + a.id; if (delay(key, p === 'optimal' ? 700 : 1500 + rnd.next() * 3500)) { cmd.tapRangler(w, a.id); clear(key); } }
  }
  if (w.agents.some(a => a.state === 'atGate') && w.tutorial.active) { if (delay('stamp', rt)) { cmd.stamp(w); clear('stamp'); } }
  // crate taps until the logistics supervisor exists (casual taps when it notices ≥ 3)
  if (!w.unlocked.supLogistics) for (const r of roomsOf(w, 'workshop')) {
    const thr = p === 'optimal' ? 2 : 3;
    if (r.stack >= thr && w.cart.state === 'depot') { const key = 'cr' + r.id; if (delay(key, rt)) { cmd.tapCrates(w, r.id); clear(key); } }
  }
}

// ------------------------------------------------------------------ deliberate decisions
function decide(w: World, p: Profile, rnd: Rng, layout: 'good' | 'random', skip: boolean): boolean {
  if (w.tutorial.active) {
    if (skip) { cmd.skipTutorial(w); return true; }
    // humans read the bubble and find the pointer: wait in each step (casual 5–9 s, optimal 2 s)
    const key = 'tut' + w.tutorial.step;
    const need = p === 'optimal' ? 3500 + rnd.next() * 1000 : 5000 + rnd.next() * 4000;
    const since = (w as unknown as { __tutSince?: Record<string, number> }).__tutSince ??= {};
    since[key] ??= w.rtMs;
    if (w.rtMs - since[key] < need) return false;
    const st = w.tutorial.step;
    if (st === 1 && !roomsOf(w, 'wash').length) return cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h).ok;
    if (st === 3) return cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, 1).ok;
    return false;
  }
  // the first drag-build after the tutorial: the gesture is shown once, players need a moment (casual 15–30 s, optimal 8 s)
  const td = w.director.data.tutorialEndMs ?? 0;
  const learn = p === 'optimal' ? 8000 : 15000 + (rnd.next() * 15000);
  if (!roomsOf(w, 'workshop').length && w.rtMs - td < learn) return false;
  if (w.coins < 60 && !w.loan.open && cheapestNeeded(w) > w.coins + 200 && w.rtMs > 600000) { cmd.loan(w); }
  const options = candidates(w, p, layout, rnd);
  const affordable = options.filter(c => c.cost <= w.coins);
  if (!affordable.length) return false;
  let pick = affordable[0];
  if (p === 'casual' && rnd.next() < 0.3) pick = affordable[Math.floor(rnd.next() * affordable.length)];
  if (p === 'naive') pick = affordable.slice().sort((a, b) => a.cost - b.cost)[0];
  if (p === 'random') pick = affordable[Math.floor(rnd.next() * affordable.length)];
  return pick.run();
}

interface Cand { label: string; cost: number; prio: number; run: () => boolean }

function candidates(w: World, p: Profile, layout: 'good' | 'random', rnd: Rng): Cand[] {
  const out: Cand[] = [];
  const add = (label: string, cost: number, prio: number, run: () => boolean) => out.push({ label, cost, prio, run });
  const cur = OBJECTIVES[w.obj.current];
  const built = (t: RoomType) => roomsOf(w, t).filter(r => r.built);
  const hireIf = (role: StaffRole, need: boolean, prio: number) => { if (need) add('hire ' + role, 60, prio, () => cmd.hire(w, role).ok); };
  const want: RoomType[] = [];
  // objective-driven builds
  if (cur?.id === 'workshop' && !roomsOf(w, 'workshop').length) want.push('workshop');
  if (cur?.id === 'classroom' && !roomsOf(w, 'classroom').length) want.push('classroom');
  if (w.unlocked.guard && !roomsOf(w, 'guard').length && (cur?.id === 'guard' || (p === 'optimal' && roomsOf(w, 'classroom').length > 0))) want.push('guard');
  if (w.unlocked.yard && !roomsOf(w, 'yard').length) want.push('yard');
  for (const t of want) {
    const size = { workshop: [4, 4], classroom: [4, 4], guard: [2, 2], yard: [5, 5] }[t as 'workshop'] ?? [ROOMS[t].minW, ROOMS[t].minH];
    const fallback = [ROOMS[t].minW, ROOMS[t].minH];
    add('build ' + t, roomCost(t, size[0], size[1]), 100, () => placeAndBuild(w, t, size[0], size[1], layout, rnd) || placeAndBuild(w, t, fallback[0], fallback[1], layout, rnd));
  }
  // staffing
  for (const r of built('workshop')) hireIf('foreman', staffOf(w, 'foreman').filter(s => s.roomId === r.id).length * 4 < Math.min(r.slots.length, 4), 95);
  for (const r of built('classroom')) hireIf('teacher', !staffOf(w, 'teacher').some(s => s.roomId === r.id), 98);
  if (built('guard').length) hireIf('guard', staffOf(w, 'guard').length < built('guard').length, 90);
  const residents = rascals(w).filter(a => a.bed).length;
  hireIf('cook', staffOf(w, 'cook').length * 8 < Math.min(residents, roomsOf(w, 'canteen').reduce((s, r) => s + r.slots.length, 0)), 85);
  if (w.tutorial.done && built('wash').length && staffOf(w, 'janitor').length < Math.floor(w.rooms.length / 5) && w.rtMs > 480000) hireIf('janitor', true, 50);
  // beds when the dock queue forms or the objective asks
  const waiting = rascals(w).filter(a => a.state === 'waitingDock').length;
  const beds = totalBeds(w);
  if ((waiting > 0 || cur?.id === 'beds12' || cur?.id === 'beds24') && w.rtMs > 300000) {
    const bunk = roomsOf(w, 'bunk')[0];
    if (bunk && bunk.h < 6) add('expand bunk', ROOMS.bunk.perTile * bunk.w * 3, 92, () => cmd.resize(w, bunk.id, bunk.x, bunk.y - 3, bunk.w, bunk.h + 3).ok || cmd.resize(w, bunk.id, bunk.x, bunk.y, bunk.w, bunk.h + 3).ok || placeAndBuild(w, 'bunk', 6, 3, layout, rnd));
    else add('build bunk', roomCost('bunk', 6, 6), 88, () => placeAndBuild(w, 'bunk', 6, 6, layout, rnd));
  }
  // parcels when space is needed: no room for another 6x3 bunk while rascals wait at the dock → save for land
  const noSpace = !hasSpot(w, 'bunk', 6, 3);
  for (let k = 1; k < PARCELS.length; k++) if (!w.parcels[k] && w.parcels[k - 1] && (k === 1 ? beds >= 12 && w.rtMs > 600000 : w.rtMs > 1100000)) add('parcel ' + k, PARCELS[k].price, noSpace && (waiting > 0 || cur?.id === 'beds24') ? 94 : 70 - k * 5, () => cmd.buyParcel(w, k).ok);
  // react to the Flow Bar's red stage (that is what it is for); casual notices it with some delay (reaction already applied)
  const fb = flow(w).bottleneck;
  const boost: Partial<Record<string, string>> = { meals: 'canteen', showers: 'wash', workshop: 'workshop', class: 'classroom', cart: 'dock', gate: 'gate' };
  const hot = fb ? boost[fb] : undefined;
  if (fb === 'meals' && staffOf(w, 'cook').length * 8 < roomsOf(w, 'canteen').reduce((s2, r) => s2 + r.slots.length, 0)) hireIf('cook', true, 97);
  // upgrades: core rooms by ROI-ish value
  const upgradable = w.rooms.filter(r => r.built && ['canteen', 'workshop', 'classroom', 'gate', 'dock', 'bunk', 'wash'].includes(r.type));
  for (const r of upgradable) {
    const c = upCost(r.type, r.level);
    let prio = 40;
    if (r.type === 'canteen' && (cur?.id === 'canteen5' || r.level < 5)) prio = cur?.id === 'canteen5' ? 96 : 45;
    if (r.type === 'workshop') prio = cur?.id === 'workshop15' ? 96 : 60;
    if (r.type === 'classroom') prio = 58;
    if (r.type === 'gate') prio = 52;
    if (r.type === 'dock' && w.cart.state !== 'depot' && roomsOf(w, 'workshop').some(x => x.stack >= 6)) prio = 75;
    // milestone pull
    if ([4, 14, 29].includes(r.level)) prio += 8;
    if (hot === r.type) prio = Math.max(prio, 93);
    add(`up ${r.type}${r.id}`, c, prio, () => cmd.upgrade(w, r.id, 1).ok);
  }
  out.sort((a, b) => b.prio - a.prio || a.cost - b.cost);
  // never spend the money reserved for the top objective build
  const top = out[0];
  if (top && top.prio >= 88 && top.cost > w.coins) return out.filter(c => c === top || (c.label.startsWith('hire') && w.coins - c.cost >= 0));
  void STARS;
  return out;
}

function anyAffordable(w: World) {
  return w.rooms.some(r => r.built && upCost(r.type, r.level) <= w.coins);
}
function cheapestNeeded(w: World) { return Math.min(...w.rooms.filter(r => r.built).map(r => upCost(r.type, r.level))); }

/** find a valid rectangle; 'good' = minimise door distance to the room's partner, 'random' = random valid spot */
export function placeAndBuild(w: World, t: RoomType, ww: number, hh: number, layout: 'good' | 'random', rnd: Rng): boolean {
  const spots: { x: number; y: number; score: number }[] = [];
  const partner = partnerOf(w, t);
  for (let y = 0; y < w.grid.h - hh; y++) for (let x = 0; x < w.grid.w - ww; x++) {
    // cheap pre-check on tiles
    let ok = true;
    for (let yy = y; yy < y + hh && ok; yy++) for (let xx = x; xx < x + ww; xx++) { const i = yy * w.grid.w + xx; if (!w.grid.owned[i] || w.grid.fixed[i] || w.grid.roomAt[i] || w.grid.ground[i] < 2) { ok = false; break; } }
    if (!ok) continue;
    const cx = x + ww / 2, cy = y + hh / 2;
    const px = partner ? partner.x + partner.w / 2 : 9, py = partner ? partner.y + partner.h / 2 : PATH_Y;
    let score = Math.hypot(cx - px, cy - py) + Math.abs(cy - PATH_Y) * 0.3;
    if (t !== 'bunk') for (const b of roomsOf(w, 'bunk')) { // keep the zone above the bunk free for the edge-drag expansion
      if (x < b.x + b.w && x + ww > b.x && y + hh > b.y - 3 && y < b.y) score += 40;
    }
    if (t === 'workshop' || t === 'yard') { // noise: keep away from bunks
      for (const b of roomsOf(w, 'bunk')) { const gap = Math.max(b.x - (x + ww), x - (b.x + b.w), b.y - (y + hh), y - (b.y + b.h)); if (gap < 3) score += 20; }
    }
    // compact packing: reward edges that touch rooms, fixed structures or the parcel border (keeps big holes for later rooms)
    let touch = 0;
    for (let xx = x; xx < x + ww; xx++) { touch += blockedAt(w, xx, y - 1) + blockedAt(w, xx, y + hh); }
    for (let yy = y; yy < y + hh; yy++) { touch += blockedAt(w, x - 1, yy) + blockedAt(w, x + ww, yy); }
    score -= touch * 0.9;
    if (layout === 'random') score = rnd.next() * 100;
    spots.push({ x, y, score });
  }
  spots.sort((a, b) => a.score - b.score);
  for (const s of spots.slice(0, 40)) {
    if (validatePlacement(w, t, s.x, s.y, ww, hh).reason === 'ok') return cmd.build(w, t, s.x, s.y, ww, hh).ok;
  }
  return false;
}
function hasSpot(w: World, t: RoomType, ww: number, hh: number): boolean {
  for (let y = 0; y < w.grid.h - hh; y++) for (let x = 0; x < w.grid.w - ww; x++) {
    let ok = true;
    for (let yy = y; yy < y + hh && ok; yy++) for (let xx = x; xx < x + ww; xx++) { const i = yy * w.grid.w + xx; if (!w.grid.owned[i] || w.grid.fixed[i] || w.grid.roomAt[i] || w.grid.ground[i] < 2) { ok = false; break; } }
    if (ok && validatePlacement(w, t, x, y, ww, hh).reason === 'ok') return true;
  }
  return false;
}
function blockedAt(w: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.grid.w || y >= w.grid.h) return 1;
  const i = y * w.grid.w + x;
  return w.grid.roomAt[i] || w.grid.blocked[i] || !w.grid.owned[i] || (w.grid.fixed[i] && !w.grid.road[i]) ? 1 : 0;
}
function partnerOf(w: World, t: RoomType): Room | undefined {
  const map: Partial<Record<RoomType, RoomType>> = { wash: 'bunk', workshop: 'dock', yard: 'canteen', classroom: 'bunk', bunk: 'wash', guard: 'yard' };
  const p = map[t]; return p ? roomsOf(w, p)[0] : undefined;
}
export { tick };
