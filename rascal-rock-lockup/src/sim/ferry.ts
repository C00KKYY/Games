/** Ferry intake (Brief §3.6, §3.11) and the Parole Gate (§3.4, §2.2 USP 1). */
import { FERRY, RATE, RUF, SENTENCE, releaseBounty, gateBountyMult } from '../content/balance';
import { TICKS_PER_HOUR, AF, type World, type Agent } from './types';
import { spawnRascal, goTo, setState, releaseSlot, rascals } from './agents';
import { roomsOf, emit, earn, addRuf, starsOf } from './world';
import { nextHourTick } from './time';
import { ferrySeatBonus, releaseBountyMult } from './effects';

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
  const bonus = ferrySeatBonus(w);
  return Math.min(FERRY.max + bonus, FERRY.base + Math.floor(w.ruf / FERRY.perRuf) + bonus);
}

export function ferryTick(w: World) {
  const f = w.ferry;
  switch (f.state) {
    case 'away':
      if (w.t >= f.nextT) {
        f.state = 'arriving'; f.sinceMs = w.rtMs; f.tapped = false;
        f.aboard = w.stats.arrived === 0 ? 4 : ferrySizeNow(w);
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
          const first = w.stats.arrived === 0 && !w.prestige.transfers; // no second Earl on a transfer run
          const vip = !!w.director.data.vipNext && f.aboard === 1;
          const a = spawnRascal(w, w.poi.ferryBerth.x, w.poi.ferryBerth.y, { earl: first, vip });
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
  let admitted = false;
  for (const a of rascals(w)) if (a.state === 'waitingDock') { if (freeBeds(w).length) { admit(w, a); admitted = true; } else break; }
  if (admitted) compactDockQueue(w);
}

function admit(w: World, a: Agent) {
  const b = freeBeds(w)[0];
  if (!b) { waitAtDock(w, a); return; }
  a.bed = b.roomId; a.bedSlot = b.slot;
  setState(w, a, 'arriving');
  emit(w, 'admit', { id: a.id });
}
export function waitAtDock(w: World, a: Agent) {
  setState(w, a, 'waitingDock');
  compactDockQueue(w);
}
/** waiting rascals stand on distinct queue tiles in arrival order */
export function compactDockQueue(w: World) {
  const ws = rascals(w).filter(o => o.state === 'waitingDock').sort((x, y) => x.stateMs - y.stateMs || x.id - y.id);
  ws.forEach((o, k) => { const q = w.poi.dockQueue[k % w.poi.dockQueue.length]; if (Math.hypot(o.tx - q.x, o.ty - q.y) > 0.01) goTo(o, `t:${Math.floor(q.x)},${Math.floor(q.y)}`, q.x, q.y); });
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
  // G2 hook: the petty offender (content/balance SENTENCE.petty) pays a petty bounty – the early second release is a
  // celebration, not an economy jump (docs/BALANCE.md §6)
  const petty = !(a.flags & (AF.earl | AF.vip)) && a.sentence === SENTENCE.petty ? SENTENCE.pettyBounty : 1;
  // balance pass M5: short-timers (the 3rd passenger of the first ferry, sentence ≤ SENTENCE.third[1]) pay the petty
  // bounty too, and Earl pays the brief's "+100 Coins" (§4.2) – the scripted early releases are celebrations; the full
  // bounties pushed releases to 55–57 % of the income at 15:00 (Brief §3.8: 40–50 %)
  const short = !(a.flags & (AF.earl | AF.vip)) && petty === 1 && a.sentence <= SENTENCE.third[1] ? SENTENCE.pettyBounty : 1;
  const earl = a.flags & AF.earl ? SENTENCE.earlBounty / releaseBounty(0) : 1;
  const bounty = releaseBounty(starsOf(w.ruf), vip) * gateBountyMult(gate?.level ?? 1) * releaseBountyMult(w) * petty * short * earl;
  releaseSlot(w, a);
  a.bed = 0; a.bedSlot = -1; a.act = null;
  earn(w, 'release', bounty, { x: a.x, y: a.y });
  addRuf(w, 'release', petty < 1 ? SENTENCE.pettyRuf : RUF.release);
  w.stats.released++;
  const firstEver = w.stats.released === 1 && !w.prestige.transfers; // happytime only for the first release ever (§11.1)
  emit(w, 'release', { id: a.id, name: a.name, bounty, vip, first: firstEver });
  goTo(a, 'roadExit', w.poi.roadExit.x, w.poi.roadExit.y);
  setState(w, a, 'leaving');
  // the others move up in the gate queue
  const rest = w.agents.filter(o => o.state === 'atGate' || o.state === 'toGate').sort((x, y) => x.stateMs - y.stateMs || x.id - y.id);
  rest.forEach((o, k) => { const q = w.poi.gateQueue[Math.min(k, w.poi.gateQueue.length - 1)]; goTo(o, `t:${Math.floor(q.x)},${Math.floor(q.y)}`, q.x, q.y); o.state = 'toGate'; /* keep stateMs = queue order */ });
}
void TICKS_PER_HOUR;
