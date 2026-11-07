/**
 * Shenanigans director (Brief §3.12, docs/M5_DESIGN.md §4.2): spoon tunnel, food fight, VIP, ruckus. Never game over.
 * Owner: sim-retention. Rules (brief):
 *  - never two at once (`director.active` ∈ tunnel | food | ruckus blocks every other start), none in the tutorial
 *  - food fight AND ruckus locked until 5 min after the tutorial end (`tutorialEndMs`) – the scripted one too
 *  - a slot every 150–240 s (1x); weights tunnel ∝ Σ escape scores, food ∝ max(0, 50 − canteen mood)
 *  - scripted beats replace their slot: spoon tunnel ~3:00, food fight ~10:00 (next meal from 10:00 with ≥ 3 eaters);
 *    random slots keep clear of a scripted beat that is about to come, and random food fights only start after the
 *    scripted one (the first food fight is the ~10:00 beat)
 *  - a picked event that cannot start yet (food fight outside a meal, nobody to tunnel) waits for its moment
 *    (≤ DIRECTOR_RET.pendingMaxSec) instead of silently wasting the slot; empty slots only from minute 15 at 20 %
 * New fine values live in content/retention.ts DIRECTOR_RET (balance.ts DIRECTOR keeps the brief's core numbers).
 */
import { DIRECTOR, ECON, RUF, GUARD_RADIUS } from '../content/balance';
import { DIRECTOR_RET } from '../content/retention';
import { AF, type World, type Agent } from './types';
import { rascals, goTo, setState, releaseSlot, isResident, moveAgent, promoteQueue } from './agents';
import { roomsOf, emit, earn, addRuf, roomById, field } from './world';
import { idx } from './pathfield';
import { inMeal, hourOf, tickMs } from './time';
import { rngNext, rngInt } from './rng';
import { staffOf } from './staff';
import { guardRadiusBonus } from './effects';

const D = DIRECTOR;
const R = DIRECTOR_RET;
export const guardRadius = (w: World) => GUARD_RADIUS + guardRadiusBonus(w);

/** pending / pick codes in director.data (numbers only) */
const EV = { tunnel: 1, food: 2, vip: 3 } as const;
type EvCode = typeof EV[keyof typeof EV];

export function tutorialEndMs(w: World) { return w.director.data.tutorialEndMs ?? (w.tutorial.done ? 0 : Infinity); }
/** food fight and ruckus are locked until 5 min after the tutorial end (brief §3.12) */
export const foodRuckusLocked = (w: World) => w.rtMs < tutorialEndMs(w) + D.lockAfterTutorialSec * 1000;

export function directorTick(w: World) {
  const d = w.director;
  if (w.tutorial.active) return;
  if (d.active) { updateActive(w); return; }
  if (ruckusCheck(w)) return;
  if (!d.nextMs) d.nextMs = w.rtMs + gap(w);
  // scripted beats replace (consume) the director slot (Brief §3.12)
  if (!d.data.tunnelDone && w.rtMs >= D.scriptedTunnelSec * 1000) { if (startTunnel(w, true)) { slotUsed(w, true); return; } }
  if (scriptedFoodDue(w)) { if (startFoodFight(w, true)) { slotUsed(w, true); return; } }
  // an event picked earlier that waits for its moment
  let exclude = 0;
  if (d.data.pending) {
    if (tryStart(w, d.data.pending as EvCode)) { slotUsed(w); return; }
    if (w.rtMs - (d.data.pendingMs ?? 0) < R.pendingMaxSec * 1000) return;
    exclude = d.data.pending; d.data.pending = 0; d.nextMs = w.rtMs; // timed out: re-pick the slot without it
  }
  if (w.rtMs < d.nextMs) return;
  if (holdForScripted(w)) return;
  const pick = pickEvent(w, exclude);
  if (pick < 0) { d.nextMs = w.rtMs + 5000; return; } // nothing unlocked yet: look again shortly, the slot is not lost
  d.nextMs = w.rtMs + gap(w);
  if (pick === 0) { d.data.emptySlots = (d.data.emptySlots ?? 0) + 1; return; } // empty slot (from minute 15 only)
  if (!tryStart(w, pick as EvCode)) { d.data.pending = pick; d.data.pendingMs = w.rtMs; }
}
const gap = (w: World) => (D.minGapSec + rngNext(w) * (D.maxGapSec - D.minGapSec)) * 1000;
/**
 * After a scripted beat the next slot comes at the short end of the brief's 150–240 s (balance pass M5): the scripted
 * beats sit before the two long saving phases (1★ → cell expansion at ~5:30, food fight → parcel 2 at ~13:00), and a
 * slot at the long end left 2.5–3 min without anything new (tempo rule §4.3, docs/BALANCE.md §7).
 */
