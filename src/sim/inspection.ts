/**
 * Inspection Day (Brief §3.17, docs/M5_DESIGN.md §5). Owner: sim-progress.
 *  - callable once the 7 mandatory objectives are done (objectives.mandatoryDone), not before `retryDay`
 *  - forecast(w) = the grades it would give now (shown before calling)
 *  - the goose inspector walks 45 s (walker, drawn by the renderer), then the result: grades A–F, stars, worst-category tip
 *  - 1★+ completes the site (prestige.completedSites, reportGameCompletedPercentage, happytime), 2★/3★ bonus keys
 *    come with the transfer (keysFor star bonus); a retry is possible from the next game day
 * Grades are measured over the last 2 game days (48 game-hour buckets recorded by inspectionHour).
 */
import { INSPECTION, PRESTIGE, keysFor } from '../content/balance';
import { siteDef } from '../content/progress';
import { type World, type CommandResult, type GradeSet, type Grade, type GradeCat, type InspectionResult, type Tile, type Side, type Room } from './types';
import { emit, field, roomsOf } from './world';
import { idx, nextStep, UNREACHABLE } from './pathfield';
import { mandatoryDone } from './objectives';
import { dayOf } from './time';
import { onInspectionPassed, completionPercent } from './prestige';
import { incomeCounter } from './offline';
import { rascals, isResident } from './agents';
import { totalBeds } from './ferry';

const CATS: GradeCat[] = ['comfort', 'safety', 'reform', 'profit'];
export const GRADE_CATS: readonly GradeCat[] = CATS;
/** i18n key of the inspector's tip for the worst category (result screen, Brief §3.17 "konkreter Tipp") */
export const inspectionTipKey = (cat: GradeCat) => `progress.tip.${cat}`;

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
  I.route = inspectionRoute(w);
  const p0 = I.route[0];
  I.walker = { x: p0.x, y: p0.y, dir: I.route.length > 1 ? dirOf(p0, I.route[1]) : 'E', moving: I.route.length > 1, wp: 0 };
  emit(w, 'inspectionCalled', { day: dayOf(w.t), rooms: inspectedRooms(w).length, walkSec: INSPECTION.walkSec });
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
  walkTick(w);
  if (w.rtMs - I.startMs < INSPECTION.walkSec * 1000) return;
  const f = forecast(w);
  const res: InspectionResult = { day: dayOf(w.t), ...f };
  I.last = res; I.phase = 'result'; I.walker.moving = false;
  const firstPass = res.stars >= 1 && I.best < 1;
  const improved = res.stars > I.best;
  I.best = Math.max(I.best, res.stars);
  emit(w, 'inspectionResult', {
    stars: res.stars, passed: res.stars >= 1, firstPass, improved, grades: res.grades, worst: res.worst,
    tip: inspectionTipKey(res.worst), keys: res.keysPreview, bonusKeys: PRESTIGE.starBonus[Math.min(3, I.best)] ?? 0, retryDay: I.retryDay,
  });
  if (res.stars >= 1) {
    onInspectionPassed(w, res.stars);                    // completedSites, bestStars, 'siteCompleted', 'completion'
    emit(w, 'happytime', { reason: 'inspection' });      // every passed inspection (Brief §11.1)
  } else emit(w, 'completion', { percent: completionPercent(w) }); // Brief §3.17 "Melde den Wert nach jeder Inspektion"

}

/** cumulative counters the hour buckets are differences of (inspection window, Brief §3.17 "letzte 2 Spieltage") */
export function inspectionCounters(w: World) {
  return { released: w.stats.released, escaped: w.stats.escaped, unsolved: w.stats.unsolved, income: incomeCounter(w), wages: w.stats.spend.wages ?? 0 };
}

/**
 * at every game-hour boundary (sim.ts onHour, also for the 8 settled hours of a skipped night): close the bucket of
 * the hour that just ended – counters minus `mark`, a mood sample of the residents, beds – and keep the last 48.
 */
