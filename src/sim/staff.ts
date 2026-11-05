/** Staff behaviour, hiring, the crate cart and the building crew. */
import { WAGES, ECON, RATE, levelMult, STAFF_ROOM, type StaffRole } from '../content/balance';
import { TICKS_PER_HOUR, AF, type World, type Agent, type Room } from './types';
import { baseAgent, goTo, moveAgent, setState, SPEED } from './agents';
import { roomById, emit, earn, spend, roomsOf, isWalled } from './world';
import { cartSpeedMult, crateValueMult } from './effects';
import { LEAD_CART_MIN_CRATES } from '../content/progress';
import { hourOf, isNight } from './time';
import { idx } from './pathfield';
import { rngNext } from './rng';

const PER_TICK = 1 / TICKS_PER_HOUR;

export function staffOf(w: World, role?: StaffRole) { return w.agents.filter(a => a.kind === 'staff' && (!role || a.role === role)); }
export const hireFee = (role: StaffRole) => WAGES[role];

/** create a staff member at the office door and assign to a room */
export function addStaff(w: World, role: StaffRole, roomId: number, free = false): Agent | null {
  if (!free && !spend(w, 'hire', hireFee(role))) return null;
  const o = w.poi.officeDoor;
  const a = baseAgent(w, 'staff', o.x, o.y);
  a.role = role; a.roomId = roomId; a.staffLevel = 1; a.speed = SPEED.staff;
  a.species = role === 'guard' || role === 'janitor' ? 'bulldog' : role === 'cook' || role === 'teacher' ? 'bear' : 'beaver';
  a.name = role; a.state = 'idle';
  w.agents.push(a);
  emit(w, 'hire', { role, roomId, id: a.id });
  return a;
}

/** default room for a role (first room of the matching type), 0 for roaming roles */
export function defaultRoomFor(w: World, role: StaffRole): number {
  if (role === 'clerk') return roomsOf(w, 'gate')[0]?.id ?? 0;
  if (role === 'carter') return roomsOf(w, 'dock')[0]?.id ?? 0;
  const type = STAFF_ROOM[role];
  const rs = roomsOf(w, type).filter(r => r.built);
  // the room with the fewest staff of this role
  let best = 0, bn = Infinity;
  for (const r of rs) { const n = staffOf(w, role).filter(s => s.roomId === r.id).length; if (n < bn) { bn = n; best = r.id; } }
  return best;
}

function postOf(w: World, a: Agent): { key: string; x: number; y: number } | null {
  const r = a.roomId ? roomById(w, a.roomId) : undefined;
  switch (a.role) {
    case 'clerk': return { key: 't:14,21', x: 14.0, y: 21.75 };
    case 'carter': return null; // rides the cart
    case 'guard': {
      // patrol: guard post ↔ yard / main road, switching every ~1.5 game hours
      const posts = roomsOf(w, 'guard'); const yard = roomsOf(w, 'yard')[0];
      const phase = Math.floor(w.t / (TICKS_PER_HOUR * 1.5) + a.id) % 2;
      const p = posts.find(x => x.id === a.roomId) ?? posts[0];
      if (phase === 1 && yard) return { key: '#' + yard.id, x: yard.x + yard.w / 2, y: yard.y + yard.h / 2 };
      if (p) return { key: '#' + p.id, x: p.x + p.w / 2, y: p.y + p.h / 2 };
      return { key: 't:9,20', x: 9.5, y: 20.5 };
    }
    case 'janitor': {
      const target = dirtiest(w) ?? r;
      if (!target) return null;
      a.roomId = target.id;
      return { key: '#' + target.id, x: target.x + target.w / 2, y: target.y + target.h / 2 };
    }
    case 'foreman': {
      if (!r || !r.slots.length) return null;
      const k = Math.floor(w.t / (TICKS_PER_HOUR * 0.4) + a.id) % r.slots.length;
      const s = r.slots[k]; return { key: '#' + r.id, x: r.x + s.x + 0.4, y: r.y + s.y + 0.4 };
    }
    default: {
      if (!r) return null;
      const s = r.staffSpots[0] ?? { x: r.w / 2, y: 0.6 };
      return { key: '#' + r.id, x: r.x + s.x, y: r.y + s.y };
    }
  }
}

function dirtiest(w: World): Room | undefined {
  let best: Room | undefined, bc = 95;
  for (const r of w.rooms) if (isWalled(r) && r.built && r.reachable && r.clean < bc) { bc = r.clean; best = r; }
  return best;
}

export function staffTick(w: World, a: Agent) {
  if (a.role === 'carter') { const c = cartAgent(w); a.x = c.x + 0.3; a.y = c.y - 0.2; a.dir = c.dir; a.moving = c.moving; return; }
  const night = isNight(w.t) && a.role !== 'guard' && a.role !== 'clerk';
  const post = night ? { key: 'officeDoor', x: w.poi.officeDoor.x, y: w.poi.officeDoor.y } : postOf(w, a);
  if (night) a.flags |= AF.offDuty; else a.flags &= ~AF.offDuty;
  if (!post) { a.moving = false; return; }
  if (Math.hypot(post.x - a.tx, post.y - a.ty) > 0.05 || a.state === 'idle') { goTo(a, post.key, post.x, post.y); setState(w, a, 'walking'); }
  if (a.state === 'walking' && moveAgent(w, a, SPEED.staff * (w.t < w.unpaidUntilT ? 0.7 : 1))) setState(w, a, 'using');
  // janitor cleans the room he stands in
  if (a.role === 'janitor' && a.state === 'using') {
    const ri = w.grid.roomAt[idx(Math.floor(a.x), Math.floor(a.y))];
    const r = ri ? w.rooms[ri - 1] : undefined;
    if (r) r.clean = Math.min(100, r.clean + 30 * levelMult(a.staffLevel ?? 1) * PER_TICK * 4);
  }
}

