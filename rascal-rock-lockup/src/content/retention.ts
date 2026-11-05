/**
 * M5 retention content (docs/M5_DESIGN.md §8–§9, owner sim-retention): daily mail pool and rewards, morning VIP.
 * Units: real time; money in site-1 coins (scaled by content/progress.ts siteFactor). Pure data.
 */
// ------------------------------------------------------------------ Daily mail (Brief §3.16, §5)
/** counters a mail task can watch (mail.ts maps them onto World stats) */
export type MailCounter = 'released' | 'cratesSold' | 'caught' | 'upgrades' | 'builds' | 'hires' | 'earned' | 'projects' | 'foodSolved';
export interface MailTaskDef { id: string; counter: MailCounter; targets: readonly number[] }
export const MAIL_POOL: readonly MailTaskDef[] = [
  { id: 'release',  counter: 'released',   targets: [3, 5, 8] },
  { id: 'crates',   counter: 'cratesSold', targets: [20, 40, 60] },
  { id: 'catch',    counter: 'caught',     targets: [1, 2] },
  { id: 'upgrade',  counter: 'upgrades',   targets: [5, 10, 15] },
  { id: 'build',    counter: 'builds',     targets: [1, 2] },
  { id: 'hire',     counter: 'hires',      targets: [1, 2] },
  { id: 'earn',     counter: 'earned',     targets: [2000, 5000, 10000] },
  { id: 'project',  counter: 'projects',   targets: [1] },
  { id: 'foodCalm', counter: 'foodSolved', targets: [1] },
] as const;
export const MAIL = {
  tasksPerDay: 3,                // (brief)
  /** reward per task = max(minReward, rewardMinutes × income per minute) × site factor × (1 + mail perk) */
  rewardMinutes: 3,
  minReward: 150,
  keyEveryDays: 3,               // (brief) 1 golden key per 3 completed mail days
  /** session 1: the HUD icon appears from minute 12 at the earliest (brief §5 "Ruhe in Sitzung 1") */
  firstSessionFromMs: 12 * 60_000,
} as const;

// ------------------------------------------------------------------ Morning VIP (Brief §5.4)
export const VIP_MORNING = {
  /** the dock board teases after game day 1 */
  teaseAfterGameDay: 1,
  /** (a) new local calendar day AND ≥ 4 h since session end */
  newDayMinH: 4,
  /** (b) ≥ 8 h since session end */
  anyMinH: 8,
  /** from game day 3 the teaser board is permanently visible */
  boardPermanentFromDay: 3,
} as const;

