/**
 * Mayor's daily mail (Brief §3.16, §5, docs/M5_DESIGN.md §8). Owner: sim-retention.
 *  - 3 tasks per LOCAL calendar day, reset at 00:00 local through wall.ts (Clock) – never Date in the sim
 *  - reward coins scaled to the current income (+25 % mail perk); every 3 completed mail days → 1 golden key
 *  - quiet HUD icon with a dot badge (`visible`, `seenDay`), in session 1 not before minute 12, never a popup;
 *    all claimed → teaser "New mail tomorrow"
 * Task choice uses its own hash of (seed, day) – the sim RNG stream is never touched by wall time.
 */
import { MAIL, MAIL_POOL, type MailCounter } from '../content/retention';
import { siteFactor } from '../content/progress';
import { OFFLINE } from '../content/balance';
import type { World, CommandResult, MailTask } from './types';
import { emit, earn } from './world';
import { mailRewardMult } from './effects';

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

/** a new local day began (wall.ts): replace the tasks. TODO(sim-retention): avoid repeating yesterday's ids, scale targets */
export function rollMailDay(w: World, day: number, perMin1x: number) {
  const M = w.mail;
  M.day = day;
  const picks: number[] = [];
  let h = (Math.imul(w.seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(day, 0xc2b2ae35)) >>> 0;
  while (picks.length < Math.min(MAIL.tasksPerDay, MAIL_POOL.length)) {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    const k = h % MAIL_POOL.length;
    if (!picks.includes(k)) picks.push(k);
  }
  const reward = mailReward(w, perMin1x);
  M.tasks = picks.map(k => {
    const p = MAIL_POOL[k];
    return { id: p.id, target: p.targets[h % p.targets.length], base: mailCount(w, p.counter), done: false, claimed: false, reward };
  });
  emit(w, 'mailNewDay', { day });
}

/** per tick (cheap): visibility gate and done flags */
export function mailTick(w: World) {
  const M = w.mail;
  if (!M.visible && (!w.firstSession || w.rtMs >= MAIL.firstSessionFromMs) && w.tutorial.done && M.tasks.length) {
    M.visible = true; emit(w, 'mailVisible', {});
  }
  M.tasks.forEach((t, i) => { if (!t.done && taskProgress(w, t) >= t.target) { t.done = true; emit(w, 'mailTaskDone', { i, id: t.id }); } });
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
  const t = M.tasks[i];
  if (!t) return { ok: false, reason: 'invalid' };
  if (t.claimed) return { ok: false, reason: 'claimed' };
  if (!t.done) return { ok: false, reason: 'notDone' };
  t.claimed = true;
  earn(w, 'mail', t.reward);
  emit(w, 'mailClaimed', { i, reward: t.reward });
  if (mailAllClaimed(w)) {
    M.daysCompleted++; M.streak++;
    const key = M.streak >= MAIL.keyEveryDays;
    if (key) { M.streak = 0; w.keys++; w.prestige.keysEarned++; emit(w, 'keysEarned', { n: 1, source: 'mail' }); }
    emit(w, 'mailDayComplete', { daysCompleted: M.daysCompleted, streak: M.streak, key });
  }
  return { ok: true, cost: -t.reward };
}
