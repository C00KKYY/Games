/** Shenanigans director (Brief §3.12): spoon tunnel, food fight, VIP, ruckus. Never game over. */
import { DIRECTOR, ECON, RUF, GUARD_RADIUS } from '../content/balance';
import { AF, type World, type Agent } from './types';
import { rascals, goTo, setState, releaseSlot, isResident, moveAgent } from './agents';
import { roomsOf, emit, earn, addRuf, roomById } from './world';
import { inMeal, hourOf, tickMs } from './time';
import { rngNext, rngInt } from './rng';
import { staffOf } from './staff';

const D = DIRECTOR;
const guardRadius = (w: World) => GUARD_RADIUS + (w.unlocked.projWhistle ? 2 : 0);

function tutorialEndMs(w: World) { return w.director.data.tutorialEndMs ?? (w.tutorial.done ? 0 : Infinity); }

export function directorTick(w: World) {
  const d = w.director;
  if (w.tutorial.active) return;
  if (d.active) { updateActive(w); return; }
  if (!d.nextMs) d.nextMs = w.rtMs + gap(w);
  // scripted beats replace the director slot
  if (!d.data.tunnelDone && w.rtMs >= D.scriptedTunnelSec * 1000) { if (startTunnel(w, true)) return; }
  if (!d.data.foodDone && w.rtMs >= D.scriptedFoodFightSec * 1000 && inMeal(hourOf(w.t))) { if (startFoodFight(w)) return; }
  if (w.rtMs < d.nextMs) { ruckusCheck(w); return; }
  d.nextMs = w.rtMs + gap(w);
  const lockFF = w.rtMs < tutorialEndMs(w) + D.lockAfterTutorialSec * 1000;
  const weights: [string, number][] = [];
  const tunnelW = rascals(w).filter(isResident).reduce((s, a) => s + escapeScore(w, a), 0);
  weights.push(['tunnel', tunnelW]);
  if (!lockFF) weights.push(['food', Math.max(0, 50 - canteenMood(w)) / 10]);
  if (w.rtMs > 480000 && !d.data.vipNext) weights.push(['vip', 0.15 * (tunnelW + 1)]);
  if (w.rtMs >= D.emptySlotsFromSec * 1000) weights.push(['none', D.emptyWeight * weights.reduce((s, [, v]) => s + v, 0) / (1 - D.emptyWeight)]);
  const total = weights.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return;
  let r = rngNext(w) * total, pick = 'none';
  for (const [k, v] of weights) { if ((r -= v) <= 0) { pick = k; break; } }
  if (pick === 'tunnel') startTunnel(w, false);
  else if (pick === 'food' && inMeal(hourOf(w.t))) startFoodFight(w);
  else if (pick === 'vip') { d.data.vipNext = 1; emit(w, 'vipAnnounced'); }
  ruckusCheck(w);
}
const gap = (w: World) => (D.minGapSec + rngNext(w) * (D.maxGapSec - D.minGapSec)) * 1000;

