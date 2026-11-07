/**
 * M5 retention content (docs/M5_DESIGN.md §8–§9, owner sim-retention): daily mail pool and rewards, morning VIP.
 * Units: real time; money in site-1 coins (scaled by content/progress.ts siteFactor). Pure data.
 */
// ------------------------------------------------------------------ Daily mail (Brief §3.16, §5)
/** counters a mail task can watch (mail.ts maps them onto World stats) */
export type MailCounter = 'released' | 'cratesSold' | 'caught' | 'upgrades' | 'builds' | 'hires' | 'earned' | 'projects' | 'foodSolved';
/**
 * `targets`: the ladder of goals, lowest first. A new mail day picks a target from the player's own pace (mail.ts
 * mailTarget): rated counters use `rate × MAIL.paceMinutes`, the others step up with the stars (`MAIL.tierStars`).
 * `needs`: the task only appears once it can be done at all (no "finish a project" before the board exists).
 */
export type MailNeed = 'projects' | 'foodFightSeen' | 'tunnelSeen';
export interface MailTaskDef { id: string; counter: MailCounter; targets: readonly number[]; needs?: MailNeed }
export const MAIL_POOL: readonly MailTaskDef[] = [
  { id: 'release',  counter: 'released',   targets: [3, 5, 8, 12] },
  { id: 'crates',   counter: 'cratesSold', targets: [20, 40, 60, 100] },
  { id: 'catch',    counter: 'caught',     targets: [1, 2], needs: 'tunnelSeen' },
  { id: 'upgrade',  counter: 'upgrades',   targets: [5, 10, 15] },
  { id: 'build',    counter: 'builds',     targets: [1, 2] },
  { id: 'hire',     counter: 'hires',      targets: [1, 2] },
  { id: 'earn',     counter: 'earned',     targets: [2000, 5000, 10000, 20000] },
  { id: 'project',  counter: 'projects',   targets: [1], needs: 'projects' },
  { id: 'foodCalm', counter: 'foodSolved', targets: [1], needs: 'foodFightSeen' },
] as const;
export const MAIL = {
  tasksPerDay: 3,                // (brief)
  /** reward per task = max(minReward, rewardMinutes × income per minute) × site factor × (1 + mail perk) */
  rewardMinutes: 3,
  minReward: 150,
  keyEveryDays: 3,               // (brief) 1 golden key per 3 completed mail days
  /** session 1: the HUD icon appears from minute 12 at the earliest (brief §5 "Ruhe in Sitzung 1") */
  firstSessionFromMs: 12 * 60_000,
  /** target scaling: a mail day should take about this many minutes of active play at the player's own pace */
  paceMinutes: 10,
  /** rated counters only use the measured pace after this much active play on the site (before: lowest rung) */
  paceFromMin: 3,
  /** un-rated counters: ladder rung k is used from tierStars[k] stars on (0★ → rung 0, 2★ → rung 1, 4★ → rung 2) */
  tierStars: [0, 2, 4, 5],
  /**
   * anti-exploit vs. lockout (wall.ts, closer M5): a local day MORE than this many days before the current mail day
   * means the clock was far ahead (or a wrong system date was corrected) → the mail day re-anchors to today (closed
   * without reward). Smaller back-jumps (time zones, a day or two of clock fiddling) never re-roll.
   */
  reanchorAfterDays: 3,
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


// ------------------------------------------------------------------ Director fine values (Brief §3.12; DIRECTOR core numbers stay in balance.ts)
export const DIRECTOR_RET = {
  /** VIP "hohes Ausbruchsrisiko": escape score factor on top of the sneaky ×2 (Cat Burglar ≈ 3× a sneaky rascal) */
  vipEscapeMult: 1.5,
  /** brawlers per food fight (brief 2–4); drawn from the rascals eating in the canteen (≥ 3 needed to start) */
  brawlersMin: 2,
  brawlersMax: 4,
  minEaters: 3,
  /** guards covering the canteen calm one brawler every N s (brief: "Wachen helfen") */
  guardCalmSec: 3,
  /** "+Laune" of a solved food fight: fun for the canteen guests and the calmed brawlers */
  solvedFun: 5,
  /** a picked event that cannot start right now (no meal, nobody to tunnel) waits this long, then the slot re-picks */
  pendingMaxSec: 75,
  /** random slots keep this distance before a scripted beat (tunnel ~3:00, food fight ~10:00): the beat replaces its slot (brief §3.12) */
  scriptedClearSec: 90,
  /** …but only until this long after the scripted time (it may be late: lock after the tutorial, few eaters) */
  scriptedWaitSec: 150,
  /** escape score from which escapeRisk() reports "high" (UI: the Cat Burglar, sneaky + grumpy rascals out of guard cover) */
  highRiskScore: 2.5,
} as const;
