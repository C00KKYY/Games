/**
 * Mayor's daily mail (Brief §3.16, §5, docs/M5_DESIGN.md §8). Owner: sim-retention.
 *  - 3 tasks per LOCAL calendar day, reset at 00:00 local through wall.ts (Clock) – never Date in the sim
 *  - a day only rolls FORWARD: a clock turned back never re-rolls (no double-reset abuse)
 *  - tasks avoid yesterday's ids, only tasks that can be done at all (no "finish a project" before the board), and
 *    targets follow the player's own pace (≈ MAIL.paceMinutes of active play; day 1 = the lowest rung)
 *  - reward coins scaled to the current income (+25 % mail perk); every 3 completed mail days → 1 golden key
 *  - quiet HUD icon with a dot badge (`visible`, `seenDay`), in session 1 not before minute 12, never a popup;
 *    all claimed → teaser "New mail tomorrow"
 * Task choice uses its own hash of (seed, day) – the sim RNG stream is never touched by wall time.
 */
import { MAIL, MAIL_POOL, type MailCounter, type MailTaskDef } from '../content/retention';
import { siteFactor, PROJECTS } from '../content/progress';
import { OFFLINE } from '../content/balance';
import type { World, CommandResult, MailTask } from './types';
import { emit, earn, starsOf } from './world';
import { mailRewardMult } from './effects';
import { projectsUnlocked } from './projects';

export const mailCount = (w: World, c: MailCounter) => w.mail.count[c] ?? 0;
export const taskProgress = (w: World, t: MailTask) => Math.min(t.target, Math.max(0, mailCount(w, poolOf(t).counter) - t.base));
const poolOf = (t: MailTask) => MAIL_POOL.find(p => p.id === t.id) ?? MAIL_POOL[0];
/** dot badge on the HUD icon */
export const mailBadge = (w: World) => w.mail.visible && (w.mail.day > w.mail.seenDay || w.mail.tasks.some(t => t.done && !t.claimed));
/** all of today's tasks claimed → "New mail tomorrow" */
export const mailAllClaimed = (w: World) => w.mail.tasks.length > 0 && w.mail.tasks.every(t => t.claimed);

/** route sim events into the counters (sim.ts flushEvents) */
export function mailOnEvent(w: World, type: string, data: Record<string, unknown>) {
  const inc = (c: MailCounter, n = 1) => { w.mail.count[c] = (w.mail.count[c] ?? 0) + n; };
  switch (type) {
    case 'release': inc('released'); break;
    case 'crateSold': inc('cratesSold', Number(data.n) || 0); break;
    case 'caught': inc('caught'); break;
    case 'upgrade': inc('upgrades', Math.max(1, Number(data.to) - Number(data.from)) || 1); break;
    case 'built': inc('builds'); break;
    case 'hire': inc('hires'); break;
    case 'projectDone': inc('projects'); break;
    case 'foodSolved': inc('foodSolved'); break;
    case 'coins': if (!OFFLINE.nonIncomeKinds.includes(String(data.kind))) inc('earned', Number(data.amount) || 0); break;
  }
}

/** reward of one task if the day started now */
export function mailReward(w: World, perMin1x: number) {
  return Math.round(Math.max(MAIL.minReward * siteFactor(w.site), perMin1x * MAIL.rewardMinutes) * mailRewardMult(w));
}

/** can this task be done at all right now? (content MailTaskDef.needs) */
export function mailEligible(w: World, def: MailTaskDef): boolean {
  switch (def.needs) {
    case 'projects': return projectsUnlocked(w) && PROJECTS.some(p => !w.projects.done[p.id]);
    case 'foodFightSeen': return !!w.director.data.foodDone;
    case 'tunnelSeen': return !!w.director.data.tunnelDone;
    default: return true;
  }
}

/** per-minute pace of a rated counter on this site run (null = not rated) */
function paceOf(w: World, c: MailCounter): number | null {
  const min = w.rtMs / 60_000;
  if (min < MAIL.paceFromMin) return null;
  switch (c) {
    case 'released': return w.stats.released / min;
    case 'cratesSold': return w.stats.cratesSold / min;
    case 'earned': {
      let s = 0;
      for (const [k, v] of Object.entries(w.stats.income)) if (!OFFLINE.nonIncomeKinds.includes(k)) s += v;
      return s / min;
    }
    default: return null;
  }
}

