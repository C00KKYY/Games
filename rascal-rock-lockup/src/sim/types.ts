/**
 * Simulation contract (docs/SIM_DESIGN.md). Pure data – no DOM, no Pixi.
 * All modules under src/sim/ share these types.
 */
import type { RoomType, StaffRole } from '../content/balance';

export const W = 32;
export const H = 30;
export const TICKS_PER_HOUR = 75;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
export const DAY_TICK_MS = 100;   // real ms per tick during the day at 1x
export const NIGHT_TICK_MS = 50;  // real ms per tick during the night at 1x
export const UNREACHABLE = 0xffff;

export type Side = 'N' | 'E' | 'S' | 'W';
export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // N E S W NE SE SW NW

// ------------------------------------------------------------------ grid
export interface Grid {
  w: number; h: number;
  /** Ground enum per tile (content/site1.ts) */
  ground: Uint8Array;
  /** 1 = inside a bought parcel */
  owned: Uint8Array;
  /** room index + 1 on interior tiles, else 0 */
  roomAt: Int16Array;
  /** wall on the EAST edge of tile i (between x and x+1) */
  wallE: Uint8Array;
  /** wall on the SOUTH edge of tile i (between y and y+1) */
  wallS: Uint8Array;
  /** 1 = tile cannot be entered (construction site, solid prop) */
  blocked: Uint8Array;
  /** 1 = fixed structure footprint (dock, gate, depot, office, freedom road) – never buildable */
  fixed: Uint8Array;
  /** 1 = freedom road tile */
  road: Uint8Array;
}

export interface Tile { x: number; y: number }
export interface Slot { x: number; y: number; dir: Side; kind: string }
export interface Furniture { sprite: string; x: number; y: number; z?: number; flipX?: boolean }

export type PlaceReason = 'ok' | 'tooSmall' | 'outside' | 'overlap' | 'blocksPath' | 'onRoad' | 'tooLarge';

export interface LayoutResult {
  slots: Slot[];
  /** waiting tiles inside the room along the wall next to the door */
  queue: Tile[];
  /** render hints, world units relative to the room interior top-left */
  furniture: Furniture[];
  /** decorative staff spot (cook at counter, teacher at board, clerk …) */
  staffSpots: Slot[];
}

// ------------------------------------------------------------------ rooms
export interface Room {
  id: number;
  type: RoomType;
  x: number; y: number; w: number; h: number;
  level: number;
  /** milestone visual stage 1..3 (lvl 5 / 15 / 30) */
  stage: number;
  door: { x: number; y: number; side: Side };
  /** extra doors created by touching rooms (connecting doors) */
  links: { x: number; y: number; side: Side; toRoom: number }[];
  slots: Slot[];
  queue: Tile[];
  furniture: Furniture[];
  staffSpots: Slot[];
  /** agent id occupying slot i, or 0 */
  slotUser: number[];
  /** agent ids waiting, in order */
  queueUsers: number[];
  built: boolean;
  /** rtMs when construction finishes */
  buildEndMs: number;
  clean: number;
  /** crates waiting for the cart (workshop) */
  stack: number;
  /** rtMs until which the room is blocked (food fight aftermath) */
  blockedUntilMs: number;
  /** derived: reachable from the dock */
  reachable: boolean;
  /** stats for the room panel */
  usesToday: number;
  moodSumToday: number;
  walkTicksSum: number; walkSamples: number;
}

// ------------------------------------------------------------------ agents
export type AgentKind = 'rascal' | 'staff' | 'crew' | 'vip' | 'cart';
export type Trait = 'sneaky' | 'hungry' | 'lazy' | 'clever' | 'grumpy' | 'cheerful';
export type Need = 'hunger' | 'energy' | 'hygiene' | 'fun';

export type RascalState =
  | 'arriving' | 'waitingDock' | 'idle' | 'walking' | 'queued' | 'using'
  | 'toGate' | 'atGate' | 'leaving' | 'escaping' | 'dazed' | 'brawling' | 'wander';