export function inspectionHour(w: World, hourIndex: number) {
  const I = w.inspection;
  const now = inspectionCounters(w), m = I.mark;
  const rs = rascals(w).filter(isResident);
  I.hours.push({
    h: hourIndex,
    moodSum: rs.reduce((s, a) => s + a.mood, 0), moodN: rs.length,
    escaped: Math.max(0, now.escaped - m.escaped), unsolved: Math.max(0, now.unsolved - m.unsolved), released: Math.max(0, now.released - m.released),
    income: Math.max(0, now.income - m.income), wages: Math.max(0, now.wages - m.wages),
    beds: totalBeds(w),
  });
  if (I.hours.length > INSPECTION.windowHours) I.hours.splice(0, I.hours.length - INSPECTION.windowHours);
  I.mark = now;
}

// ------------------------------------------------------------------ the goose's walk (Brief §3.17 "läuft 45 s")
/** rooms the goose visits: every built, reachable room except the dock (start), the gate (end) and the office */
export const inspectedRooms = (w: World): Room[] => w.rooms.filter(r => r.built && r.reachable && r.type !== 'dock' && r.type !== 'gate' && r.type !== 'office');

/**
 * Tile path (tile centres) dock → nearest unvisited room door (path distance, ties by id) → … → gate. Each leg follows
 * the cached door distance fields, so the goose walks the same corridors as the rascals. Unreachable rooms are skipped.
 */
export function inspectionRoute(w: World): Tile[] {
  const g = w.grid;
  let cur = idx(Math.floor(w.poi.ferryBerth.x), Math.floor(w.poi.ferryBerth.y));
  const out: Tile[] = [centre(cur, g.w)];
  const follow = (f: Uint16Array) => {
    for (let n = 0; n < g.w * g.h; n++) { const nx = nextStep(g, f, cur); if (nx < 0) break; cur = nx; out.push(centre(cur, g.w)); }
  };
  const left = inspectedRooms(w).slice();
  while (left.length) {
    let best = -1, bv = UNREACHABLE;
    left.forEach((r, k) => { const v = field(w, '#' + r.id)[cur]; if (v < bv || (v === bv && best >= 0 && r.id < left[best].id)) { bv = v; best = k; } });
    if (best < 0) break; // the rest is unreachable from here
    const r = left.splice(best, 1)[0];
    follow(field(w, '#' + r.id));
  }
  const gate = roomsOf(w, 'gate')[0];
  if (gate) { const f = field(w, '#' + gate.id); if (f[cur] !== UNREACHABLE) follow(f); }
  return out;
}
const centre = (i: number, gw: number): Tile => ({ x: (i % gw) + 0.5, y: Math.floor(i / gw) + 0.5 });
function dirOf(a: Tile, b: Tile): Side {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy < 0 ? 'N' : 'S';
}
/** walking speed in tiles per real second at 1x: fast enough to finish the route ≤ 3 s before the 45 s end, never slower than a rascal */
export function walkSpeed(routeLen: number) {
  return Math.max(INSPECTION.walkMinTilesPerSec, Math.max(0, routeLen - 1) / (INSPECTION.walkSec - INSPECTION.walkSlackSec));
}
/** position along the route = elapsed real time × speed (pure function of rtMs, so save/load mid-walk is exact) */
function walkTick(w: World) {
  const I = w.inspection, R = I.route, wk = I.walker;
  if (R.length < 2) { wk.moving = false; return; }
  const d = Math.min(R.length - 1, ((w.rtMs - I.startMs) / 1000) * walkSpeed(R.length));
  const k = Math.min(R.length - 2, Math.floor(d)), fr = d - k;
  const a = R[k], b = R[k + 1];
  wk.x = a.x + (b.x - a.x) * fr; wk.y = a.y + (b.y - a.y) * fr;
  wk.moving = d < R.length - 1;
  if (wk.moving) wk.dir = dirOf(a, b);
  const reached = Math.floor(d);
  for (let j = wk.wp + 1; j <= reached; j++) {
    const t = R[j];
    const r = inspectedRooms(w).find(x => x.door.x + 0.5 === t.x && x.door.y + 0.5 === t.y);
    // first visit only (a corridor may cross the same door twice)
    if (r && !R.slice(0, j).some(p => p.x === t.x && p.y === t.y)) emit(w, 'inspectorAt', { roomId: r.id, rtype: r.type, x: t.x, y: t.y });
  }
  if (reached > wk.wp) wk.wp = reached;
}
