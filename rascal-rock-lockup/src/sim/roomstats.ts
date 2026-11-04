/** Numbers for the room panel (Brief §3.4, §6.5): throughput per game hour, limiting factor, utilisation, queue, Ø walk. Pure. */
import { RATE, levelMult, ROOMS, UPGRADE, upCost, bulkCost, maxAffordable } from '../content/balance';
import type { World, Room } from './types';
import { openSlots, staffIn, staffFactor } from './agents';

export type Limit = 'seats' | 'staff' | 'level' | 'closed' | 'unbuilt' | 'none';
export interface RoomStats {
  throughput: number;         // uses (or crates / reform points) per game hour
  unit: 'meals' | 'showers' | 'crates' | 'reform' | 'beds' | 'fun' | 'releases' | 'trips' | '';
  limit: Limit;
  slots: number; served: number; used: number;
  queue: number;
  walkSec: number;            // average walk to the room in real seconds at 1x (from arrivals)
  nextMilestone: number | null;
  upgrade: { cost1: number; cost10: number; maxN: number; costMax: number; now: number; next: number };
}

const role = (r: Room) => (r.type === 'canteen' ? 'cook' : r.type === 'classroom' ? 'teacher' : r.type === 'workshop' ? 'foreman' : '');

/** throughput at a given level (for the "12 → 13 / h" preview) */
export function throughputAt(w: World, r: Room, level: number): number {
  const lm = levelMult(level);
  const sf = role(r) ? staffFactor(w, r, role(r)) : 1;
  switch (r.type) {
    case 'canteen': { const seats = Math.min(r.slots.length, staffIn(w, r, 'cook').length * (ROOMS.canteen.perStaff ?? 8)); return seats * RATE.canteenMealsPerSeat * lm * sf; }
    case 'wash': return r.slots.length * 2 * lm;                       // 0.5 h per shower
    case 'workshop': { const st = r.slots.length, sup = Math.min(st, staffIn(w, r, 'foreman').length * 4); return (sup + (st - sup) * RATE.workshopNoForemanFactor) * RATE.workshopCratesPerStation * lm * sf; }
    case 'classroom': { const d = Math.min(r.slots.length, staffIn(w, r, 'teacher').length * 10); return d * RATE.reformClass * lm * sf; }
    case 'bunk': return r.slots.length;
    case 'yard': return r.slots.length * 20 / 1.5 * lm;
    case 'gate': return (3600 / RATE.gateSecPerRelease) / 7.5 * (1 + 0.04 * (level - 1)) / 60; // releases per game hour ≈ 0.6
    case 'dock': return (RATE.cartCrates * lm) / (RATE.cartTripSec / 7.5);
    default: return 0;
  }
}

export function roomStats(w: World, r: Room): RoomStats {
  const unit: RoomStats['unit'] = ({ canteen: 'meals', wash: 'showers', workshop: 'crates', classroom: 'reform', bunk: 'beds', yard: 'fun', gate: 'releases', dock: 'trips' } as Record<string, RoomStats['unit']>)[r.type] ?? '';
  const served = r.built ? openSlots(w, r) : 0;
  const used = r.slotUser.filter(x => x !== 0).length;
  let limit: Limit = 'none';
  if (!r.built) limit = 'unbuilt';
  else if (role(r) && staffIn(w, r, role(r)).length === 0 && r.type !== 'workshop') limit = 'staff';
  else if (served === 0) limit = 'closed';
  else if (role(r) && served < r.slots.length) limit = 'staff';
  else if (r.queueUsers.length > 0 || used >= served) limit = 'seats';
  else limit = 'level';
  const nm = UPGRADE.milestones.find(m => m > r.level) ?? null;
  const maxN = Math.min(UPGRADE.maxLevel - r.level, maxAffordable(r.type, r.level, w.coins));
  return {
    throughput: Math.round(throughputAt(w, r, r.level) * 10) / 10, unit, limit, slots: r.slots.length, served, used,
    queue: r.queueUsers.length,
    walkSec: r.walkSamples ? Math.round((r.walkTicksSum / r.walkSamples) / 10) : 0,
    nextMilestone: nm,
    upgrade: {
      cost1: upCost(r.type, r.level), cost10: bulkCost(r.type, r.level, Math.min(10, UPGRADE.maxLevel - r.level)),
      maxN, costMax: maxN > 0 ? bulkCost(r.type, r.level, maxN) : 0,
      now: Math.round(throughputAt(w, r, r.level) * 10) / 10, next: Math.round(throughputAt(w, r, Math.min(UPGRADE.maxLevel, r.level + 1)) * 10) / 10,
    },
  };
}
