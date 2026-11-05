/**
 * Derived gameplay modifiers of finished projects, hired leads and perks (docs/M5_DESIGN.md §1.3).
 * The ONLY place that turns M5 state into numbers – every call site in agents/staff/ferry/director/rooms reads these
 * helpers, never the raw state. Pure functions of World; all neutral (×1 / +0) in a fresh game, so M2–M4 balance is
 * unchanged until something is bought.
 */
import { PROJECTS, PERKS, LEAD_OFFLINE_PP, siteFactor, type ProjectEffect } from '../content/progress';
import { OFFLINE } from '../content/balance';
import type { World, LeadId, PerkId } from './types';

/** summed value of all finished projects with this effect (0 when none) */
export function projectFx(w: World, e: ProjectEffect): number {
  let v = 0;
  const done = w.projects?.done;
  if (!done) return 0;
  for (const p of PROJECTS) if (p.effect === e && done[p.id]) v += p.v;
  return v;
}
export const perkLevel = (w: World, id: PerkId) => w.prestige?.perks?.[id] ?? 0;
const perkV = (w: World, id: PerkId) => perkLevel(w, id) * (PERKS.find(p => p.id === id)?.v ?? 0);
export const leadHired = (w: World, id: LeadId) => !!w.leads?.slots?.includes(id);
export const leadCount = (w: World) => (w.leads?.slots ?? []).filter(Boolean).length;

// ---- multipliers / bonuses used by the sim call sites
export const energyRefillMult = (w: World) => 1 + projectFx(w, 'energyRefill');
export const mealRefillMult = (w: World) => 1 + projectFx(w, 'mealRefill');
export const hygieneRefillMult = (w: World) => 1 + projectFx(w, 'hygieneRefill');
export const yardFunMult = (w: World) => 1 + projectFx(w, 'yardFun');
export const reformMult = (w: World) => 1 + projectFx(w, 'reform');
export const guardRadiusBonus = (w: World) => projectFx(w, 'guardRadius');
export const crateValueMult = (w: World) => 1 + projectFx(w, 'crateValue');
export const cartSpeedMult = (w: World) => 1 + projectFx(w, 'cartSpeed');
export const releaseBountyMult = (w: World) => 1 + projectFx(w, 'releaseBounty');
export const moodFlatBonus = (w: World) => projectFx(w, 'moodFlat');
export const dirtPerUseMult = (w: World) => Math.max(0, 1 - projectFx(w, 'dirtPerUse'));
/** extra ferry seats (also raise the ferry cap): Bigger Ferry project + ferry perk */
export const ferrySeatBonus = (w: World) => projectFx(w, 'ferrySeats') + perkV(w, 'ferry');
/** workshop output (crates per station) */
export const workshopMult = (w: World) => 1 + perkV(w, 'workshop');
/** room build cost (new rooms and resizes) */
export const buildCostMult = (w: World) => Math.max(0, 1 - perkV(w, 'buildCost'));
/** start coins bonus of a fresh site run */
export const startCapitalBonus = (w: World) => perkV(w, 'startCapital') * siteFactor(w.site);
export const mailRewardMult = (w: World) => 1 + perkV(w, 'mail');

// ---- offline (Brief §3.15)
/** 40 % + 10 pp per lead (+ perk effects, none in v1), max 100 % */
export const offlineEff = (w: World) => Math.min(OFFLINE.maxEff, OFFLINE.baseEff + LEAD_OFFLINE_PP * leadCount(w));
/** 2 h + 1 h per offlineCap perk level */
export const offlineCapMs = (w: World) => (OFFLINE.baseCapH + perkV(w, 'offlineCap')) * 3_600_000;
