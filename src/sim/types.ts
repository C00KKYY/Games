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

export interface World {
  seed: number;
  rngState: number;
  t: number;
  rtMs: number;
  speed: number;
  site: number;
  coins: number;
  ruf: number;
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
}

export interface CommandResult { ok: boolean; reason?: string; cost?: number }