/** target of a task for a day starting now: the highest ladder rung the player's pace reaches in ≈ MAIL.paceMinutes */
export function mailTarget(w: World, def: MailTaskDef): number {
  const t = def.targets;
  const pace = paceOf(w, def.counter);
  if (pace !== null) {
    const want = pace * MAIL.paceMinutes;
    let k = 0;
    while (k + 1 < t.length && t[k + 1] <= want) k++;
    return t[k];
  }
  if (def.counter === 'released' || def.counter === 'cratesSold' || def.counter === 'earned') return t[0];
  const stars = starsOf(w.ruf);
  let k = 0;
  while (k + 1 < t.length && k + 1 < MAIL.tierStars.length && stars >= MAIL.tierStars[k + 1]) k++;
  return t[k];
}

/** the day's 3 picks: hash(seed, day), eligible tasks only, yesterday's ids avoided when enough others remain */
export function mailPicks(w: World, day: number, yesterday: readonly string[]): MailTaskDef[] {
  const eligible = MAIL_POOL.filter(p => mailEligible(w, p));
  const fresh = eligible.filter(p => !yesterday.includes(p.id));
  const n = Math.min(MAIL.tasksPerDay, eligible.length);
  // fresh ids first; top up with yesterday's only when the eligible pool is too small
  const order = [...hashShuffle(fresh, w.seed, day), ...hashShuffle(eligible.filter(p => yesterday.includes(p.id)), w.seed, day + 7919)];
  return order.slice(0, n);
}
function hashShuffle<T>(xs: readonly T[], seed: number, day: number): T[] {
  const a = xs.slice();
  let h = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(day, 0xc2b2ae35)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** a new local day began (wall.ts, day > mail.day): replace the tasks */
export function rollMailDay(w: World, day: number, perMin1x: number) {
  const M = w.mail;
  if (day <= M.day) return; // never backwards, never twice
  const yesterday = M.tasks.map(t => t.id);
  M.day = day;
  if (day > M.hiDay) M.hiDay = day;
  const reward = mailReward(w, perMin1x);
  M.tasks = mailPicks(w, day, yesterday).map(p => ({ id: p.id, target: mailTarget(w, p), base: mailCount(w, p.counter), done: false, claimed: false, reward }));
  emit(w, 'mailNewDay', { day });
}

/**
 * wall.ts: the local day is ≥ 2 days BEFORE the current mail day (a clock that was far ahead was corrected, or turned
 * back on purpose). Without this the mail stays locked until that future date. Today's slot is closed without a reward
 * (tasks marked claimed → "New mail tomorrow"), the key streak restarts, and the next real day rolls normally.
 */
export function reanchorMail(w: World, day: number) {
  const M = w.mail;
  if (!(day < M.day)) return;
  M.day = day;
  M.seenDay = Math.min(M.seenDay, day);
  for (const t of M.tasks) { t.done = true; t.claimed = true; }
  M.streak = 0;
}

/** per tick (cheap): visibility gate and done flags */
export function mailTick(w: World) {
  const M = w.mail;
  if (!M.visible && (!w.firstSession || w.rtMs >= MAIL.firstSessionFromMs) && w.tutorial.done && M.tasks.length) {
    M.visible = true; emit(w, 'mailVisible', {});
  }
  for (let i = 0; i < M.tasks.length; i++) {
    const t = M.tasks[i];
    if (!t.done && taskProgress(w, t) >= t.target) { t.done = true; emit(w, 'mailTaskDone', { i, id: t.id }); }
  }
}

/** cmd.seeMail: the player opened the mail panel (clears the "new day" badge) */
export function seeMail(w: World): CommandResult {
  if (!w.mail.visible) return { ok: false, reason: 'locked' };
  w.mail.seenDay = w.mail.day;
  return { ok: true };
}

/** cmd.claimMail – reasons: locked, invalid, notDone, claimed */
export function claimMail(w: World, i: number): CommandResult {
  const M = w.mail;
  if (!M.visible) return { ok: false, reason: 'locked' };
  const t = Number.isInteger(i) ? M.tasks[i] : undefined;
  if (!t) return { ok: false, reason: 'invalid' };
  if (t.claimed) return { ok: false, reason: 'claimed' };
  if (!t.done) return { ok: false, reason: 'notDone' };
  t.claimed = true;
  earn(w, 'mail', t.reward);
  emit(w, 'mailClaimed', { i, reward: t.reward });
  if (mailAllClaimed(w)) {
    M.daysCompleted++;
    // only the newest day ever rolled counts towards a key (a day re-rolled after a back-jump of the clock does not)
    if (M.day >= M.hiDay) M.streak++;
    const key = M.streak >= MAIL.keyEveryDays;
    if (key) { M.streak = 0; w.keys++; w.prestige.keysEarned++; emit(w, 'keysEarned', { n: 1, source: 'mail' }); }
    emit(w, 'mailDayComplete', { daysCompleted: M.daysCompleted, streak: M.streak, key });
  }
  return { ok: true, cost: -t.reward };
}
