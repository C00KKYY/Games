/**
 * Morning VIP (Brief §5.4, docs/M5_DESIGN.md §9). Owner: sim-retention. The director's random VIP event stays in
 * director.ts; this is the scheduled retention hook. Both bring the same Cat Burglar (agents.ts spawnRascal vip:
 * cat with top hat, sentence SENTENCE.vip = 150, trait sneaky, ×5 release bounty ECON.vipMult, escape score ×
 * DIRECTOR_RET.vipEscapeMult in director.ts):
 *  - after game day 1 the dock board teases "Tomorrow: the infamous Cat Burglar arrives!" (phase 'teased'); the VIP
 *    rule then measures from the end of THIS session at the earliest (sessionEndMs ≥ the tease time)
 *  - ready when (a) a new local calendar day began AND ≥ 4 h passed since the session end, or (b) ≥ 8 h passed –
 *    whichever comes first (checked by wall.ts on session start, tab return and the 1 Hz wall sync)
 *  - ready → director.data.vipNext = 1 and vipMorning = 1 → the next ferry brings the Cat Burglar (ferry.ts) →
 *    'arrived', arrivals++, event 'vipArrived {id}'
 *  - after an arrival the next dayEnd teases again; from game day 3 the board is permanently visible
 */
import { VIP_MORNING } from '../content/retention';
import { AF, type World } from './types';
import { emit } from './world';
import { localDayOf } from './clock';
import { dayOf } from './time';

/** pure availability rule (H5): times in wall ms, day indices from localDayOf */
export function vipAvailable(sessionEndMs: number, sessionEndDay: number, nowMs: number, tzMin: number): boolean {
  if (!(sessionEndMs > 0) || !(nowMs >= sessionEndMs)) return false;
  const h = (nowMs - sessionEndMs) / 3_600_000;
  const newDay = localDayOf(nowMs, tzMin) > sessionEndDay;
  return (newDay && h >= VIP_MORNING.newDayMinH) || h >= VIP_MORNING.anyMinH;
}

/** text state of the dock board for the renderer/UI: hidden, teaser, or "arriving with the next ferry" */
export function vipBoard(w: World): 'hidden' | 'teaser' | 'ready' {
  const v = w.vip;
  if (v.phase === 'ready') return 'ready';
  if (v.phase === 'teased' || v.boardPermanent) return 'teaser';
  return 'hidden';
}

/**
 * game day ended (sim.ts onMidnight). `day` = dayOf() of the day that ended, 0-based like the 'dayEnd' event; the HUD
 * shows dayOf + 1 ("Day 1"), so "after the first game day" (Brief §5.4) is the end of day index 0.
 */
export function vipOnDayEnd(w: World, day: number) {
  const v = w.vip;
  if ((v.phase === 'none' || v.phase === 'arrived') && day + 1 >= VIP_MORNING.teaseAfterGameDay) {
    v.phase = 'teased';
    // "Tomorrow" is measured from this session: an older session end (before the tease) never counts
    if (w.wall.nowMs > v.sessionEndMs) { v.sessionEndMs = w.wall.nowMs; v.sessionEndDay = localDayOf(w.wall.nowMs, w.wall.tzMin); }
    emit(w, 'vipTeased', {});
  }
}

/** per tick (cheap): permanent board from game day 3; the morning VIP stepped off the ferry → 'arrived' */
export function vipTick(w: World) {
  const v = w.vip;
  if (!v.boardPermanent && dayOf(w.t) + 1 >= VIP_MORNING.boardPermanentFromDay) v.boardPermanent = true;
  const d = w.director.data;
  if (v.phase === 'ready' && d.vipMorning && !d.vipNext) {
    // ferry.ts consumed vipNext this tick by spawning the Cat Burglar: the newest AF.vip agent
    let id = 0;
    for (const a of w.agents) if (a.flags & AF.vip && a.id > id) id = a.id;
    d.vipMorning = 0;
    v.phase = 'arrived'; v.arrivals++;
    emit(w, 'vipArrived', { id });
  }
}

/** wall.ts: a session ends (save / tab hidden) – remember when */
export function vipMarkSessionEnd(w: World, nowMs: number, tzMin: number) {
  w.vip.sessionEndMs = nowMs;
  w.vip.sessionEndDay = localDayOf(nowMs, tzMin);
}

/** wall.ts: a session (re)starts / wall sync – teased + rule satisfied → ready (the next ferry brings the VIP) */
export function vipOnSessionStart(w: World, nowMs: number, tzMin: number) {
  const v = w.vip;
  if (v.phase !== 'teased' || !vipAvailable(v.sessionEndMs, v.sessionEndDay, nowMs, tzMin)) return;
  v.phase = 'ready';
  w.director.data.vipNext = 1;
  w.director.data.vipMorning = 1;
  emit(w, 'vipReady', {});
}

/** route sim events (sim.ts flushEvents). Arrival is detected in vipTick (spawn has no event of its own). */
export function vipOnEvent(w: World, type: string, data: Record<string, unknown>) {
  void w; void type; void data;
}