// ------------------------------------------------------------------ cart (an agent of kind 'cart')
const CART_SPEED = 0.18;
export function cartCapacity(w: World) { const d = roomsOf(w, 'dock')[0]; return Math.floor(RATE.cartCrates * levelMult(d?.level ?? 1)); }
export function cartAgent(w: World): Agent {
  let a = w.agents.find(x => x.id === w.cart.id);
  if (!a) { a = baseAgent(w, 'cart', w.poi.depot.x, w.poi.depot.y); a.species = 'cart'; a.name = 'cart'; w.agents.push(a); w.cart.id = a.id; }
  return a;
}

export function cartTick(w: World) {
  const c = w.cart, a = cartAgent(w);
  const carter = staffOf(w, 'carter')[0];
  const sp = CART_SPEED * (w.t < w.unpaidUntilT ? 0.7 : 1) * cartSpeedMult(w);
  const set = (s: typeof c.state) => { c.state = s; c.sinceMs = w.rtMs; };
  switch (c.state) {
    case 'depot': {
      a.moving = false;
      if (!carter) return;
      const auto = w.unlocked.supLogistics ? LEAD_CART_MIN_CRATES : RATE.cartCrates; // logistics lead (leads.ts keeps unlocked.supLogistics in sync)
      let best: Room | undefined;
      for (const r of roomsOf(w, 'workshop')) {
        if (!r.built || !r.reachable || Math.floor(r.stack) < 1) continue;
        const tapped = (c.tapMs[r.id] ?? -1e9) > w.rtMs - 3000;
        if ((r.stack >= auto || tapped) && (!best || r.stack > best.stack)) best = r;
      }
      if (best) {
        const o = outside(best);
        c.roomId = best.id; set('toWorkshop'); goTo(a, `t:${o.x},${o.y}`, o.x + 0.5, o.y + 0.5);
        emit(w, 'cartDepart', { roomId: best.id });
      }
      break;
    }
    case 'toWorkshop': if (moveAgent(w, a, sp)) set('loading'); break;
    case 'loading': {
      a.moving = false;
      if (w.rtMs - c.sinceMs < 1500) break;
      const r = roomById(w, c.roomId);
      const n = r ? Math.min(Math.floor(r.stack), cartCapacity(w)) : 0;
      if (r) r.stack -= n;
      c.load = n; set('toDock'); goTo(a, 'dockSell', w.poi.dockSell.x, w.poi.dockSell.y);
      break;
    }
    case 'toDock': if (moveAgent(w, a, sp)) set('selling'); break;
    case 'selling': {
      a.moving = false;
      if (w.rtMs - c.sinceMs < 1200) break;
      if (c.load > 0) {
        earn(w, 'crates', c.load * ECON.crateValue * crateValueMult(w), { x: a.x, y: a.y });
        w.stats.cratesSold += c.load; emit(w, 'crateSold', { n: c.load });
      }
      c.load = 0; set('return'); goTo(a, 'depot', w.poi.depot.x, w.poi.depot.y);
      break;
    }
    case 'return': if (moveAgent(w, a, sp)) set('depot'); break;
  }
}

/** the walkable tile just outside a room's door */
export function outside(r: Room) {
  const d = r.door;
  return { x: d.x + (d.side === 'E' ? 1 : d.side === 'W' ? -1 : 0), y: d.y + (d.side === 'S' ? 1 : d.side === 'N' ? -1 : 0) };
}

// ------------------------------------------------------------------ building crew
export function crewTick(w: World) {
  const crew = w.agents.filter(a => a.kind === 'crew');
  const site = w.rooms.find(r => !r.built);
  for (const a of crew) {
    const tx = site ? site.x + site.w / 2 + (a.id % 2 ? 0.6 : -0.6) : w.poi.officeDoor.x + (a.id % 2 ? 0.8 : -0.8);
    const ty = site ? site.y + site.h + 0.4 : w.poi.officeDoor.y + 0.4;
    const key = site ? `t:${Math.floor(tx)},${Math.min(w.grid.h - 1, Math.floor(ty))}` : 'officeDoor';
    if (Math.hypot(tx - a.tx, ty - a.ty) > 0.05 || a.state === 'idle') { goTo(a, key, tx, ty); setState(w, a, 'walking'); }
    if (a.state === 'walking' && moveAgent(w, a, SPEED.crew)) setState(w, a, 'using');
  }
}
export function spawnCrew(w: World) {
  for (let k = 0; k < 2; k++) {
    const a = baseAgent(w, 'crew', w.poi.officeDoor.x + k * 0.6, w.poi.officeDoor.y);
    a.species = 'beaver'; a.name = 'crew'; a.speed = SPEED.crew; w.agents.push(a);
  }
}
void rngNext; void hourOf;