export interface Activity {
  kind: 'eat' | 'shower' | 'class' | 'work' | 'yard' | 'sleep' | 'hang' | 'gate' | 'leave' | 'dock' | 'escape';
  roomId: number;         // 0 = outdoors / none
  slot: number;           // slot index or -1
  untilT: number;         // game tick when a 'using' block ends
}

export interface Agent {
  id: number;
  kind: AgentKind;
  x: number; y: number;
  dir: Side;
  /** current walk target in tile coords (float) */
  tx: number; ty: number;
  /** distance-field key the agent follows, '' when walking straight */
  field: string;
  speed: number;
  moving: boolean;
  /** watchdog */
  lastDist: number; stuckMs: number;
  // ---- rascal
  state: RascalState;
  act: Activity | null;
  needs: Record<Need, number>;
  reform: number;
  sentence: number;
  bed: number;            // room id of the bunk, 0 = none
  bedSlot: number;
  traits: Trait[];
  mood: number;
  arrivedRtMs: number;
  stateMs: number;        // rtMs when the current state began
  // identity / look
  species: string;
  name: string;
  crime: number;          // index into the gag table
  caseNo: number;
  look: number;           // seed for accessories/tints
  security: 'low' | 'mid' | 'high';
  flags: number;          // bit flags, see AF
  // ---- staff
  role?: StaffRole;
  roomId?: number;        // assigned room
  staffLevel?: number;
}
export const AF = { earl: 1, vip: 2, escaped: 4, caught: 8, celebrated: 16, scriptTunnel: 32, gone: 64, offDuty: 128 } as const;

// ------------------------------------------------------------------ world
export interface SimEvent { t: number; rtMs: number; type: string; [k: string]: unknown }

export interface Stats {
  income: Record<string, number>;
  spend: Record<string, number>;
  rufBy: Record<string, number>;
  released: number;
  arrived: number;
  caught: number;
  escaped: number;
  cratesSold: number;
  teleports: number;
  unsolved: number;
  horntaps: number;
  cratetaps: number;
  lifetimeCoins: number;
  /** per real minute snapshots for bots/reports */
  minute: { m: number; life: number; coins: number; ruf: number; released: number; rascals: number; beds: number; mood: number }[];
}

export interface Ferry {
  state: 'away' | 'arriving' | 'docked' | 'leaving';
  /** rtMs of the state change */
  sinceMs: number;
  /** passengers still on board */
  aboard: number;
  tapped: boolean;
  /** next scheduled game tick of arrival */
  nextT: number;
}

export interface Cart { state: 'depot' | 'toWorkshop' | 'loading' | 'toDock' | 'selling' | 'return'; load: number; roomId: number; id: number; sinceMs: number; tapMs: Record<number, number> }

// ------------------------------------------------------------------ M5 progression & retention (docs/M5_DESIGN.md)
export type ProjectId =
  | 'mattresses' | 'recipeBook' | 'form27b' | 'whistle' | 'bubbleBath' | 'assembly'
  | 'speedyCarts' | 'nightSchool' | 'tetherball' | 'suggestionBox' | 'squeakyMops' | 'biggerFerry';
export type LeadId = 'intake' | 'logistics';
export type PerkId = 'startCapital' | 'workshop' | 'offlineCap' | 'ferry' | 'buildCost' | 'mail';
export type GradeCat = 'comfort' | 'safety' | 'reform' | 'profit';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Project Board (Brief §3.13, M5_DESIGN §2): one project at a time, real-time timer (1x rtMs) that continues offline */
export interface ProjectsState {
  /** finished projects of the current site (reset by a transfer) */
  done: Partial<Record<ProjectId, boolean>>;
  /** the running project, or null; `leftMs` counts down by tickMs per tick and by the away time when returning */
  running: { id: ProjectId; leftMs: number; totalMs: number } | null;
}

