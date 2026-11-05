/**
 * M5 progression content (docs/M5_DESIGN.md, owner sim-progress): Project Board, department leads, perks,
 * sites/inspection targets, completion percentage, clipboard follow-ups. Retention content (daily mail, morning VIP)
 * lives in content/retention.ts (owner sim-retention). Pure data – no sim imports.
 * Units: timers in REAL seconds at 1x (Brief §3 "Einheiten"), money in site-1 coins (later sites × ECON.siteScale^(n-1)).
 * Numbers marked (brief) are binding; the rest are start values the balance pass may tune (document in BALANCE.md).
 */
import type { RoomType } from './balance';
import type { ProjectId, LeadId, PerkId } from '../sim/types';

// ------------------------------------------------------------------ Project Board (Brief §3.13)
/** effect kinds read by src/sim/effects.ts – every project has exactly one */
export type ProjectEffect =
  | 'energyRefill'   // bed energy refill × (1 + v)
  | 'mealRefill'     // hunger refill per meal × (1 + v)
  | 'guardRadius'    // + v tiles
  | 'crateValue'     // crate value × (1 + v)
  | 'reform'         // classroom/workshop reform × (1 + v)
  | 'cartSpeed'      // cart speed × (1 + v)
  | 'ferrySeats'     // + v passengers (and + v to the ferry cap)
  | 'releaseBounty'  // release bounty × (1 + v)
  | 'hygieneRefill'  // hygiene refill per shower × (1 + v)
  | 'yardFun'        // yard fun refill × (1 + v)
  | 'moodFlat'       // + v percentage points on every rascal's mood before the clamp
  | 'dirtPerUse';    // room dirt per use × (1 − v)

export interface ProjectDef {
  id: ProjectId;
  cost: number;
  /** timer, real seconds at 1x (brief: 60–300) */
  sec: number;
  effect: ProjectEffect;
  v: number;
  /** a built room of this type is required to START the project (otherwise the card shows the lock + reason) */
  requires?: RoomType;
  /** render hint for art-m5: what appears in the world when done (Brief: "im Bild sichtbar") */
  visual: string;
}

/** 12 projects for site 1; order = board order (cheap/short first). (brief) the first 7 and their effects. */
export const PROJECTS: readonly ProjectDef[] = [
  { id: 'mattresses',    cost: 400,  sec: 90,  effect: 'energyRefill',  v: 0.25, requires: 'bunk',      visual: 'thicker mattresses on every bunk bed' },
  { id: 'recipeBook',    cost: 500,  sec: 90,  effect: 'mealRefill',    v: 0.25, requires: 'canteen',   visual: 'cookbook on the canteen counter + extra steam' },
  { id: 'form27b',       cost: 600,  sec: 120, effect: 'releaseBounty', v: 0.15,                        visual: 'golden stamp + form tray at the gate booth, gold stamp flash on release' },
  { id: 'whistle',       cost: 700,  sec: 120, effect: 'guardRadius',   v: 2,    requires: 'guard',     visual: 'golden whistle on every guard (+ guard radius overlay grows)' },
  { id: 'bubbleBath',    cost: 800,  sec: 150, effect: 'hygieneRefill', v: 0.25, requires: 'wash',      visual: 'soap bubbles rising from every wash hut' },
  { id: 'assembly',      cost: 1200, sec: 180, effect: 'crateValue',    v: 0.25, requires: 'workshop',  visual: 'conveyor belt prop in every knitting nook' },
  { id: 'speedyCarts',   cost: 1500, sec: 180, effect: 'cartSpeed',     v: 0.3,                         visual: 'racing stripes on the crate cart' },
  { id: 'nightSchool',   cost: 1800, sec: 210, effect: 'reform',        v: 0.2,  requires: 'classroom', visual: 'desk lamps glowing in every classroom' },
  { id: 'tetherball',    cost: 2000, sec: 210, effect: 'yardFun',       v: 0.3,  requires: 'yard',      visual: 'tetherball pole (swinging ball) in every yard' },
  { id: 'suggestionBox', cost: 2500, sec: 240, effect: 'moodFlat',      v: 5,                           visual: 'suggestion box at the Warden\'s Office, small heart pops' },
  { id: 'squeakyMops',   cost: 3000, sec: 240, effect: 'dirtPerUse',    v: 0.3,                         visual: 'mop + bucket prop next to every wash hut, janitors carry a mop' },
  { id: 'biggerFerry',   cost: 4000, sec: 300, effect: 'ferrySeats',    v: 2,                           visual: 'bigger ferry sprite (extra deck)' },
] as const;
export const PROJECT_UNLOCK_STARS = 2;                 // (brief)
export const projectDef = (id: ProjectId) => PROJECTS.find(p => p.id === id)!;

