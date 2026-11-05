/**
 * Injectable wall clock (Brief §5 "Testbarkeit"). The sim never reads real time itself: offline earnings, daily mail
 * and the morning VIP receive wall time through a Clock (app: src/platform/systemClock.ts, tests: FakeClock).
 *
 * Local calendar days (mail reset 00:00 local, morning VIP rule (a)) need the local UTC offset; it comes from the
 * Clock too (`tzOffsetMin`, minutes EAST of UTC, i.e. −Date#getTimezoneOffset()), so the sim never touches Date.
 */
export interface Clock {
  now(): number;
  /** local offset east of UTC in minutes at `atMs` (DST-aware in the system clock); missing = 0 (UTC) */
  tzOffsetMin?(atMs: number): number;
}
export class FakeClock implements Clock {
  constructor(public t = 0, public tz = 0) {}
  now() { return this.t; }
  tzOffsetMin() { return this.tz; }
  advance(ms: number) { this.t += ms; }
}
export const DAY_MS = 86_400_000;
/** local calendar day index (days since 1970-01-01 local) of the wall time `ms` */
export const localDayOf = (ms: number, tzOffsetMin = 0) => Math.floor((ms + tzOffsetMin * 60_000) / DAY_MS);
export const localDay = (c: Clock, ms = c.now()) => localDayOf(ms, c.tzOffsetMin?.(ms) ?? 0);