/** Department leads (Brief §3.11, M5_DESIGN §3) */
export interface LeadsState {
  /** slot k holds a hired lead or null; site 1 has 2 slots (slot 1 from 3★, slot 2 from 4★) */
  slots: (LeadId | null)[];
  /** rtMs of the hire (for the "From now on, Olli handles it" moment) */
  hiredMs: Partial<Record<LeadId, number>>;
}

/** hand-grip taps for the hire dialog ("You tapped 34 times today") – `today` resets at local midnight (wall.ts) */
export interface TapCounts { horn: number; crates: number; hornTotal: number; cratesTotal: number }

/** one game hour of inspection measurements (rolling window of the last 2 game days = 48 buckets) */
export interface HourBucket {
  /** game hour index (Math.floor(t / TICKS_PER_HOUR)) */
  h: number;
  moodSum: number; moodN: number;
  escaped: number; unsolved: number; released: number;
  /** gross income of the hour (all earn kinds except 'offline', 'mail', 'objective', 'loan') and wages paid */
  income: number; wages: number;
  /** total beds at the end of the hour */
  beds: number;
}
export interface GradeSet { comfort: number; safety: number; reform: number; profit: number }
export interface InspectionResult {
  /** game day of the inspection */
  day: number;
  scores: GradeSet;
  grades: Record<GradeCat, Grade>;
  /** 0 = failed, 1..3 */
  stars: number;
  /** category with the lowest score → inspector tip `progress.tip.<cat>` */
  worst: GradeCat;
  /** golden keys a transfer would give right now (preview on the result screen) */
  keysPreview: number;
}
/** Inspection Day (Brief §3.17, M5_DESIGN §5) */
export interface InspectionState {
  /** idle → walking (goose walks 45 s) → result (until the player closes the result screen) → idle */
  phase: 'idle' | 'walking' | 'result';
  /** rtMs when the walk started */
  startMs: number;
  /** goose inspector position (tile units) while walking; the renderer draws it, it is not an Agent */
  walker: { x: number; y: number; dir: Side; moving: boolean; wp: number };
  /** earliest game day a (re)inspection may be called; 0 = any */
  retryDay: number;
  /** rolling measurement window (≤ 48 buckets, oldest first) */
  hours: HourBucket[];
  last: InspectionResult | null;
  /** cumulative counters at the previous game-hour boundary (the next bucket is the difference) */
  mark: { released: number; escaped: number; unsolved: number; income: number; wages: number };
  /** best stars ever reached on this site (0 = never passed) */
  best: number;
  /** number of inspections called on this site */
  count: number;
}

/** Transfer / prestige (Brief §3.17, M5_DESIGN §6). Survives transfers. The key BALANCE is World.keys. */
export interface PrestigeState {
  perks: Partial<Record<PerkId, number>>;
  /** all-time lifetime coins over every run (stats.lifetimeCoins is per site run) */
  lifetimeCoins: number;
  /** sites with a passed inspection (≥ 1★), ascending, unique */
  completedSites: number[];
  /** best stars per site, index = site number */
  bestStars: number[];
  transfers: number;
  /** all golden keys ever earned (transfers + mail streak), for stats */
  keysEarned: number;
}

/** Mayor's daily mail (Brief §3.16, §5, M5_DESIGN §8) */
export interface MailTask {
  id: string;            // pool id from content/progress.ts MAIL_POOL
  target: number;
  /** counter value at the start of the mail day; progress = current − base */
  base: number;
  done: boolean;
  claimed: boolean;
  /** reward in coins, fixed when the mail day starts */
  reward: number;
}
export interface MailState {
  /** local calendar day index of the current tasks; -1 = never rolled */
  day: number;
  tasks: MailTask[];
  /** completed mail days since the last key (a key every 3) */
  streak: number;
  daysCompleted: number;
  /** last local day the player opened the mail (dot badge while day > seenDay) */
  seenDay: number;
  /** the HUD icon exists (session 1: from minute 12, Brief §5) */
  visible: boolean;
  /** event-driven counters the tasks watch (keys = content/progress.ts MailCounter), never reset */
  count: Record<string, number>;
}