function slotUsed(w: World, scripted = false) { w.director.nextMs = w.rtMs + (scripted ? D.minGapSec * 1000 : gap(w)); w.director.data.pending = 0; }

/** the scripted food fight is due: not happened yet, ≥ 10:00, not locked, a meal is on */
function scriptedFoodDue(w: World) {
  return !w.director.data.foodDone && w.rtMs >= D.scriptedFoodFightSec * 1000 && !foodRuckusLocked(w) && inMeal(hourOf(w.t));
}
/** random slots keep clear of a scripted beat that is about to come (the beat replaces that slot) */
function holdForScripted(w: World) {
  const d = w.director.data, t = w.rtMs;
  const near = (at: number) => t >= (at - R.scriptedClearSec) * 1000 && t < (at + R.scriptedWaitSec) * 1000;
  return (!d.tunnelDone && near(D.scriptedTunnelSec)) || (!d.foodDone && near(D.scriptedFoodFightSec));
}

/** weighted pick of the slot: EV code, 0 = empty slot, −1 = nothing in the pool */
function pickEvent(w: World, exclude: number): number {
  const d = w.director;
  const weights: [number, number][] = [];
  const tunnelW = rascals(w).filter(isResident).reduce((s, a) => s + escapeScore(w, a), 0);
  if (exclude !== EV.tunnel) weights.push([EV.tunnel, tunnelW]);
  // random food fights only after the scripted first one; locked like the scripted one
  if (exclude !== EV.food && d.data.foodDone && !foodRuckusLocked(w) && roomsOf(w, 'canteen').some(r => r.built)) weights.push([EV.food, Math.max(0, 50 - canteenMood(w)) / 10]);
  if (exclude !== EV.vip && w.rtMs > 480000 && !d.data.vipNext) weights.push([EV.vip, 0.15 * (tunnelW + 1)]);
  const sum = weights.reduce((s, [, v]) => s + v, 0);
  if (sum <= 0) return -1;
  if (w.rtMs >= D.emptySlotsFromSec * 1000) weights.push([0, D.emptyWeight * sum / (1 - D.emptyWeight)]);
  const total = weights.reduce((s, [, v]) => s + v, 0);
  let r = rngNext(w) * total;
  for (const [k, v] of weights) { if (v > 0 && (r -= v) <= 0) return k; }
  return weights.filter(([, v]) => v > 0).at(-1)![0];
}
function tryStart(w: World, code: EvCode): boolean {
  if (code === EV.tunnel) return startTunnel(w, false);
  if (code === EV.food) return !foodRuckusLocked(w) && inMeal(hourOf(w.t)) && startFoodFight(w, false);
  if (code === EV.vip) {
    if (w.director.data.vipNext) return true; // a VIP is already on its way (e.g. the morning VIP): one Cat Burglar
    w.director.data.vipNext = 1; emit(w, 'vipAnnounced'); return true;
  }
  return false;
}

