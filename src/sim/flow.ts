/**
 * Flow Bar (Brief §2.2 USP 3): capacity per day of every pipeline stage, the demand it faces and the bottleneck.
 * Pure function of the world → used by the HUD, the "Where's my bottleneck?" button and the bots.
 */
import { RATE, levelMult, NEEDS, type RoomType } from '../content/balance';
import type { World } from './types';
import { roomsOf } from './world';
import { ferrySizeNow, totalBeds } from './ferry';
import { staffIn, rascals, isResident } from './agents';
import { cartCapacity } from './staff';

export type Stage = 'ferry' | 'beds' | 'meals' | 'showers' | 'workshop' | 'class' | 'gate' | 'cart';
export interface StageInfo { stage: Stage; capacity: number; demand: number; ratio: number; roomType: RoomType | null; unlocked: boolean }

const MEAL_HOURS = 3;          // three one-hour windows
const AWAKE_HOURS = 14;        // shower/activity hours per day

export function flow(w: World): { stages: StageInfo[]; bottleneck: Stage | null } {
  const res = rascals(w).filter(isResident).length;
  const pop = Math.max(1, res);
  const built = (t: RoomType) => roomsOf(w, t).filter(r => r.built && r.reachable);
  const out: StageInfo[] = [];
  const add = (stage: Stage, capacity: number, demand: number, roomType: RoomType | null, unlocked = true) =>
    out.push({ stage, capacity: Math.round(capacity * 10) / 10, demand: Math.round(demand * 10) / 10, ratio: demand > 0 ? capacity / demand : Infinity, roomType, unlocked });

  // ferry: arrivals per day vs free beds turning over
  add('ferry', ferrySizeNow(w) * 2, Math.max(1, totalBeds(w) - res + w.agents.filter(a => a.state === 'waitingDock').length), 'dock');
  add('beds', totalBeds(w), res + w.agents.filter(a => a.state === 'waitingDock').length, 'bunk');
  // meals: served seats × meals per window hour × levels, demand = 3 meals per rascal
  let meals = 0;
  for (const r of built('canteen')) { const seats = Math.min(r.slots.length, staffIn(w, r, 'cook').length * 8); meals += seats * MEAL_HOURS * (1 / 0.5) * levelMult(r.level); }
  add('meals', meals, pop * 3, 'canteen');
  let showers = 0;
  for (const r of built('wash')) showers += r.slots.length * AWAKE_HOURS * (1 / 0.5) * levelMult(r.level);
  add('showers', showers, pop * Math.max(1, (NEEDS.hygiene.decay * 24) / NEEDS.hygiene.refill), 'wash', !!w.unlocked.wash);
  // workshop / classroom: places vs rascals wanting an activity (~60 % of the population at a time)
  let stations = 0; for (const r of built('workshop')) stations += r.slots.length;
  let desks = 0; for (const r of built('classroom')) desks += Math.min(r.slots.length, staffIn(w, r, 'teacher').length * 10);
  add('workshop', stations, pop * 0.3, 'workshop', !!w.unlocked.workshop);
  add('class', desks, pop * 0.3, 'classroom', !!w.unlocked.classroom);
  // gate: releases per day the gate could stamp vs reformed rascals per day (rough)
  add('gate', 150 / RATE.gateSecPerRelease, Math.max(0.5, res / 6), 'gate'); // one stamp per 10 s, ~150 s per day
  // cart: crates per day the cart can ship vs crates produced per day
  let crates = 0;
  for (const r of built('workshop')) crates += Math.min(r.slots.length, Math.max(1, staffIn(w, r, 'foreman').length * 4)) * RATE.workshopCratesPerStation * levelMult(r.level) * 12;
  const trips = (150 / RATE.cartTripSec) * 0.8; // ~150 s per day at 1x
  add('cart', trips * cartCapacity(w), crates, 'dock', !!w.unlocked.workshop);

  let worst: StageInfo | null = null;
  for (const s of out) if (s.unlocked && s.demand > 0 && s.ratio < 1 && (!worst || s.ratio < worst.ratio)) worst = s;
  return { stages: out, bottleneck: worst?.stage ?? null };
}