/** Morning VIP (Brief §5.4, M5_DESIGN §9). All times are wall ms from the Clock. */
export interface VipState {
  /** none → teased (board: "Tomorrow: …") → ready (next ferry brings the Cat Burglar) → arrived → (next tease) */
  phase: 'none' | 'teased' | 'ready' | 'arrived';
  /** wall ms when the session that teased ended (last save / hide), 0 = unknown */
  sessionEndMs: number;
  /** local day index of sessionEndMs */
  sessionEndDay: number;
  /** from game day 3 the dock board is permanently visible */
  boardPermanent: boolean;
  /** count of morning VIPs that arrived */
  arrivals: number;
}

/** wall-clock bookkeeping (wall.ts), set only through syncWall(w, now, tz) – never Date.now() in the sim */
export interface WallState {
  /** last wall ms seen by syncWall */
  nowMs: number;
  /** local UTC offset (min east) of nowMs */
  tzMin: number;
  /** wall ms when the current session started */
  sessionStartMs: number;
  sessions: number;
}

/** Offline earnings + income window (Brief §3.15, M5_DESIGN §7) */
export interface OfflineState {
  /** income per 1x-minute of ACTIVE play, last 5 minutes (oldest first, ≤ 5 entries) */
  ring: number[];
  /** income counter value and rtMs at the start of the current ring minute */
  ringLife: number; ringMs: number;
  /** offline result waiting in the return panel (null = nothing to collect) */
  pending: { coins: number; awayMs: number; effPct: number; capMs: number; capped: boolean } | null;
  /** all coins ever collected offline (stats) */
  collected: number;
}

export interface World {
  seed: number;
  rngState: number;
  t: number;
  rtMs: number;
  speed: number;
  site: number;
  coins: number;
  ruf: number;
  /** golden keys (permanent across transfers, Brief §3.3): earned by transfers and the mail streak, spent on perks */
  keys: number;
  grid: Grid;
  parcels: boolean[];
  rooms: Room[];
  agents: Agent[];
  nextId: number;
  ferry: Ferry;
  cart: Cart;
  /** fixed points of interest (tile coords) */
  poi: { dockQueue: Tile[]; ferryBerth: Tile; gateQueue: Tile[]; gateOut: Tile; roadExit: Tile; depot: Tile; dockSell: Tile; fenceEscape: Tile[]; officeDoor: Tile };
  /** unlocked room types / systems */
  unlocked: Record<string, boolean>;
  /** wages could not be paid → slower staff until rtMs */
  unpaidUntilT: number;
  loan: { amount: number; open: boolean };
  firstSession: boolean;
  tutorial: { active: boolean; step: number; skipped: boolean; done: boolean };
  director: { nextMs: number; active: string | null; activeSinceMs: number; data: Record<string, number> };
  obj: { done: Record<string, boolean>; current: number };
  /** staff wages paid / command log for replays */
  log: { t: number; cmd: string; args: unknown[] }[];
  stats: Stats;
  events: SimEvent[];
  /** event cursor for consumers that poll */
  eventSeq: number;
  /** derived caches, excluded from hash/save */
  cache: { fields: Map<string, Uint16Array>; version: number; doorRes: Int32Array; evCursor: number };
  debug: boolean;
  // ---- M5 (docs/M5_DESIGN.md); defaults in world.ts m5Defaults(), migration in save/serialize.ts (v1 → v2)
  projects: ProjectsState;
  leads: LeadsState;
  taps: TapCounts;
  inspection: InspectionState;
  prestige: PrestigeState;
  mail: MailState;
  vip: VipState;
  wall: WallState;
  offline: OfflineState;
}

export interface CommandResult { ok: boolean; reason?: string; cost?: number }