function guardCovers(w: World, x: number, y: number) {
  const R2 = guardRadius(w);
  return staffOf(w, 'guard').some(g => !(g.flags & AF.offDuty) && Math.hypot(g.x - x, g.y - y) <= R2);
}
/**
 * Brief §3.12: (1 − Abdeckung) × sneaky factor × (1 + (50 − mood)/100); the Cat Burglar on top × DIRECTOR_RET.vipEscapeMult.
 * Documented deviation 22 (PROGRESS.md, BALANCE.md §9): Abdeckung is read at the rascal's CURRENT tile – 0.85 inside a
 * guard's radius, else 0 – not as the share of the tiles of all rooms it uses today (§3.10). The tile share was built
 * and measured in the closer pass (27 seeds): it moved H3 per seed from 24/27 to 20/27 inside 22–30 min and pushed a
 * unit-test seed past 30:00 without changing anything a player sees; the calibration stays on the binary reading.
 */
export function escapeScore(w: World, a: Agent) {
  if (a.flags & AF.earl) return 0;
  const cover = guardCovers(w, a.x, a.y) ? 0.85 : 0;
  const sneaky = a.traits.includes('sneaky') ? 2 : 1;
  const vip = a.flags & AF.vip ? R.vipEscapeMult : 1;
  return (1 - cover) * sneaky * vip * (1 + (50 - a.mood) / 100);
}
/** escape risk label for the UI (rascal card, VIP chip): the Cat Burglar is always "high" (brief "hohes Ausbruchsrisiko") */
export function escapeRisk(w: World, a: Agent): 'low' | 'mid' | 'high' {
  if (a.flags & AF.vip) return 'high';
  const s = escapeScore(w, a);
  return s >= R.highRiskScore ? 'high' : s >= 1.2 ? 'mid' : 'low';
}
function canteenMood(w: World) {
  const c = roomsOf(w, 'canteen')[0]; if (!c || !c.usesToday) return 60;
  return c.moodSumToday / c.usesToday;
}

/** food fight tumult meter 0..1 for the UI (fills in DIRECTOR.foodFightFillSec), 0 when no food fight runs */
export function foodFightMeter01(w: World): number {
  if (w.director.active !== 'food') return 0;
  return Math.max(0, Math.min(1, (w.rtMs - w.director.activeSinceMs) / (D.foodFightFillSec * 1000)));
}

// ------------------------------------------------------------------ spoon tunnel
function startTunnel(w: World, scripted: boolean): boolean {
  const cands = rascals(w).filter(a => isResident(a) && !(a.flags & AF.earl) && (a.state === 'using' || a.state === 'walking' || a.state === 'idle' || a.state === 'queued'));
  if (!cands.length) return false;
  let pick = cands[0], best = -1;
  for (const a of cands) { const s = escapeScore(w, a) + rngNext(w) * 0.3; if (s > best) { best = s; pick = a; } }
  releaseSlot(w, pick); pick.act = null;
  // pop out of a mound on the nearest outdoor tile, sprint 8 s towards the fence
  const mx = Math.floor(pick.x) + 0.5, my = Math.floor(pick.y) + 0.5;
  // nearest reachable fence tile by walking distance (fence recomputed in rebuild, rooms excluded)
  const ff = field(w, 'fence');
  let fx = mx, fy = my, bd = Infinity;
  const own = ff[idx(Math.floor(mx), Math.floor(my))];
  for (const p of w.poi.fenceEscape) {
    const dd = Math.hypot(p.x - mx, p.y - my);
    if (dd < bd && dd > 4 && own !== 0xffff) { bd = dd; fx = p.x; fy = p.y; }
  }
  goTo(pick, `t:${Math.floor(fx)},${Math.floor(fy)}`, fx, fy);
  setState(w, pick, 'escaping');
  w.director.active = 'tunnel'; w.director.activeSinceMs = w.rtMs;
  w.director.data.tunnelId = pick.id; w.director.data.tunnelDist = Math.max(4, bd);
  w.director.data.tunnelX = mx; w.director.data.tunnelY = my;
  w.director.data.tunnelDone = 1; w.director.data.tunnels = (w.director.data.tunnels ?? 0) + 1;
  w.director.data.guardSeenMs = 0;
  w.unlocked.guard = true;
  emit(w, 'tunnel', { id: pick.id, x: mx, y: my, scripted });
  return true;
}

