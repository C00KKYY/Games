/**
 * Inspection Day (Brief §3.17, docs/M5_DESIGN.md §5). Owner: sim-progress.
 *  - callable once the 7 mandatory objectives are done (objectives.mandatoryDone), not before `retryDay`
 *  - forecast(w) = the grades it would give now (shown before calling)
 *  - the goose inspector walks 45 s (walker, drawn by the renderer), then the result: grades A–F, stars, worst-category tip
 *  - 1★+ completes the site (prestige.completedSites, reportGameCompletedPercentage, happytime), 2★/3★ bonus keys
 *    come with the transfer (keysFor star bonus); a retry is possible from the next game day
 * Grades are measured over the last 2 game days (48 game-hour buckets recorded by inspectionHour).
 */
import { INSPECTION, keysFor } from '../content/balance';
import { siteDef } from '../content/progress';
import { TICKS_PER_HOUR, type World, type CommandResult, type GradeSet, type Grade, type GradeCat, type InspectionResult } from './types';
import { emit } from './world';
import { mandatoryDone } from './objectives';
import { dayOf } from './time';
import { onInspectionPassed } from './prestige';

const CATS: GradeCat[] = ['comfort', 'safety', 'reform', 'profit'];

// ------------------------------------------------------------------ pure formulas (brief numbers)
/** A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E ≥ 25, F below */
export function gradeOf(score: number): Grade {
  const I = INSPECTION;
  return score >= I.gradeA ? 'A' : score >= I.gradeB ? 'B' : score >= I.gradeC ? 'C' : score >= I.gradeD ? 'D' : score >= I.gradeE ? 'E' : 'F';
}
const rank = (g: Grade) => 'FEDCBA'.indexOf(g); // F 0 … A 5
/** 3★: all B or better and ≥ 1 A · 2★: ≥ 3 grades B or better (and no grade below D) · 1★: no grade below D · else 0 */
export function starsFor(g: Record<GradeCat, Grade>): number {
  const gs = CATS.map(c => g[c]);
  if (gs.some(x => rank(x) < rank('D'))) return 0;
  const bPlus = gs.filter(x => rank(x) >= rank('B')).length;
  if (bPlus === 4 && gs.includes('A')) return 3;
  if (bPlus >= 3) return 2;
  return 1;
}
export const worstOf = (s: GradeSet): GradeCat => CATS.reduce((a, c) => (s[c] < s[a] ? c : a), CATS[0]);

/**
 * Scores over the bucket window:
 *  Comfort = Ø mood % · Safety = max(0, 100 − 25 × escapes − 10 × unsolved events)
 *  Reform = min(100, releases per day per 10 beds × 50) · Profit = min(100, net income per day ÷ target × 100)
 * Days in the window = buckets / 24 (at least 1/24 so an early forecast never divides by 0).
 */
export function scoresOf(w: World): GradeSet {
  const hs = w.inspection.hours;
  const days = Math.max(1, hs.length) / 24;
  const sum = (f: (b: typeof hs[number]) => number) => hs.reduce((s, b) => s + f(b), 0);
  const moodN = sum(b => b.moodN);
  const comfort = moodN ? sum(b => b.moodSum) / moodN : 0;
  const safety = Math.max(0, 100 - INSPECTION.safetyPerEscape * sum(b => b.escaped) - INSPECTION.safetyPerUnsolved * sum(b => b.unsolved));
  const beds = hs.length ? Math.max(1, sum(b => b.beds) / hs.length) : 1;
  const reform = Math.min(100, (sum(b => b.released) / days / (beds / 10)) * INSPECTION.reformPer10Beds);
  const net = (sum(b => b.income) - sum(b => b.wages)) / days;
  const profit = Math.max(0, Math.min(100, (net / siteDef(w.site).profitTarget) * 100));
  return { comfort: clamp(comfort), safety: clamp(safety), reform: clamp(reform), profit };
}
const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

/** grades + stars the inspection would give right now (forecast panel, Brief §3.17 "Prognose") */
export function forecast(w: World): Omit<InspectionResult, 'day'> {
  const scores = scoresOf(w);
  const grades = { comfort: gradeOf(scores.comfort), safety: gradeOf(scores.safety), reform: gradeOf(scores.reform), profit: gradeOf(scores.profit) };
  const stars = starsFor(grades);
  return { scores, grades, stars, worst: worstOf(scores), keysPreview: keysFor(w.stats.lifetimeCoins, Math.max(stars, w.inspection.best)) };
}

/** why the inspection can't be called right now (null = it can) – reasons: tutorial, notReady, busy, tooSoon */
export function inspectionBlock(w: World): string | null {
  if (!w.tutorial.done) return 'tutorial';
  if (!mandatoryDone(w)) return 'notReady';
  if (w.inspection.phase !== 'idle') return 'busy';
  if (dayOf(w.t) < w.inspection.retryDay) return 'tooSoon';
  return null;
}

/** cmd.callInspection */
export function callInspection(w: World): CommandResult {
  const why = inspectionBlock(w);
  if (why) return { ok: false, reason: why };
  const I = w.inspection;
  I.phase = 'walking'; I.startMs = w.rtMs; I.count++;
  I.retryDay = dayOf(w.t) + 1;
  // TODO(sim-progress): walk route (waypoints = built room doors in a loop starting at the dock), set walker.wp/x/y
  I.walker = { x: w.poi.ferryBerth.x, y: w.poi.ferryBerth.y, dir: 'E', moving: true, wp: 0 };
  emit(w, 'inspectionCalled', { day: dayOf(w.t) });
  return { ok: true };
}

/** cmd.closeInspection: the player closed the result screen (result → idle) – reasons: none */
export function closeInspection(w: World): CommandResult {
  if (w.inspection.phase !== 'result') return { ok: false, reason: 'none' };
  w.inspection.phase = 'idle';
  emit(w, 'inspectionClosed', {});
  return { ok: true };
}

/** per tick: walker movement and the end of the 45 s walk */
export function inspectionTick(w: World) {
  const I = w.inspection;
  if (I.phase !== 'walking') return;
  // TODO(sim-progress): move I.walker along the route (dir, moving), emit 'inspectorAt' {roomId} at each room
  if (w.rtMs - I.startMs < INSPECTION.walkSec * 1000) return;
  const f = forecast(w);
  const res: InspectionResult = { day: dayOf(w.t), ...f };
  I.last = res; I.phase = 'result'; I.walker.moving = false;
  const firstPass = res.stars >= 1 && I.best < 1;
  I.best = Math.max(I.best, res.stars);
  emit(w, 'inspectionResult', { stars: res.stars, passed: res.stars >= 1, firstPass, grades: res.grades, worst: res.worst });
  if (res.stars >= 1) {
    onInspectionPassed(w, res.stars);                    // completedSites, bestStars, 'siteCompleted', 'completion'
    emit(w, 'happytime', { reason: 'inspection' });      // every passed inspection (Brief §11.1)
  }
}

/** at every game-hour boundary (sim.ts onHour): close the bucket of the hour that just ended, keep the last 48 */
export function inspectionHour(w: World, hourIndex: number) {
  // TODO(sim-progress): bucket = counters − I.mark (released, escaped, unsolved, income w/o OFFLINE.nonIncomeKinds,
  //   wages), mood sample of the residents, beds = totalBeds; push, trim to INSPECTION.windowHours, update I.mark
  void w; void hourIndex; void TICKS_PER_HOUR;
}
