/**
 * Single source of truth for all tuning numbers (Brief §3, start values for site 1).
 * Units: rates per GAME HOUR, timers in REAL SECONDS at 1x unless stated.
 * Any change must be justified in docs/BALANCE.md.
 */

export const TIME = {
  /** real seconds per game hour during day (06–22) */
  dayHourSec: 7.5,
  /** real seconds per game hour during night (22–06) */
  nightHourSec: 3.75,
  dayStartHour: 6,
  nightStartHour: 22,
  newGameHour: 7,
  ferryHours: [7, 15] as const,
  meals: [[7, 8], [12, 13], [18, 19]] as const,
  activityHours: [8, 20] as const,
  ticksPerSec: 10,
  maxTicksPerSec: 60,
  maxTicksPerFrame: 8,
  /** speeds; 3x unlocked at 3 stars */
  speeds: [1, 2, 3] as const,
} as const;

export const STARS = [40, 140, 360, 650, 1000] as const;

export const RUF = {
  release: 20,
  objective: 10,
  milestone: 5,
  caught: 5,
  eventSolved: 5,
  escaped: -10,
} as const;

export type RoomType =
  | 'bunk' | 'canteen' | 'wash' | 'workshop' | 'classroom' | 'guard' | 'yard'
  | 'gate' | 'dock' | 'office';

export interface RoomDef {
  minW: number; minH: number;
  baseCost: number; perTile: number;
  /** tiles per seat/bed/station; 0 = fixed */
  tilesPerSlot: number;
  staff?: StaffRole;
  /** slots one staff member can serve */
  perStaff?: number;
  baseUp: number;
}

export const ROOMS: Record<RoomType, RoomDef> = {
  bunk:      { minW: 3, minH: 3, baseCost: 80,  perTile: 15, tilesPerSlot: 3, baseUp: 60 },
  canteen:   { minW: 4, minH: 3, baseCost: 120, perTile: 20, tilesPerSlot: 3, staff: 'cook', perStaff: 8, baseUp: 130 },
  wash:      { minW: 3, minH: 3, baseCost: 100, perTile: 15, tilesPerSlot: 3, staff: 'janitor', perStaff: 99, baseUp: 60 },
  workshop:  { minW: 4, minH: 4, baseCost: 250, perTile: 22, tilesPerSlot: 4, staff: 'foreman', perStaff: 4, baseUp: 120 },
  classroom: { minW: 4, minH: 4, baseCost: 300, perTile: 25, tilesPerSlot: 3, staff: 'teacher', perStaff: 10, baseUp: 150 },
  guard:     { minW: 2, minH: 2, baseCost: 180, perTile: 0,  tilesPerSlot: 0, staff: 'guard', perStaff: 1, baseUp: 90 },
  yard:      { minW: 4, minH: 4, baseCost: 60,  perTile: 8,  tilesPerSlot: 3, baseUp: 50 }, // Brief: 5x5 – start parcel too tight (BALANCE.md)
  gate:      { minW: 2, minH: 2, baseCost: 0,   perTile: 0,  tilesPerSlot: 0, staff: 'clerk', perStaff: 1, baseUp: 100 },
  dock:      { minW: 3, minH: 2, baseCost: 0,   perTile: 0,  tilesPerSlot: 0, staff: 'carter', perStaff: 1, baseUp: 90 },
  office:    { minW: 3, minH: 3, baseCost: 0,   perTile: 0,  tilesPerSlot: 0, baseUp: 0 },
};

export const roomCost = (t: RoomType, w: number, h: number) => ROOMS[t].baseCost + ROOMS[t].perTile * w * h;
export const roomSlots = (t: RoomType, w: number, h: number) =>
  ROOMS[t].tilesPerSlot ? Math.floor((w * h) / ROOMS[t].tilesPerSlot) : 1;

export const UPGRADE = {
  growth: 1.12,
  perLevel: 0.08,
  maxLevel: 30,
  milestones: [5, 15, 30] as const,
  milestoneMult: 2,
} as const;

export const upCost = (t: RoomType, lvl: number) => ROOMS[t].baseUp * Math.pow(UPGRADE.growth, lvl - 1);
/** cost to buy n levels starting at current level k (geometric sum) */
export const bulkCost = (t: RoomType, k: number, n: number) => {
  const b = ROOMS[t].baseUp, r = UPGRADE.growth;
  return (b * Math.pow(r, k - 1) * (Math.pow(r, n) - 1)) / (r - 1);
};
export const maxAffordable = (t: RoomType, k: number, coins: number) => {
  const b = ROOMS[t].baseUp, r = UPGRADE.growth;
  return Math.max(0, Math.floor(Math.log((coins * (r - 1)) / (b * Math.pow(r, k - 1)) + 1) / Math.log(r)));
};
export const levelMult = (lvl: number) => {
  let m = 1 + UPGRADE.perLevel * (lvl - 1);
  for (const ms of UPGRADE.milestones) if (lvl >= ms) m *= UPGRADE.milestoneMult;
  return m;
};

/** base rates per slot per game hour */
export const RATE = {
  /** meals per seat per hour: 1 meal per 0.5h */
  canteenMealsPerSeat: 2,
  /** crates per station per hour (1 per 2h) */
  workshopCratesPerStation: 0.5,
  workshopNoForemanFactor: 0.5,
  reformClass: 6,
  reformWorkshop: 2,
  reformPassive: 0.5,
  reformPassiveMood: 70,
  gateSecPerRelease: 10,
  cartCrates: 6,
  cartTripSec: 20,
} as const;

