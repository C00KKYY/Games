/**
 * Offline earnings, catch-up resim, income window (Brief §3.15, §5.1, H4, docs/M5_DESIGN.md §7). Owner: sim-retention.
 *
 * Income window: income per 1x-minute of ACTIVE play (rtMs advances only while ticking), last 5 minutes.
 * Away handling (wall ms from the app's Clock, already clamped ≥ 0 by save/store.ts awayMs):
 *   < 1 s         → 'none'
 *   < 60 s        → 'silent'  : resim the away time at 1x, no UI
 *   60 s – 5 min  → 'catchup' : resim in blocks of ≤ OFFLINE.maxCatchupTicks, spread over frames
 *                               (≤ OFFLINE.catchupTicksPerFrame each), "Catching up…" (app: ctx.catchUp)
 *   ≥ 5 min       → 'formula' : perMin × min(away, cap) × eff → offline.pending (return panel); project timers advance
 * Only the active site earns. Negative / NaN deltas → 0, huge deltas (+10 years, Infinity) → the cap.
 * The resim tiers stand for time the world really ran: a world the player had PAUSED (speed 0) does not resim; the
 * formula tier pays regardless (the brief's offline income is not tied to the pause button).
 * A walking inspection is game time: the formula tier never fast-forwards it (only project timers run offline).
 */
import { OFFLINE } from '../content/balance';
import type { World, CommandResult } from './types';
import { emit, earn } from './world';
import { offlineEff, offlineCapMs } from './effects';
import { advanceProjects } from './projects';
import { tickMs } from './time';

export type AwayMode = 'none' | 'silent' | 'catchup' | 'formula';
export interface AwayPlan {
  mode: AwayMode;
  /** away time after the clamps (NaN/negative → 0); for 'formula' still uncapped (the cap is applied in the formula) */
  awayMs: number;
  /** resim ticks (0 for none/formula): the smallest n with Σ tickMs(t … t+n−1) ≥ awayMs, across day and night */
  ticks: number;
  /** the resim split into blocks of ≤ OFFLINE.maxCatchupTicks (brief: "höchstens 3.000 Ticks") */
  blocks: number[];
}

/** coins of all income kinds that count for the window (excludes OFFLINE.nonIncomeKinds) */
export function incomeCounter(w: World) {
  let s = 0;
  for (const [k, v] of Object.entries(w.stats.income)) if (!OFFLINE.nonIncomeKinds.includes(k)) s += v;
  return s;
}
/** Ø income per 1x-minute over the ring (0 before the first full minute) */
export function incomePerMin1x(w: World) {
  const r = w.offline.ring;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}
/**
 * the rate the offline formula uses: the ring, or – with an empty ring (a save migrated from M4 starts its ring at load
 * time) – the world's own average over its active time, so a returning M4 player still gets the return panel; 0 before
 * the first full minute of play (e.g. right after a transfer)
 */
export function offlineRatePerMin(w: World) {
  if (w.offline.ring.length) return incomePerMin1x(w);
  return w.rtMs >= 60_000 ? incomeCounter(w) / (w.rtMs / 60_000) : 0;
}

/**
 * per tick: close a ring minute every 60 000 rtMs. Self-healing mark: if the mark is not within the last ~2 minutes
 * of active time (a migrated M4 save starts with ringMs = 0 at a large rtMs; a transfer resets rtMs), the minute
 * restarts now instead of booking the whole history as one minute.
 */
export function offlineTick(w: World) {
  const O = w.offline;
  const dt = w.rtMs - O.ringMs;
  if (dt < 60_000 && dt >= 0) return;
  const life = incomeCounter(w);
  if (dt < 0 || dt >= 120_000) { O.ringLife = life; O.ringMs = w.rtMs; return; }
  O.ring.push(Math.max(0, life - O.ringLife));
  if (O.ring.length > OFFLINE.ringMinutes) O.ring.splice(0, O.ring.length - OFFLINE.ringMinutes);
  O.ringLife = life; O.ringMs = w.rtMs;
}

/** clamp an away delta: NaN / negative → 0, +Infinity stays (the formula caps it) */
export const clampAway = (ms: number) => (Number.isNaN(ms) || !(ms > 0) ? 0 : ms);

/** exact resim ticks for `ms` of 1x time from tick `t0` (tickMs varies: 100 ms by day, 50 ms by night) */
export function ticksFor(t0: number, ms: number): number {
  let n = 0, sum = 0;
  while (sum < ms) { sum += tickMs(t0 + n); n++; }
  return n;
}
/** split `ticks` into blocks of ≤ OFFLINE.maxCatchupTicks */
export function splitBlocks(ticks: number): number[] {
  const out: number[] = [];
  for (let left = Math.max(0, Math.floor(ticks)); left > 0; left -= OFFLINE.maxCatchupTicks) out.push(Math.min(left, OFFLINE.maxCatchupTicks));
  return out;
}

/** how to handle `awayMs` of wall time (pure) */
export function planAway(w: World, awayMs: number): AwayPlan {
  const ms = clampAway(awayMs);
  if (ms < 1000) return { mode: 'none', awayMs: ms, ticks: 0, blocks: [] };
  if (ms >= OFFLINE.formulaFromSec * 1000) return { mode: 'formula', awayMs: ms, ticks: 0, blocks: [] };
  const mode: AwayMode = ms < OFFLINE.silentBelowSec * 1000 ? 'silent' : 'catchup';
  if (w.speed === 0) return { mode: 'none', awayMs: ms, ticks: 0, blocks: [] }; // paused: the world did not run
  const ticks = ticksFor(w.t, ms);
  return { mode, awayMs: ms, ticks, blocks: splitBlocks(ticks) };
}