function guardCovers(w: World, x: number, y: number) {
  const R = guardRadius(w);
  return staffOf(w, 'guard').some(g => !(g.flags & AF.offDuty) && Math.hypot(g.x - x, g.y - y) <= R);
}
export function escapeScore(w: World, a: Agent) {
  if (a.flags & AF.earl) return 0;
  const cover = guardCovers(w, a.x, a.y) ? 0.85 : 0;
  const sneaky = a.traits.includes('sneaky') ? 2 : 1;
  return (1 - cover) * sneaky * (1 + (50 - a.mood) / 100);
}
function canteenMood(w: World) {
  const c = roomsOf(w, 'canteen')[0]; if (!c || !c.usesToday) return 60;
  return c.moodSumToday / c.usesToday;
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
  const fence = w.poi.fenceEscape;
  let fx = mx, fy = my, bd = Infinity;
  for (const p of fence) { const dd = Math.hypot(p.x - mx, p.y - my); if (dd < bd && dd > 4) { bd = dd; fx = p.x; fy = p.y; } }
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

// ------------------------------------------------------------------ food fight
function startFoodFight(w: World): boolean {
  const c = roomsOf(w, 'canteen')[0]; if (!c) return false;
  const eaters = rascals(w).filter(a => a.state === 'using' && a.act?.roomId === c.id);
  if (eaters.length < 3) return false;
  const n = Math.min(4, eaters.length);
  const ids: number[] = [];
  for (let k = 0; k < n; k++) { const a = eaters[(k * 3 + rngInt(w, 0, eaters.length - 1)) % eaters.length]; if (!ids.includes(a.id)) { ids.push(a.id); setState(w, a, 'brawling'); } }
  w.director.active = 'food'; w.director.activeSinceMs = w.rtMs;
  w.director.data.foodRoom = c.id; w.director.data.foodDone = 1; w.director.data.guardCalmMs = w.rtMs;
  w.director.data.brawlers = ids.length;
  emit(w, 'foodFight', { roomId: c.id, ids });
  return true;
}

function updateActive(w: World) {
  const d = w.director;
  if (d.active === 'tunnel') {
    const a = w.agents.find(x => x.id === d.data.tunnelId);
    if (!a || a.state !== 'escaping') { d.active = null; return; }
    // sprint speed so that the fence is reached after 8 s
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
    // guards in the canteen calm one rascal every 3 s
    const c = roomById(w, d.data.foodRoom);
    if (c && brawlers.length && guardCovers(w, c.x + c.w / 2, c.y + c.h / 2) && w.rtMs - d.data.guardCalmMs >= 3000) { calm(w, brawlers[0], 'guard'); d.data.guardCalmMs = w.rtMs; }
    if (!w.agents.some(a => a.state === 'brawling')) {
      addRuf(w, 'eventSolved', RUF.eventSolved);
      for (const a of rascals(w)) if (a.act?.roomId === d.data.foodRoom) a.needs.fun = Math.min(100, a.needs.fun + 5);
      emit(w, 'foodSolved'); d.active = null; return;
    }
    if (w.rtMs - d.activeSinceMs >= D.foodFightFillSec * 1000) {
      if (c) { c.blockedUntilMs = w.rtMs + 30000; c.clean = Math.max(0, c.clean - 50); }
      for (const a of w.agents) if (a.state === 'brawling' || (a.act?.roomId === d.data.foodRoom && a.state === 'using')) { releaseSlot(w, a); a.act = null; setState(w, a, 'idle'); }
      w.stats.unsolved++;
      emit(w, 'foodLost', { roomId: d.data.foodRoom }); d.active = null;
    }
  }
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
  setState(w, a, 'dazed');
  emit(w, 'calmed', { id: a.id, by });
}

/** dazed rascals sit 3 s, then continue */
export function dazedTick(w: World, a: Agent) {
  if (w.rtMs - a.stateMs >= 3000) { a.act = null; setState(w, a, 'idle'); }
}

// ------------------------------------------------------------------ ruckus: mood < 20 for 30 s → 30 s work stop
function ruckusCheck(w: World) {
  const rs = rascals(w).filter(isResident);
  if (!rs.length) return;
  const avg = rs.reduce((s, a) => s + a.mood, 0) / rs.length;
  const d = w.director.data;
  if (avg < D.ruckusMoodBelow) {
    d.lowMoodSince = d.lowMoodSince || w.rtMs;
    if (w.rtMs - d.lowMoodSince >= D.ruckusAfterSec * 1000 && w.rtMs >= tutorialEndMs(w) + D.lockAfterTutorialSec * 1000) {
      for (const r of w.rooms) if (r.type === 'workshop' || r.type === 'classroom') { r.blockedUntilMs = w.rtMs + D.ruckusDurationSec * 1000; r.clean = Math.max(0, r.clean - 20); }
      emit(w, 'ruckus'); d.lowMoodSince = 0;
    }
  } else d.lowMoodSince = 0;
}
