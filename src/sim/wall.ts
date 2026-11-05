/**
 * Wall clock entry point (Brief §5 "injizierbare Uhr", docs/M5_DESIGN.md §10). Owner: sim-retention.
 * The app feeds wall time from its Clock (src/platform/systemClock.ts); tests use FakeClock. These functions are
 * NOT commands (not logged): they are deterministic in their inputs and run outside the tick.
 *  - syncWall: about once per second (app) – local-day rollover (mail reset, today's tap counts)
 *  - beginSession: on load, after the offline plan – sessions++, morning-VIP check against the last session end
 *  - markSessionEnd: before every save and on tab hide – the "session end" the VIP rule measures from
 */
import type { World } from './types';
import { localDayOf } from './clock';
import { rollMailDay } from './mail';
import { vipMarkSessionEnd, vipOnSessionStart } from './vip';
import { incomePerMin1x } from './offline';

export function syncWall(w: World, nowMs: number, tzMin = 0) {
  if (!Number.isFinite(nowMs)) return;
  const prevDay = w.wall.nowMs ? localDayOf(w.wall.nowMs, w.wall.tzMin) : -1;
  w.wall.nowMs = nowMs; w.wall.tzMin = tzMin;
  const day = localDayOf(nowMs, tzMin);
  if (day !== prevDay && prevDay >= 0) { w.taps.horn = 0; w.taps.crates = 0; }
  if (day !== w.mail.day) rollMailDay(w, day, incomePerMin1x(w));
}

export function beginSession(w: World, nowMs: number, tzMin = 0) {
  w.wall.sessionStartMs = nowMs;
  w.wall.sessions++;
  syncWall(w, nowMs, tzMin);
  vipOnSessionStart(w, nowMs, tzMin);
}

/** a tab that was hidden is visible again: same VIP rule as a new session (the web has no reliable session end) */
export function resumeSession(w: World, nowMs: number, tzMin = 0) {
  syncWall(w, nowMs, tzMin);
  vipOnSessionStart(w, nowMs, tzMin);
}

export function markSessionEnd(w: World, nowMs: number, tzMin = 0) {
  if (!Number.isFinite(nowMs)) return;
  vipMarkSessionEnd(w, nowMs, tzMin);
}