/** offline coins for `awayMs` (pure): Ø income/min × min(away, cap) × efficiency */
export function offlineCoins(w: World, awayMs: number) {
  const cap = offlineCapMs(w);
  const ms = Math.min(clampAway(awayMs), cap);
  const eff = offlineEff(w);
  return { coins: Math.max(0, Math.floor((offlineRatePerMin(w) * ms) / 60_000 * eff)), ms, eff, cap };
}

/**
 * formula path: compute the offline income into `offline.pending` and advance the project timer by the capped time.
 * A result that was not collected yet (the player left again before tapping Collect) is added to, never lost.
 */
export function applyOfflineFormula(w: World, awayMs: number) {
  const raw = clampAway(awayMs);
  const { coins, ms, eff, cap } = offlineCoins(w, raw);
  advanceProjects(w, ms);
  const prev = w.offline.pending;
  // nothing earned (no full minute of income yet, e.g. right after a transfer): no "+0" return panel
  if (coins <= 0 && !prev) return;
  const capped = raw > cap;
  const effPct = Math.round(eff * 100);
  w.offline.pending = prev
    ? { coins: prev.coins + coins, awayMs: prev.awayMs + ms, effPct, capMs: cap, capped: prev.capped || capped }
    : { coins, awayMs: ms, effPct, capMs: cap, capped };
  emit(w, 'offlinePending', { coins: w.offline.pending.coins, awayMs: w.offline.pending.awayMs, effPct, capped: w.offline.pending.capped });
}

/** cmd.collectOffline – reasons: none */
export function collectOffline(w: World): CommandResult {
  const p = w.offline.pending;
  if (!p) return { ok: false, reason: 'none' };
  w.offline.pending = null;
  w.offline.collected += p.coins;
  if (p.coins > 0) earn(w, 'offline', p.coins);
  emit(w, 'offlineCollected', { coins: p.coins });
  return { ok: true, cost: -p.coins };
}

/**
 * Catch-up runner for 'silent' and 'catchup' (the app calls step() once per frame and shows "Catching up…" for
 * 'catchup'; the normal stepper waits meanwhile). Works through `blocks` of ≤ OFFLINE.maxCatchupTicks, each spread
 * over frames of ≤ OFFLINE.catchupTicksPerFrame ticks. `tick` is injected (sim.ts tick) to avoid an import cycle.
 * The resim is the same tick function at 1x – deterministic, identical to having played those ticks. It ends when the
 * planned 1x time is covered (`untilRt`), so a first-session night skip inside the resim (day ticks instead of the
 * planned night ticks) neither overshoots nor stops short.
 */
export class CatchUp {
  left: number;
  total: number;
  /** rtMs at which the absence is fully re-simulated */
  untilRt: number;
  /** remaining blocks (the first one is the current block) */
  blocks: number[];
  /** blocks finished so far */
  blocksDone = 0;
  constructor(public w: World, total: number, private tick: (w: World) => void) {
    this.total = Math.max(0, Math.floor(total));
    this.left = this.total;
    this.blocks = splitBlocks(this.total);
    this.untilRt = w.rtMs + this.spanMs(this.total);
  }
  private spanMs(ticks: number, from = this.w.t) { let ms = 0; for (let i = 0; i < ticks; i++) ms += tickMs(from + i); return ms; }
  get done() { return this.left <= 0 || this.w.rtMs >= this.untilRt; }
  /** 0..1 progress for the toast */
  get progress01() { return this.total ? Math.min(1, 1 - this.left / this.total) : 1; }
  /** another absence while catching up (tab hidden again): append its ticks */
  extend(ticks: number) {
    const n = Math.max(0, Math.floor(ticks));
    if (!n) return;
    this.untilRt = Math.max(this.untilRt, this.w.rtMs) + this.spanMs(n, this.w.t + this.left);
    this.total += n; this.left += n;
    this.blocks = splitBlocks(this.left);
  }
  /** run up to `max` ticks of the current block; returns ticks run */
  step(max: number = OFFLINE.catchupTicksPerFrame): number {
    if (this.done) { this.left = 0; this.blocks = []; return 0; }
    const n = Math.min(this.blocks[0] ?? OFFLINE.maxCatchupTicks, Math.max(0, Math.floor(max)), OFFLINE.maxCatchupTicks);
    let run = 0;
    while (run < n && this.w.rtMs < this.untilRt) { this.tick(this.w); run++; }
    this.left = Math.max(0, this.left - run);
    if (this.blocks.length) { this.blocks[0] -= run; if (this.blocks[0] <= 0) { this.blocks.shift(); this.blocksDone++; } }
    if (this.w.rtMs >= this.untilRt) { this.left = 0; if (this.blocks.length) this.blocksDone++; this.blocks = []; }
    else if (this.left === 0) { this.left = ticksFor(this.w.t, this.untilRt - this.w.rtMs); this.total += this.left; this.blocks = splitBlocks(this.left); }
    return run;
  }
  /** headless: run everything now */
  finish() { while (!this.done) this.step(OFFLINE.maxCatchupTicks); }
}
