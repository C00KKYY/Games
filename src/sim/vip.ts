/**
 * Morning VIP (Brief §5.4, docs/M5_DESIGN.md §9). Owner: sim-retention. The director's random VIP event stays in
 * director.ts; this is the scheduled retention hook:
 *  - after game day 1 the dock board teases "Tomorrow: the infamous Cat Burglar arrives!" (phase 'teased')
 *  - ready when (a) a new local calendar day began AND ≥ 4 h passed since the session end, or (b) ≥ 8 h passed –
 *    whichever comes first (checked by wall.ts on session start / tab return)
 *  - ready → the next ferry brings the Cat Burglar (director.data.vipNext, spawned by ferry.ts) → 'arrived'
 *  - after an arrival the next dayEnd teases again; from game day 3 the board is permanently visible
 */
import { VIP_MORNING } from '../content/retention';
import type { World } from './types';
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

/** game day ended (sim.ts onMidnight, `day` = the day that ended, 1-based like dayEnd) */
export function vipOnDayEnd(w: World, day: number) {
  const v = w.vip;
  if ((v.phase === 'none' || v.phase === 'arrived') && day >= VIP_MORNING.teaseAfterGameDay) { v.phase = 'teased'; emit(w, 'vipTeased', {}); }
}

/** per tick (cheap) */
export function vipTick(w: World) {
  if (!w.vip.boardPermanent && dayOf(w.t) + 1 >= VIP_MORNING.boardPermanentFromDay) w.vip.boardPermanent = true;
}

/** wall.ts: a session ends (save / tab hidden) – remember when */
export function vipMarkSessionEnd(w: World, nowMs: number, tzMin: number) {
  w.vip.sessionEndMs = nowMs;
  w.vip.sessionEndDay = localDayOf(nowMs, tzMin);
}

/** wall.ts: a session (re)starts – teased + rule satisfied → ready (the next ferry brings the VIP) */
export function vipOnSessionStart(w: World, nowMs: number, tzMin: number) {
  const v = w.vip;
  if (v.phase !== 'teased' || !vipAvailable(v.sessionEndMs, v.sessionEndDay, nowMs, tzMin)) return;
  v.phase = 'ready';
  w.director.data.vipNext = 1; // TODO(sim-retention): mark it as the MORNING VIP so arrival → phase 'arrived'
  emit(w, 'vipReady', {});
}

/** route sim events (sim.ts flushEvents): the Cat Burglar stepped off the ferry */
export function vipOnEvent(w: World, type: string, data: Record<string, unknown>) {
  // TODO(sim-retention): 'admit'/'arrive' of an AF.vip agent while phase === 'ready' → 'arrived', arrivals++, emit 'vipArrived'
  void w; void type; void data;
}