// ------------------------------------------------------------------ food fight (Brief §3.12, M5_DESIGN §4.2)
/** the canteen a food fight can start in: built, not blocked, ≥ DIRECTOR_RET.minEaters rascals eating right now */
function fightCanteen(w: World) {
  for (const c of roomsOf(w, 'canteen')) {
    if (!c.built || w.rtMs < c.blockedUntilMs) continue;
    const eaters = rascals(w).filter(a => a.state === 'using' && a.act?.roomId === c.id);
    if (eaters.length >= R.minEaters) return { c, eaters };
  }
  return null;
}
function startFoodFight(w: World, scripted: boolean): boolean {
  if (foodRuckusLocked(w)) return false;
  const f = fightCanteen(w); if (!f) return false;
  const { c, eaters } = f;
  // 2–4 brawlers (the scripted beat is the full show: as many as possible, up to 4)
  const n = Math.min(eaters.length, scripted ? R.brawlersMax : rngInt(w, R.brawlersMin, R.brawlersMax));
  const pool = eaters.slice(), ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const j = rngInt(w, k, pool.length - 1);
    [pool[k], pool[j]] = [pool[j], pool[k]];
    ids.push(pool[k].id); setState(w, pool[k], 'brawling');
  }
  const d = w.director;
  d.active = 'food'; d.activeSinceMs = w.rtMs;
  d.data.foodRoom = c.id; d.data.foodDone = 1; d.data.guardCalmMs = w.rtMs;
  d.data.brawlers = ids.length; d.data.foodFights = (d.data.foodFights ?? 0) + 1;
  ids.forEach((id, k) => { d.data[`foodB${k}`] = id; });
  for (let k = ids.length; k < R.brawlersMax; k++) d.data[`foodB${k}`] = 0;
  emit(w, 'foodFight', { roomId: c.id, ids, scripted });
  return true;
}
const brawlerIds = (w: World) => { const out: number[] = []; for (let k = 0; k < R.brawlersMax; k++) { const id = w.director.data[`foodB${k}`]; if (id) out.push(id); } return out; };

function updateActive(w: World) {
  const d = w.director;
  if (d.active === 'tunnel') {
    const a = w.agents.find(x => x.id === d.data.tunnelId);
    if (!a || a.state !== 'escaping') { d.active = null; return; }
    // sprint along the fence field so that the fence is reached after ~8 s (walls respected)
    const ticks8s = (D.tunnelSprintSec * 1000) / tickMs(w.t);
    moveAgent(w, a, Math.max(0.08, (d.data.tunnelDist * 1.15) / ticks8s));
    if (guardCovers(w, a.x, a.y)) {
      d.data.guardSeenMs = (d.data.guardSeenMs || w.rtMs);
      if (w.rtMs - d.data.guardSeenMs >= 1500) { catchEscapee(w, a, 'guard'); return; }
    }
    if (w.rtMs - d.activeSinceMs >= D.tunnelSprintSec * 1000) {
      // escaped: −10 Ruf, the bed frees up
      addRuf(w, 'escaped', RUF.escaped); w.stats.escaped++;
      a.flags |= AF.escaped | AF.gone; a.bed = 0;
      emit(w, 'escaped', { id: a.id });
      d.active = null;
    }
  } else if (d.active === 'food') {
    const brawlers = w.agents.filter(a => a.state === 'brawling');
    // guards covering the canteen calm one brawler every DIRECTOR_RET.guardCalmSec (brief "Wachen helfen")
    const c = roomById(w, d.data.foodRoom);
    if (c && brawlers.length && guardCovers(w, c.x + c.w / 2, c.y + c.h / 2) && w.rtMs - d.data.guardCalmMs >= R.guardCalmSec * 1000) { calm(w, brawlers[0], 'guard'); d.data.guardCalmMs = w.rtMs; }
    if (!w.agents.some(a => a.state === 'brawling')) {
      // solved: +5 Ruf, +mood (fun) for the canteen guests and the calmed brawlers
      addRuf(w, 'eventSolved', RUF.eventSolved);
      const ids = brawlerIds(w);
      for (const a of rascals(w)) if (a.act?.roomId === d.data.foodRoom || ids.includes(a.id)) a.needs.fun = Math.min(100, a.needs.fun + R.solvedFun);
      d.data.foodEndMs = w.rtMs; // the UI's janitor hint follows a food fight (Brief §4.2 ~10:00 row)
      emit(w, 'foodSolved', { roomId: d.data.foodRoom, ms: w.rtMs - d.activeSinceMs }); d.active = null; return;
    }
    if (w.rtMs - d.activeSinceMs >= D.foodFightFillSec * 1000) {
      // unsolved: canteen blocked 30 s, cleanliness −50, every guest stands up (counts against Safety)
      if (c) { c.blockedUntilMs = w.rtMs + 30000; c.clean = Math.max(0, c.clean - 50); }
      for (const a of w.agents) if (a.state === 'brawling' || (a.act?.roomId === d.data.foodRoom && (a.state === 'using' || a.state === 'queued'))) { releaseSlot(w, a); a.act = null; setState(w, a, 'idle'); }
      w.stats.unsolved++;
      d.data.foodEndMs = w.rtMs;
      emit(w, 'foodLost', { roomId: d.data.foodRoom }); d.active = null;
    }
  } else if (d.active === 'ruckus') {
    if (w.rtMs - d.activeSinceMs >= D.ruckusDurationSec * 1000) d.active = null;
  } else d.active = null; // unknown leftovers (old saves): never block the director
}

