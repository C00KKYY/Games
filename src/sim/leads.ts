/**
 * Department leads in the Warden's Office (Brief §3.11, docs/M5_DESIGN.md §3). Owner: sim-progress.
 * Site 1: 2 slots (slot 1 from 3★, slot 2 from 4★); leads Intake (automates the ferry horn) and Logistics
 * (automates the crate stack: the cart leaves at LEAD_CART_MIN_CRATES). Each lead adds +10 pp offline efficiency
 * (effects.ts offlineEff). Wages are paid at midnight with the staff (sim.ts onMidnight → leadWages).
 */
import { LEADS, LEAD_SLOT_STARS, LEAD_HORN_DELAY_MS, leadDef } from '../content/progress';
import type { World, CommandResult, LeadId } from './types';
import { emit, spend, starsOf } from './world';
import { leadHired } from './effects';

/** stars needed for slot k on the current site (Infinity when the site has no such slot) */
export const slotStars = (w: World, k: number) => LEAD_SLOT_STARS[w.site]?.[k] ?? Infinity;
/** open once its star level was reached on this run (stays open if escapes push the Ruf down; objectives.ts sets supSlot1/2) */
export const slotOpen = (w: World, k: number) => starsOf(w.ruf) >= slotStars(w, k) || (w.site === 1 && !!w.unlocked[`supSlot${k + 1}`]);
/** leads offered on the current site */
export const leadsForSite = (w: World) => LEADS.filter(l => l.site <= w.site);

/** data for the hire dialog ("You tapped 34 times today. From now on, Olli handles it.") */
export function hireInfo(w: World, id: LeadId) {
  const def = leadDef(id);
  const today = def.grip === 'horn' ? w.taps.horn : w.taps.crates;
  const total = def.grip === 'horn' ? w.taps.hornTotal : w.taps.cratesTotal;
  return { id, name: def.name, grip: def.grip, fee: def.fee, wage: def.wage, tapsToday: today, tapsTotal: total, hired: leadHired(w, id) };
}

/** cmd.hireLead – reasons: invalid, done (already hired), noSlot (no open free slot), coins */
export function hireLead(w: World, id: LeadId): CommandResult {
  const def = leadsForSite(w).find(l => l.id === id);
  if (!def) return { ok: false, reason: 'invalid' };
  if (leadHired(w, id)) return { ok: false, reason: 'done' };
  const slot = w.leads.slots.findIndex((s, k) => s === null && slotOpen(w, k));
  if (slot < 0) return { ok: false, reason: 'noSlot' };
  if (!spend(w, 'lead', def.fee)) return { ok: false, reason: 'coins', cost: def.fee };
  w.leads.slots[slot] = id;
  w.leads.hiredMs[id] = w.rtMs;
  if (id === 'logistics') w.unlocked.supLogistics = true; // read by staff.ts cartTick and tools/bots.ts
  if (id === 'intake') w.unlocked.supIntake = true;
  emit(w, 'leadHired', { id, slot, taps: def.grip === 'horn' ? w.taps.horn : w.taps.crates });
  return { ok: true, cost: def.fee };
}

/** per tick: the Intake lead taps the honking ferry after a short visible delay */
export function leadsTick(w: World) {
  const f = w.ferry;
  if (f.state === 'arriving' && !f.tapped && leadHired(w, 'intake') && w.rtMs - f.sinceMs >= LEAD_HORN_DELAY_MS) {
    f.tapped = true;
    emit(w, 'leadAutoTap', { id: 'intake', grip: 'horn' });
  }
}

/** wages of all hired leads for one game day */
export const leadWages = (w: World) => w.leads.slots.reduce((s, id) => s + (id ? leadDef(id).wage : 0), 0);