// ------------------------------------------------------------------ Department leads (Brief §3.11)
export interface LeadDef {
  id: LeadId;
  /** the hand-grip the lead automates */
  grip: 'horn' | 'crates';
  /** first site that offers the lead (site 2: cleaning + release, M6) */
  site: number;
  fee: number;
  /** wage per game day, paid at midnight with the staff wages */
  wage: number;
  /** display name + species for art/UI */
  name: string;
  species: 'beaver' | 'otter';
}
export const LEADS: readonly LeadDef[] = [
  { id: 'intake',    grip: 'horn',   site: 1, fee: 1200, wage: 60, name: 'Olli',  species: 'beaver' },
  { id: 'logistics', grip: 'crates', site: 1, fee: 1200, wage: 60, name: 'Becca', species: 'beaver' },
] as const;
/** stars required per Warden's Office slot, site 1 (brief: slot 1 at 3★, slot 2 at 4★) */
export const LEAD_SLOT_STARS: Record<number, readonly number[]> = { 1: [3, 4] };
/** (brief) +10 pp offline efficiency per hired lead */
export const LEAD_OFFLINE_PP = 0.1;
/** an automated horn tap happens this long after the ferry starts honking (visible moment, real ms at 1x) */
export const LEAD_HORN_DELAY_MS = 1500;
/** logistics lead: the cart leaves as soon as a stack has this many crates (without lead: RATE.cartCrates) */
export const LEAD_CART_MIN_CRATES = 2;
export const leadDef = (id: LeadId) => LEADS.find(l => l.id === id)!;

// ------------------------------------------------------------------ Perks (Brief §3.17)
export interface PerkDef {
  id: PerkId;
  max: number;
  /** key cost of level 1..max (brief: 2–6 keys) */
  costs: readonly number[];
  /** effect per level */
  v: number;
}
/**
 * Level-1 costs are 3–4 so that 6–8 keys (casual bot: 4–6 base + 2 for 2★) buy EXACTLY 2 perks (brief) –
 * the three cheapest level-1 perks cost 9.
 */
export const PERKS: readonly PerkDef[] = [
  { id: 'startCapital', max: 3, costs: [3, 5, 6], v: 1000 },  // + v × site factor start coins per level
  { id: 'workshop',     max: 3, costs: [4, 5, 6], v: 0.1 },   // workshop output +10 % per level
  { id: 'offlineCap',   max: 3, costs: [3, 5, 6], v: 1 },     // + 1 h offline cap per level (brief max 3)
  { id: 'ferry',        max: 1, costs: [4],       v: 1 },     // + 1 ferry seat
  { id: 'buildCost',    max: 3, costs: [4, 5, 6], v: 0.05 },  // − 5 % build cost per level
  { id: 'mail',         max: 1, costs: [3],       v: 0.25 },  // daily mail reward + 25 %
] as const;
export const perkDef = (id: PerkId) => PERKS.find(p => p.id === id)!;

// ------------------------------------------------------------------ Sites, inspection targets, completion
export interface SiteDef {
  id: number;
  /** content exists in this build (transfer target); M6 flips site 2 */
  available: boolean;
  /** net income per game day that scores Profit 100 (Brief §3.17 "aus content/sites") */
  profitTarget: number;
  /** cost/income factor 8^(n-1) (Brief §3.8) */
  factor: number;
}
export const SITES: readonly SiteDef[] = [
  { id: 1, available: true,  profitTarget: 1200, factor: 1 },
  { id: 2, available: false, profitTarget: 9600, factor: 8 },
] as const;
export const siteDef = (id: number) => SITES.find(s => s.id === id) ?? SITES[0];
export const siteFactor = (id: number) => siteDef(id).factor;
/**
 * reportGameCompletedPercentage (Brief §3.17 / RULES_CHECK §6, Abweichung 4): percent per first-time passed site.
 * Brief text: +20 % against 5 planned sites. The project decided +50 % against the 2 sites that exist in v1
 * (SDK docs: relative to the content that exists). One constant – set 20 to follow the brief literally.
 */
export const COMPLETION = { percentPerSite: 50 } as const;

// ------------------------------------------------------------------ Clipboard follow-ups (Brief §3.16 "always a current objective")
/** shown as the current objective once all 10 clipboard objectives are done (objectives.ts) */
export const FOLLOWUPS = ['callInspection', 'stars2', 'stars3', 'transfer'] as const;
export type FollowupId = typeof FOLLOWUPS[number];
