/**
 * Offline earnings, catch-up resim, income window (Brief §3.15, §5.1, H4, docs/M5_DESIGN.md §7). Owner: sim-retention.
 *
 * Income window: income per 1x-minute of ACTIVE play (rtMs advances only while ticking), last 5 minutes.
 * Away handling (wall ms from the app's Clock, already clamped ≥ 0 by save/store.ts awayMs):
 *   < 60 s        → 'silent'  : resim the away time at 1x, no UI
 *   60 s – 5 min  → 'catchup' : resim in blocks (≤ OFFLINE.catchupTicksPerFrame per frame) with "Catching up…"
 *   ≥ 5 min       → 'formula' : perMin × min(away, cap) × eff → offline.pending (return panel); project timers advance
 * Only the active site earns. Negative deltas → 0, huge deltas → cap.
 */
import { OFFLINE } from '../content/balance';
import type { World, CommandResult } from './types';
import { emit, earn } from './world';
import { offlineEff, offlineCapMs } from './effects';
import { advanceProjects } from './projects';
import { tickMs } from './time';

export type AwayMode = 'none' | 'silent' | 'catchup' | 'formula';
export interface AwayPlan { mode: AwayMode; awayMs: number; ticks: number }

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

/** per tick: close a ring minute every 60 000 rtMs */
export function offlineTick(w: World) {
  const O = w.offline;
  if (w.rtMs - O.ringMs < 60_000) return;
  const life = incomeCounter(w);
  O.ring.push(Math.max(0, life - O.ringLife));
  if (O.ring.length > OFFLINE.ringMinutes) O.ring.splice(0, O.ring.length - OFFLINE.ringMinutes);
  O.ringLife = life; O.ringMs = w.rtMs;
}

/** how to handle `awayMs` of wall time (pure) */
export function planAway(w: World, awayMs: number): AwayPlan {
  const ms = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  if (ms < 1000) return { mode: 'none', awayMs: ms, ticks: 0 };
  const mode: AwayMode = ms < OFFLINE.silentBelowSec * 1000 ? 'silent' : ms < OFFLINE.formulaFromSec * 1000 ? 'catchup' : 'formula';
  // TODO(sim-retention): exact tick count across day/night (tickMs varies); this estimate uses the current tick length
  const ticks = mode === 'formula' ? 0 : Math.ceil(ms / tickMs(w.t));
  return { mode, awayMs: ms, ticks };
}

/** formula path: compute the pending offline income and advance the project timer */
export function applyOfflineFormula(w: World, awayMs: number) {
  const cap = offlineCapMs(w);
  const ms = Math.min(Math.max(0, Number.isFinite(awayMs) ? awayMs : 0), cap);
  const eff = offlineEff(w);
  const coins = Math.max(0, Math.floor((incomePerMin1x(w) * ms) / 60_000 * eff));
  advanceProjects(w, ms);
  w.offline.pending = { coins, awayMs: ms, effPct: Math.round(eff * 100), capMs: cap, capped: awayMs > cap };
  emit(w, 'offlinePending', { coins, awayMs: ms, effPct: Math.round(eff * 100), capped: awayMs > cap });
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
 * 'catchup'). `tick` is injected (sim.ts tick) to avoid an import cycle.
 */
export class CatchUp {
  left: number;
  constructor(public w: World, public total: number, private tick: (w: World) => void) { this.left = Math.max(0, Math.floor(total)); }
  get done() { return this.left <= 0; }
  /** run up to `max` ticks; returns ticks run */
  step(max = OFFLINE.catchupTicksPerFrame): number {
    const n = Math.min(this.left, Math.max(0, Math.floor(max)), OFFLINE.maxCatchupTicks);
    for (let i = 0; i < n; i++) this.tick(this.w);
    this.left -= n;
    return n;
  }
}
