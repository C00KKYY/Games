/** Ferry intake (Brief §3.6, §3.11) and the Parole Gate (§3.4, §2.2 USP 1). */
import { FERRY, RATE, RUF, releaseBounty, gateBountyMult } from '../content/balance';
import { TICKS_PER_HOUR, AF, type World, type Agent } from './types';
import { spawnRascal, goTo, setState, releaseSlot, rascals } from './agents';
import { roomsOf, emit, earn, addRuf, starsOf } from './world';
import { nextHourTick } from './time';

const ferryTimes = [7, 15];
export function scheduleNextFerry(w: World) {
  w.ferry.nextT = Math.min(...ferryTimes.map(h => nextHourTick(w.t, h)));
}

export function freeBeds(w: World): { roomId: number; slot: number }[] {
  const out: { roomId: number; slot: number }[] = [];
  const taken = new Set<string>();
  for (const a of rascals(w)) if (a.bed) taken.add(a.bed + ':' + a.bedSlot);
  for (const r of roomsOf(w, 'bunk')) if (r.built) r.slots.forEach((_, i) => { if (!taken.has(r.id + ':' + i)) out.push({ roomId: r.id, slot: i }); });
  return out;
}
export const totalBeds = (w: World) => roomsOf(w, 'bunk').filter(r => r.built).reduce((s, r) => s + r.slots.length, 0);

export function ferrySizeNow(w: World) {
  const bonus = (w.unlocked.projBiggerFerry ? 2 : 0) + (w.unlocked.perkFerry ? 1 : 0);
  return Math.min(FERRY.max + bonus, FERRY.base + Math.floor(w.ruf / FERRY.perRuf) + bonus);
}

export function ferryTick(w: World) {
  const f = w.ferry;
  switch (f.state) {
    case 'away':
      if (w.t >= f.nextT) {
        f.state = 'arriving'; f.sinceMs = w.rtMs; f.tapped = false;
        f.aboard = w.tutorial.active && w.stats.arrived === 0 ? 4 : ferrySizeNow(w);
        emit(w, 'ferryHorn');
      }
      break;
    case 'arriving': {
      // waits honking for the player's tap; without tap docks after 20 s with half the passengers
      const tutorialHold = w.tutorial.active && w.stats.arrived === 0;
      const waited = w.rtMs - f.sinceMs >= FERRY.noTapWaitSec * 1000;
      if (f.tapped || (!tutorialHold && waited)) {
        if (!f.tapped) f.aboard = Math.max(1, Math.floor(f.aboard * FERRY.noTapFactor));
        f.state = 'docked'; f.sinceMs = w.rtMs;
        emit(w, 'ferryDock', { aboard: f.aboard, tapped: f.tapped });
      }
      break;
    }
    case 'docked': {
      // one passenger every 0.6 s; admitted if a bed is free, else waits at the dock (max 6)
      const since = w.rtMs - f.sinceMs;
      if (f.aboard > 0 && since >= 600 * (1 + (w.director.data.disembarked ?? 0))) {
        const waiting = rascals(w).filter(a => a.state === 'waitingDock').length;
        const beds = freeBeds(w).length - waiting;
        if (beds > 0 || waiting < FERRY.dockQueueMax) {
          const first = w.stats.arrived === 0;
          const vip = !!w.director.data.vipNext && f.aboard === 1;
          const a = spawnRascal(w, w.poi.ferryBerth.x, w.poi.ferryBerth.y, { earl: first && w.tutorial.active, vip });
          if (vip) w.director.data.vipNext = 0;
          f.aboard--; w.director.data.disembarked = (w.director.data.disembarked ?? 0) + 1;
          if (beds > 0) admit(w, a); else waitAtDock(w, a);
        }
      }
      if (f.aboard <= 0 || since > 15000) {
        if (f.aboard > 0) emit(w, 'ferryLeftWithRest', { n: f.aboard });
        f.state = 'leaving'; f.sinceMs = w.rtMs; f.aboard = 0; w.director.data.disembarked = 0;
        emit(w, 'ferryLeave');
      }
      break;
    }
    case 'leaving':
      if (w.rtMs - f.sinceMs > 3000) { f.state = 'away'; scheduleNextFerry(w); }
      break;
  }
  // waiting rascals take beds as they free up (in arrival order)
  for (const a of rascals(w)) if (a.state === 'waitingDock') { if (freeBeds(w).length) admit(w, a); else break; }
}

function admit(w: World, a: Agent) {
  const b = freeBeds(w)[0];
  if (!b) { waitAtDock(w, a); return; }
  a.bed = b.roomId; a.bedSlot = b.slot;
  setState(w, a, 'arriving');
  emit(w, 'admit', { id: a.id });
}
function waitAtDock(w: World, a: Agent) {
  const k = rascals(w).filter(o => o.state === 'waitingDock').length;
  const q = w.poi.dockQueue[k % w.poi.dockQueue.length];
  goTo(a, `t:${Math.floor(q.x)},${Math.floor(q.y)}`, q.x, q.y);
  setState(w, a, 'waitingDock');
}

// ------------------------------------------------------------------ Parole Gate
export function gateTick(w: World) {
  const queue = w.agents.filter(a => a.state === 'atGate').sort((a, b) => a.stateMs - b.stateMs || a.id - b.id);
  if (!queue.length) return;
  const first = queue[0];
  // tutorial: Earl waits for the stamp tap
  if (first.flags & AF.earl && w.tutorial.active && !w.director.data.stamped) return;
  const last = w.director.data.lastRelease ?? -1e9;
  if (w.rtMs - last < RATE.gateSecPerRelease * 1000 && !(first.flags & AF.earl)) return;
  release(w, first);
}

export function release(w: World, a: Agent) {
  w.director.data.lastRelease = w.rtMs;
  const gate = roomsOf(w, 'gate')[0];
  const vip = !!(a.flags & AF.vip);
  const bounty = releaseBounty(starsOf(w.ruf), vip) * gateBountyMult(gate?.level ?? 1) * (w.unlocked.projForm27b ? 1.15 : 1);
  releaseSlot(w, a);
  a.bed = 0; a.bedSlot = -1; a.act = null;
  earn(w, 'release', bounty, { x: a.x, y: a.y });
  addRuf(w, 'release', RUF.release);
  w.stats.released++;
  const firstEver = w.stats.released === 1;
  emit(w, 'release', { id: a.id, name: a.name, bounty, vip, first: firstEver });
  goTo(a, 'roadExit', w.poi.roadExit.x, w.poi.roadExit.y);
  setState(w, a, 'leaving');
  // the others move up in the gate queue
  const rest = w.agents.filter(o => o.state === 'atGate' || o.state === 'toGate').sort((x, y) => x.stateMs - y.stateMs || x.id - y.id);
  rest.forEach((o, k) => { const q = w.poi.gateQueue[Math.min(k, w.poi.gateQueue.length - 1)]; goTo(o, `t:${Math.floor(q.x)},${Math.floor(q.y)}`, q.x, q.y); o.state = 'toGate'; /* keep stateMs = queue order */ });
}
void TICKS_PER_HOUR;
