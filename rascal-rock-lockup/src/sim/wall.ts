/**
 * Wall clock entry point (Brief §5 "injizierbare Uhr", docs/M5_DESIGN.md §10). Owner: sim-retention.
 * The app feeds wall time from its Clock (src/platform/systemClock.ts); tests use FakeClock. These functions are
 * NOT commands (not logged): they are deterministic in their inputs, run outside the tick and never use the sim RNG.
 *  - syncWall: about once per second (app) – local-day rollover (mail reset, today's tap counts), and the morning-VIP
 *    check (a machine that slept overnight with the tab open counts like a return)
 *  - beginSession: on load, after the offline plan – sessions++, morning-VIP check against the last session end
 *  - resumeSession: tab visible again
 *  - markSessionEnd: before every save and on tab hide – the "session end" the VIP rule measures from
 * Days only roll FORWARD: a clock turned back (or a time zone change backwards) never resets mail or taps again.
 */
import type { World } from './types';
import { localDayOf } from './clock';
import { rollMailDay } from './mail';
import { vipMarkSessionEnd, vipOnSessionStart } from './vip';
import { incomePerMin1x } from './offline';

export function syncWall(w: World, nowMs: number, tzMin = 0) {
  if (!Number.isFinite(nowMs)) return;
  const tz = Number.isFinite(tzMin) ? tzMin : 0;
  w.wall.nowMs = nowMs; w.wall.tzMin = tz;
  const day = localDayOf(nowMs, tz);
  if (day > w.mail.day) {
    if (w.mail.day >= 0) { w.taps.horn = 0; w.taps.crates = 0; } // "You tapped N times today" counts the local day
    rollMailDay(w, day, incomePerMin1x(w));
  }
  vipOnSessionStart(w, nowMs, tz);
}

/**
 * `returning`: the world came from a save (any load). Then the session-1 quiet rules end (Brief §5 "Ruhe in Sitzung 1":
 * mail icon from minute 12, night skip in the first 5 minutes only apply to the very first session).
 */
export function beginSession(w: World, nowMs: number, tzMin = 0, returning = false) {
  if (returning) w.firstSession = false;
  w.wall.sessionStartMs = Number.isFinite(nowMs) ? nowMs : 0;
  w.wall.sessions++;
  syncWall(w, nowMs, tzMin);
}

/** a tab that was hidden is visible again: same VIP rule as a new session (the web has no reliable session end) */
export function resumeSession(w: World, nowMs: number, tzMin = 0) {
  syncWall(w, nowMs, tzMin);
}

export function markSessionEnd(w: World, nowMs: number, tzMin = 0) {
  if (!Number.isFinite(nowMs)) return;
  vipMarkSessionEnd(w, nowMs, Number.isFinite(tzMin) ? tzMin : 0);
}