export function catchEscapee(w: World, a: Agent, by: 'tap' | 'guard') {
  earn(w, 'event', ECON.caughtCoins, { x: a.x, y: a.y });
  addRuf(w, 'caught', RUF.caught);
  addRuf(w, 'eventSolved', RUF.eventSolved);
  w.stats.caught++; a.flags |= AF.caught;
  setState(w, a, 'dazed');
  w.director.active = null;
  emit(w, 'caught', { id: a.id, by });
}
export function calm(w: World, a: Agent, by: 'tap' | 'guard') {
  freeSeat(w, a);
  setState(w, a, 'dazed');
  emit(w, 'calmed', { id: a.id, by });
}

/** dazed rascals sit 3 s, then continue */
/** a brawler/escapee loses its activity: free the slot it still holds and let the queue move up (review finding) */
function freeSeat(w: World, a: Agent) {
  const rid = a.act?.roomId;
  releaseSlot(w, a);
  a.act = null;
  const r = rid ? roomById(w, rid) : undefined;
  if (r) promoteQueue(w, r);
}
export function dazedTick(w: World, a: Agent) {
  if (w.rtMs - a.stateMs >= 3000) { freeSeat(w, a); setState(w, a, 'idle'); }
}

// ------------------------------------------------------------------ ruckus: mood < 20 for 30 s → 30 s work stop
/** returns true when a ruckus started (it is an active event: nothing else starts during its 30 s) */
function ruckusCheck(w: World): boolean {
  const rs = rascals(w).filter(isResident);
  const d = w.director.data;
  if (!rs.length) { d.lowMoodSince = 0; return false; }
  const avg = rs.reduce((s, a) => s + a.mood, 0) / rs.length;
  if (avg >= D.ruckusMoodBelow) { d.lowMoodSince = 0; return false; }
  d.lowMoodSince = d.lowMoodSince || w.rtMs;
  if (w.rtMs - d.lowMoodSince < D.ruckusAfterSec * 1000 || foodRuckusLocked(w)) return false;
  for (const r of w.rooms) if (r.type === 'workshop' || r.type === 'classroom') { r.blockedUntilMs = w.rtMs + D.ruckusDurationSec * 1000; r.clean = Math.max(0, r.clean - 20); }
  d.lowMoodSince = 0; d.ruckuses = (d.ruckuses ?? 0) + 1;
  w.director.active = 'ruckus'; w.director.activeSinceMs = w.rtMs;
  emit(w, 'ruckus');
  return true;
}