export type StaffRole = 'cook' | 'janitor' | 'guard' | 'teacher' | 'foreman' | 'clerk' | 'carter';
/** wages per game day; hire fee = 1 day wage (GDD E1) */
export const WAGES: Record<StaffRole, number> = {
  cook: 40, janitor: 30, guard: 50, teacher: 60, foreman: 50, clerk: 40, carter: 30,
};
/** GDD E16: wage grows with the level of the room the staff works in (pay grade). Output grows faster (levelMult), so upgrades stay profitable but have running cost. */
export const WAGE_LEVEL_EXP = 1;
/** global wage multiplier on the brief's start wages (see BALANCE.md) */
export const WAGE_SCALE = 1.5;
export const STAFF_ROOM: Record<StaffRole, RoomType> = {
  cook: 'canteen', janitor: 'wash', guard: 'guard', teacher: 'classroom', foreman: 'workshop', clerk: 'gate', carter: 'dock',
};
export const wageFor = (role: StaffRole, roomLvl: number) => WAGES[role] * WAGE_SCALE * Math.pow(levelMult(roomLvl), WAGE_LEVEL_EXP);
export const staffUpCost = (lvl: number) => 50 * Math.pow(1.2, lvl);
export const STAFF_SPEED_PER_LVL = 0.05;
export const GUARD_RADIUS = 6;

export const ECON = {
  startCoins: 900,
  boardPerBedHour: 1,
  crateValue: 20,
  releaseBase: 280,
  releasePerStar: 0.05,
  vipMult: 5,
  caughtCoins: 50,
  unpaidSlowdown: 0.3,
  loanMinutesIncome: 3,
  loanRepayShare: 0.25,
  siteScale: 8,
  coffeeBreakMult: 2,
  coffeeBreakSec: 180,
} as const;

export const releaseBounty = (stars: number, vip = false) =>
  ECON.releaseBase * (1 + ECON.releasePerStar * stars) * (vip ? ECON.vipMult : 1);
/** GDD E15: Parole Gate levels multiply the release bounty (the gate's "throughput" is value, not speed). */
/** GDD E17: bunk level raises board (nicer cells → higher county allowance), linear, no milestone doubling */
export const boardPerBedHour = (bunkLvl: number) => ECON.boardPerBedHour * (1 + UPGRADE.perLevel * (bunkLvl - 1));
export const GATE_PER_LEVEL = 0.04;
export const gateBountyMult = (gateLvl: number) => 1 + GATE_PER_LEVEL * (gateLvl - 1);

export const NEEDS = {
  hunger: { decay: 4, refill: 60 },
  energy: { decay: 3, refillPerHourInBed: 12 },
  hygiene: { decay: 2, refill: 70 },
  fun: { decay: 3, refillPerHourInYard: 20 },
  lockedValue: 80,
  arrivalHygiene: 25,
  iconBelow: 35,
  alarmBelow: 15,
  seekBelow: 50,
  moodWeights: { hunger: 0.3, energy: 0.2, hygiene: 0.2, fun: 0.3 },
} as const;

export const moodFactor = (mood: number) => 0.5 + mood / 100;

export const SENTENCE = {
  earlyCount: 12,
  early: [60, 90] as const,
  normal: [120, 220] as const,
  earl: 20,
  vip: 150,
} as const;

export const FERRY = {
  base: 2,
  perRuf: 60,
  max: 6,
  noTapWaitSec: 20,
  noTapFactor: 0.5,
  dockQueueMax: 6,
} as const;
export const ferrySize = (ruf: number, bonus = 0) =>
  Math.min(FERRY.max + bonus, FERRY.base + Math.floor(Math.max(0, ruf) / FERRY.perRuf) + bonus);

export const CLEAN = {
  perUse: 1,
  perUseAfterJanitorUnlock: 2,
  nightReset: 70,
  dirtyBelow: 40,
  tapAmount: 15,
} as const;

export const PARCELS = [
  // map 32x30 tiles: P3 on top (y 0–9), start + P2 middle (y 10–21), P4 bottom (y 22–29)
  { id: 'start', x: 0, y: 10, w: 18, h: 12, price: 0 },
  { id: 'p2', x: 18, y: 10, w: 14, h: 12, price: 1500 },
  { id: 'p3', x: 0, y: 0, w: 32, h: 10, price: 6000 },
  { id: 'p4', x: 0, y: 22, w: 32, h: 8, price: 20000 },
] as const;

export const DIRECTOR = {
  minGapSec: 150,
  maxGapSec: 240,
  scriptedTunnelSec: 180,
  scriptedFoodFightSec: 600,
  lockAfterTutorialSec: 300,
  emptySlotsFromSec: 900,
  emptyWeight: 0.2,
  tunnelSprintSec: 8,
  foodFightFillSec: 20,
  ruckusMoodBelow: 20,
  ruckusAfterSec: 30,
  ruckusDurationSec: 30,
} as const;

export const OFFLINE = {
  baseEff: 0.4,
  perSupervisor: 0.1,
  baseCapH: 2,
  silentBelowSec: 60,
  formulaFromSec: 300,
  maxCatchupTicks: 3000,
} as const;

export const INSPECTION = {
  walkSec: 45,
  gradeA: 85, gradeB: 70, gradeC: 55, gradeD: 40, gradeE: 25,
  /** net income per game day considered 100 profit (site 1) */
  profitTarget: 1200,
} as const;

export const PRESTIGE = { k: 1, C: 2000 } as const;
export const keysFor = (lifetimeCoins: number, stars: number) =>
  Math.floor(PRESTIGE.k * Math.sqrt(lifetimeCoins / PRESTIGE.C)) + (stars >= 3 ? 4 : stars >= 2 ? 2 : 0);

export const TAP_COOLDOWN_SEC = 2;
export const COIN_POP_AUTOCOLLECT_SEC = 5;
