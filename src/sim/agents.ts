/** Agents: movement along distance fields, rascal needs, mood, activity choice and room use. */
import { NEEDS, RATE, SENTENCE, levelMult, STAFF_SPEED_PER_LVL, CLEAN, type RoomType } from '../content/balance';
import { energyRefillMult, mealRefillMult, hygieneRefillMult, yardFunMult, reformMult, moodFlatBonus, dirtPerUseMult, workshopMult } from './effects';
import { Ground } from '../content/site1';
import { TICKS_PER_HOUR, UNREACHABLE, type World, type Agent, type Room, type Need, type Trait, type Side } from './types';
import { idx, nextStep, walkable } from './pathfield';
import { field, roomById, emit, isWalled } from './world';
import { hourOf, inMeal, inActivity, isNight, nextHourTick, hoursToTicks, tickMs } from './time';
import { rngNext, rngInt, rngPick, rngChance } from './rng';
import { AF } from './types';

const PER_TICK = 1 / TICKS_PER_HOUR;
export const SPEED = { rascal: 0.3, staff: 0.32, escape: 0.4, crew: 0.3 } as const;

// ------------------------------------------------------------------ spawning
const SPECIES_S1 = ['raccoon', 'weasel'] as const;
const TRAITS: Trait[] = ['sneaky', 'hungry', 'lazy', 'clever', 'grumpy', 'cheerful'];
const NAMES = ['Earl', 'Mabel', 'Otis', 'Hazel', 'Rufus', 'Pippa', 'Clem', 'Dot', 'Barnaby', 'Wren', 'Gus', 'Tilly', 'Fitz', 'Nell', 'Archie', 'Juno', 'Percy', 'Mo', 'Ivy', 'Bert', 'Lulu', 'Ned', 'Olive', 'Cyril'];

export function baseAgent(w: World, kind: Agent['kind'], x: number, y: number): Agent {
  return {
    id: w.nextId++, kind, x, y, dir: 'S', tx: x, ty: y, field: '', speed: SPEED.rascal, moving: false,
    lastDist: UNREACHABLE, stuckMs: 0,
    state: 'idle', act: null, needs: { hunger: 80, energy: 80, hygiene: 80, fun: 80 }, reform: 0, sentence: 0,
    bed: 0, bedSlot: -1, traits: [], mood: 60, arrivedRtMs: w.rtMs, stateMs: w.rtMs,
    species: 'raccoon', name: '', crime: 0, caseNo: 0, look: 0, security: 'low', flags: 0,
  };
}

export function spawnRascal(w: World, x: number, y: number, opts: { earl?: boolean; vip?: boolean } = {}): Agent {
  const a = baseAgent(w, opts.vip ? 'vip' : 'rascal', x, y);
  const n = w.stats.arrived;
  a.species = opts.earl ? 'raccoon' : opts.vip ? 'cat' : rngPick(w, SPECIES_S1);
  a.name = opts.earl ? 'Earl' : opts.vip ? 'Cat Burglar' : NAMES[(n * 7 + rngInt(w, 0, 3)) % NAMES.length];
  const [lo, hi] = n < SENTENCE.firstFerry ? SENTENCE.firstFerryRange : n < SENTENCE.earlyCount ? SENTENCE.early : SENTENCE.normal;
  a.sentence = opts.earl ? SENTENCE.earl : opts.vip ? SENTENCE.vip : rngInt(w, lo, hi);
  a.crime = rngInt(w, 0, 63); a.caseNo = 1000 + rngInt(w, 0, 8999); a.look = rngInt(w, 0, 1 << 20);
  // G2 hook (docs/G2_FEEDBACK.md): Earl's file is the cake joke his release line pays off; the second passenger of the
  // first ferry is the petty offender (short sentence) who gives the second release at ~2:40 instead of ~5:20.
  // Set after the normal draws, so the RNG sequence is unchanged.
  if (opts.earl) a.crime = SENTENCE.earlCrime;
  else if (!opts.vip && n === SENTENCE.pettyIndex) { a.sentence = SENTENCE.petty; a.crime = SENTENCE.pettyCrime; }
  else if (!opts.vip && n === SENTENCE.thirdIndex) { const [l, h] = SENTENCE.firstFerryRange, [l3, h3] = SENTENCE.third; a.sentence = l3 + Math.round((a.sentence - l) * (h3 - l3) / (h - l)); }
  a.security = a.sentence > 180 ? 'high' : a.sentence > 130 ? 'mid' : 'low';
  const nt = rngChance(w, 0.4) ? 2 : 1;
  while (a.traits.length < nt) { const t = rngPick(w, TRAITS); if (!a.traits.includes(t)) a.traits.push(t); }
  if (opts.vip) a.traits = ['sneaky'];
  if (opts.earl) { a.traits = ['cheerful']; a.flags |= AF.earl; }
  if (opts.vip) a.flags |= AF.vip;
  for (const k of ['hunger', 'energy', 'fun'] as Need[]) a.needs[k] = 80;
  a.needs.hygiene = NEEDS.arrivalHygiene;
  a.state = 'arriving';
  w.agents.push(a);
  w.stats.arrived++;
  emit(w, 'arrive', { id: a.id });
  return a;
}

// ------------------------------------------------------------------ movement
/** set a destination: follow field `key` to its target tile, then walk straight to (tx,ty) */
export function goTo(a: Agent, key: string, tx: number, ty: number) {
  a.field = key; a.tx = tx; a.ty = ty; a.lastDist = UNREACHABLE; a.stuckMs = 0;
}

/** advance one tick; returns true when the agent has arrived at (tx,ty) */
export function moveAgent(w: World, a: Agent, speed: number): boolean {
  const g = w.grid;
  let px = a.tx, py = a.ty;
  if (a.field) {
    const f = field(w, a.field);
    const ci = idx(Math.floor(a.x), Math.floor(a.y));
    const d = f[ci];
    if (d === 0) a.field = '';
    else if (d === UNREACHABLE) { watchdog(w, a, d); a.moving = false; return false; }
    else {
      const ni = nextStep(g, f, ci);
      if (ni < 0) { watchdog(w, a, d); a.moving = false; return false; }
      // one agent per door tile per tick
      if (isDoorTile(w, ni)) {
        const res = w.cache.doorRes;
        if (res[ni] !== 0 && res[ni] !== a.id) { a.moving = false; watchdog(w, a, d); return false; }
        res[ni] = a.id;
      }
      px = (ni % g.w) + 0.5; py = Math.floor(ni / g.w) + 0.5;
      watchdog(w, a, d);
    }
  }
  const dx = px - a.x, dy = py - a.y, dist = Math.hypot(dx, dy);
  if (dist <= speed) { a.x = px; a.y = py; } else { a.x += (dx / dist) * speed; a.y += (dy / dist) * speed; }
  if (dist > 1e-4) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
  a.moving = dist > 1e-4;
  if (!a.field && Math.hypot(a.tx - a.x, a.ty - a.y) < 0.02) { a.moving = false; return true; }
  return false;
}

function isDoorTile(w: World, i: number): boolean {
  const g = w.grid;
  const ri = g.roomAt[i];
  if (ri) { const r = w.rooms[ri - 1]; const x = i % g.w, y = (i / g.w) | 0; return (r.door.x === x && r.door.y === y) || r.links.some(l => l.x === x && l.y === y); }
  return false;
}

/** 8 s without progress → re-path (drop cached field), 15 s → teleport (Brief §9.5) */
function watchdog(w: World, a: Agent, d: number) {
  if (d < a.lastDist) { a.lastDist = d; a.stuckMs = 0; return; }
  a.stuckMs += tickMs(w.t);
  if (a.stuckMs >= 8000 && a.stuckMs - tickMs(w.t) < 8000) { w.cache.fields.delete(a.field); emit(w, 'stuck', { id: a.id }); }
  if (a.stuckMs >= 15000) teleportNear(w, a);
}
export function teleportNear(w: World, a: Agent) {
  const g = w.grid;
  const f = a.field ? field(w, a.field) : null;
  // nearest reachable tile to the target (or any walkable tile next to the current one)
  let best = -1, bd = Infinity;
  const tx = Math.floor(a.tx), ty = Math.floor(a.ty);
  for (let i = 0; i < g.w * g.h; i++) {
    if (!walkable(g, i)) continue;
    if (f && f[i] === UNREACHABLE) continue;
    const x = i % g.w, y = (i / g.w) | 0;
    const dd = (x - tx) ** 2 + (y - ty) ** 2;
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best >= 0) { a.x = (best % g.w) + 0.5; a.y = Math.floor(best / g.w) + 0.5; }
  a.stuckMs = 0; a.lastDist = UNREACHABLE;
  w.stats.teleports++;
  emit(w, 'teleport', { id: a.id });
}

// ------------------------------------------------------------------ needs & mood
const NEED_ROOM: Record<Need, RoomType> = { hunger: 'canteen', energy: 'bunk', hygiene: 'wash', fun: 'yard' };
export const needActive = (w: World, n: Need) => !!w.unlocked[NEED_ROOM[n]];

export function decayNeeds(w: World, a: Agent) {
  const night = isNight(w.t);
  for (const n of ['hunger', 'energy', 'hygiene', 'fun'] as Need[]) {
    if (!needActive(w, n)) { a.needs[n] = NEEDS.lockedValue; continue; }
    let d = NEEDS[n].decay;
    if (n === 'hunger' && a.traits.includes('hungry')) d *= 1.6;
    if (night && n !== 'energy') d *= 0.5;
    if (n === 'energy' && a.act?.kind === 'sleep' && a.state === 'using') continue;
    a.needs[n] = Math.max(0, a.needs[n] - d * PER_TICK);
  }
}

export function computeMood(w: World, a: Agent, auraAt: (x: number, y: number) => number): number {
  const N = a.needs, Wt = NEEDS.moodWeights;
  let m = N.hunger * Wt.hunger + N.energy * Wt.energy + N.hygiene * Wt.hygiene + N.fun * Wt.fun;
  m += auraAt(a.x, a.y) + moodFlatBonus(w);
  if (a.traits.includes('grumpy')) m -= 10;
  if (a.state === 'waitingDock') m -= 10;
  if (a.act && a.state === 'using') { const r = roomById(w, a.act.roomId); if (r && r.clean < CLEAN.dirtyBelow) m -= 6; }
  return Math.max(0, Math.min(100, m));
}

// ------------------------------------------------------------------ room access
export function staffIn(w: World, r: Room, role: string) {
  return w.agents.filter(s => s.kind === 'staff' && s.role === role && s.roomId === r.id);
}
/** slots of a room that may be used now (staff capacity, opening hours, blocked) */
export function openSlots(w: World, r: Room): number {
  if (!r.built || !r.reachable || r.blockedUntilMs > w.rtMs) return 0;
  const h = hourOf(w.t);
  switch (r.type) {
    // the kitchen serves everyone already in line when the meal window closes (balance pass M5: with 1-h windows of 7.5 s
    // real time the line was sent away hungry – Ø hunger 12–25 at 24+ rascals although the Flow Bar showed spare meals)
    case 'canteen': { if (!inMeal(h) && !r.queueUsers.length) return 0; const cooks = staffIn(w, r, 'cook').length; return Math.min(r.slots.length, cooks * 8); }
    case 'classroom': { if (!inActivity(h)) return 0; const t = staffIn(w, r, 'teacher').length; return Math.min(r.slots.length, t * 10); }
    case 'workshop': return inActivity(h) ? r.slots.length : 0;
    case 'yard': return h >= 8 && h < 22 ? r.slots.length : 0;
    default: return r.slots.length;
  }
}
export function staffFactor(w: World, r: Room, role: string) {
  const s = staffIn(w, r, role);
  if (!s.length) return 1;
  const lvl = s.reduce((acc, x) => acc + (x.staffLevel ?? 1), 0) / s.length;
  return (1 + STAFF_SPEED_PER_LVL * (lvl - 1)) * (w.t < w.unpaidUntilT ? 0.7 : 1);
}

/** reserve the first free usable slot of room r; returns slot index or -1 */
export function reserveSlot(w: World, r: Room, a: Agent): number {
  const n = openSlots(w, r);
  for (let i = 0; i < n; i++) if (r.slotUser[i] === 0) { r.slotUser[i] = a.id; return i; }
  return -1;
}
export function releaseSlot(w: World, a: Agent) {
  const act = a.act; if (!act) return;
  const r = roomById(w, act.roomId); if (!r) return;
  if (act.slot >= 0 && r.slotUser[act.slot] === a.id) r.slotUser[act.slot] = 0;
  const qi = r.queueUsers.indexOf(a.id); if (qi >= 0) r.queueUsers.splice(qi, 1);
}

// ------------------------------------------------------------------ activity choice
const roomsUsable = (w: World, type: RoomType) => w.rooms.filter(r => r.type === type && r.built && r.reachable && r.blockedUntilMs <= w.rtMs);

function pickRoom(w: World, a: Agent, type: RoomType): Room | null {
  // nearest room (by field distance from the agent tile) with a free slot, else with queue space
  let best: Room | null = null, bd = Infinity, bestQ: Room | null = null, bq = Infinity;
  const ci = idx(Math.floor(a.x), Math.floor(a.y));
  for (const r of roomsUsable(w, type)) {
    const n = openSlots(w, r); if (!n) continue;
    const d = field(w, '#' + r.id)[ci];
    if (d === UNREACHABLE) continue;
    let free = false; for (let i = 0; i < n; i++) if (r.slotUser[i] === 0) { free = true; break; }
    if (free && d < bd) { bd = d; best = r; }
    if (!free && r.queueUsers.length < r.queue.length && d < bq) { bq = d; bestQ = r; }
  }
  return best ?? bestQ;
}

type Kind = NonNullable<Agent['act']>['kind'];
const KIND_ROOM: Partial<Record<Kind, RoomType>> = { eat: 'canteen', shower: 'wash', class: 'classroom', work: 'workshop', yard: 'yard', sleep: 'bunk' };

/** try to start activity `kind`; returns true if started (walking/queued) */
function start(w: World, a: Agent, kind: Kind): boolean {
  if (kind === 'sleep') {
    const r = roomById(w, a.bed);
    if (!r || a.bedSlot < 0 || a.bedSlot >= r.slots.length) { a.bed = 0; a.bedSlot = -1; return false; }
    a.act = { kind, roomId: r.id, slot: a.bedSlot, untilT: 0 };
    const s = r.slots[a.bedSlot]; goTo(a, '#' + r.id, r.x + s.x, r.y + s.y);
    setState(w, a, 'walking'); return true;
  }
  const type = KIND_ROOM[kind]!;
  const r = pickRoom(w, a, type); if (!r) return false;
  const slot = reserveSlot(w, r, a);
  a.act = { kind, roomId: r.id, slot, untilT: 0 };
  if (slot >= 0) { const s = r.slots[slot]; goTo(a, '#' + r.id, r.x + s.x, r.y + s.y); }
  else { r.queueUsers.push(a.id); const q = r.queue[r.queueUsers.length - 1]; goTo(a, '#' + r.id, r.x + q.x + 0.5, r.y + q.y + 0.5); }
  setState(w, a, 'walking');
  return true;
}

export function setState(w: World, a: Agent, s: Agent['state']) { a.state = s; a.stateMs = w.rtMs; }

export function chooseActivity(w: World, a: Agent) {
  const h = hourOf(w.t), N = a.needs;
  // reformed → gate
  if (a.reform >= a.sentence && a.sentence > 0) { toGate(w, a); return; }
  if (isNight(w.t) || h >= 21.5) { if (start(w, a, 'sleep')) return; }
  if (inMeal(h) && N.hunger < 85) {
    if (start(w, a, 'eat')) return;
    // canteen full (4 seats + 1 waiting tile): a hungry rascal waits by the canteen and tries again shortly instead of
    // leaving for a 2-h class/work block and missing the meal (balance pass M5, docs/BALANCE.md §7)
    if (N.hunger < MEAL_WAIT_BELOW && waitForMeal(w, a)) return;
  }
  // most urgent unlocked need below the seek threshold
  const urgent = (['hygiene', 'fun', 'hunger'] as Need[]).filter(n => needActive(w, n) && N[n] < NEEDS.seekBelow).sort((x, y) => N[x] - N[y]);
  for (const n of urgent) {
    if (n === 'hygiene' && start(w, a, 'shower')) return;
    if (n === 'fun' && start(w, a, 'yard')) return;
    if (n === 'hunger' && inMeal(h) && start(w, a, 'eat')) return;
  }
  if (inActivity(h)) {
    if (start(w, a, 'class')) return;
    if (start(w, a, 'work')) return;
  }
  if (needActive(w, 'fun') && N.fun < 90 && start(w, a, 'yard')) return;
  if (N.hygiene < 70 && start(w, a, 'shower')) return;
  hang(w, a);
}

/** a hungry rascal waits near the nearest open canteen for a short while (then chooses again) */
const MEAL_WAIT_BELOW = 70;
const MEAL_WAIT_H = 0.2;
function waitForMeal(w: World, a: Agent): boolean {
  const ci = idx(Math.floor(a.x), Math.floor(a.y));
  let best: Room | null = null, bd = Infinity;
  for (const r of roomsUsable(w, 'canteen')) {
    if (!openSlots(w, r)) continue;
    const d = field(w, '#' + r.id)[ci];
    if (d !== UNREACHABLE && d < bd) { bd = d; best = r; }
  }
  if (!best) return false;
  const g = w.grid, dx = best.door.side === 'S' ? 0 : best.door.side === 'N' ? 0 : best.door.side === 'E' ? 1.5 : -1.5;
  const dy = best.door.side === 'S' ? 1.5 : best.door.side === 'N' ? -1.5 : 0;
  let x = best.door.x + 0.5 + dx, y = best.door.y + 0.5 + dy;
  for (let k = 0; k < 6; k++) {
    const ox = x + (rngNext(w) - 0.5) * 2.4, oy = y + (rngNext(w) - 0.5) * 1.2;
    const i = idx(Math.floor(ox), Math.floor(oy));
    if (ox > 0 && oy > 0 && ox < g.w && oy < g.h && walkable(g, i) && !g.roomAt[i] && g.ground[i] !== Ground.Water) { x = ox; y = oy; break; }
  }
  a.act = { kind: 'hang', roomId: 0, slot: -1, untilT: w.t + hoursToTicks(MEAL_WAIT_H) };
  goTo(a, `t:${Math.floor(x)},${Math.floor(y)}`, x, y);
  setState(w, a, 'walking');
  return true;
}

/** loiter near the bunk door / on the path for a short while */
function hang(w: World, a: Agent) {
  const r = roomById(w, a.bed);
  const g = w.grid;
  let x = 12.5, y = 16.5;
  if (r) { x = r.door.x + 0.5; y = r.door.y + 1.5 + (r.door.side === 'S' ? 0.6 : -2.2); }
  // a few deterministic offsets, kept on walkable tiles
  for (let k = 0; k < 6; k++) {
    const ox = x + (rngNext(w) - 0.5) * 3, oy = y + (rngNext(w) - 0.5) * 1.6;
    const i = idx(Math.floor(ox), Math.floor(oy));
    if (ox > 0 && oy > 0 && ox < g.w && oy < g.h && walkable(g, i) && !g.roomAt[i] && g.ground[i] !== Ground.Water) { x = ox; y = oy; break; }
  }
  a.act = { kind: 'hang', roomId: 0, slot: -1, untilT: w.t + hoursToTicks(0.5 + rngNext(w) * 0.5) };
  goTo(a, `t:${Math.floor(x)},${Math.floor(y)}`, x, y);
  setState(w, a, 'walking');
}

export function toGate(w: World, a: Agent) {
  releaseSlot(w, a);
  a.act = { kind: 'gate', roomId: 0, slot: -1, untilT: 0 };
  const q = w.poi.gateQueue[Math.min(w.poi.gateQueue.length - 1, w.agents.filter(o => o.state === 'toGate' || o.state === 'atGate').length)];
  goTo(a, `t:${Math.floor(q.x)},${Math.floor(q.y)}`, q.x, q.y);
  setState(w, a, 'toGate');
}

// ------------------------------------------------------------------ per-tick rascal update
export function rascalTick(w: World, a: Agent, ctx: { mf: (a: Agent) => number; noiseBunks: Set<number> }) {
  decayNeeds(w, a);
  // passive reform (Brief §3.10 +0.5/h at mood ≥ 70) counts the activity hours 08–20 only, like class and work: good
  // conduct during the day, not while asleep (balance pass M5, docs/BALANCE.md §7 – an idle prison released itself)
  if (a.bed && a.mood >= RATE.reformPassiveMood && a.state !== 'leaving' && inActivity(hourOf(w.t))) a.reform += RATE.reformPassive * ctx.mf(a) * (a.traits.includes('clever') ? 1.4 : 1) * PER_TICK;
  switch (a.state) {
    case 'waitingDock': moveAgent(w, a, SPEED.rascal); break;
    case 'arriving': case 'idle':
      chooseActivity(w, a);
      // passive reform is applied below for every resident
      break;
    case 'walking': {
      if (moveAgent(w, a, SPEED.rascal)) arrive(w, a);
      break;
    }
    case 'queued': {
      // slot assignment happens in promoteQueue; give up after 20 s or when the room closed
      const r = a.act ? roomById(w, a.act.roomId) : undefined;
      if (!r || openSlots(w, r) === 0 || w.rtMs - a.stateMs > 20000) { releaseSlot(w, a); a.act = null; setState(w, a, 'idle'); }
      break;
    }
    case 'using': useTick(w, a, ctx); break;
    case 'toGate': if (moveAgent(w, a, SPEED.rascal)) setState(w, a, 'atGate'); break;
    case 'atGate': break;
    case 'leaving': if (moveAgent(w, a, SPEED.rascal)) a.flags |= AF.gone; break; // removed by sim
    default: break;
  }
}

function arrive(w: World, a: Agent) {
  const act = a.act;
  if (!act) { setState(w, a, 'idle'); return; }
  if (act.kind === 'hang') { setState(w, a, 'using'); return; }
  const r = roomById(w, act.roomId);
  if (!r) { a.act = null; setState(w, a, 'idle'); return; }
  if (act.slot < 0) { setState(w, a, 'queued'); return; }
  const s = r.slots[act.slot]; a.dir = s.dir as Side;
  const tp = throughput(w, r);
  const dur = act.kind === 'eat' || act.kind === 'shower' ? hoursToTicks(0.5 / tp)
    : act.kind === 'class' || act.kind === 'work' ? hoursToTicks(2)
    : act.kind === 'yard' ? hoursToTicks(1.5)
    : act.kind === 'sleep' ? sleepTicks(w.t) : hoursToTicks(0.5);
  // blocks end when the room closes: workshop/class 20:00, yard 22:00 (review finding)
  const close = act.kind === 'work' || act.kind === 'class' ? 20 : act.kind === 'yard' ? 22 : -1;
  let until = w.t + Math.max(1, dur);
  if (close > 0) until = Math.min(until, nextHourTick(w.t, close));
  act.untilT = until;
  r.usesToday++; r.moodSumToday += a.mood;
  // Ø walk for the room panel (tenths of real seconds at 1x)
  r.walkTicksSum += Math.round((w.rtMs - a.stateMs) / 100); r.walkSamples++;
  if (r.walkSamples > 400) { r.walkTicksSum = Math.round(r.walkTicksSum / 2); r.walkSamples = 200; }
  r.clean = Math.max(0, r.clean - (w.unlocked.janitorClean ? CLEAN.perUseAfterJanitorUnlock : CLEAN.perUse) * (w.tutorial.done ? 1 : 0) * dirtPerUseMult(w));
  setState(w, a, 'using');
}

/** sleep until 06:00 – but never into the next day when the bed is reached after 06:00 (night skip) */
function sleepTicks(t: number) {
  const h = hourOf(t);
  if (h >= 6 && h < 21.5) return 1;
  return nextHourTick(t, 6) - t;
}

export function throughput(w: World, r: Room): number {
  const role = r.type === 'canteen' ? 'cook' : r.type === 'classroom' ? 'teacher' : r.type === 'workshop' ? 'foreman' : '';
  return levelMult(r.level) * (role ? staffFactor(w, r, role) : 1);
}

function useTick(w: World, a: Agent, ctx: { mf: (a: Agent) => number; noiseBunks: Set<number> }) {
  const act = a.act!;
  const r = act.roomId ? roomById(w, act.roomId) : undefined;
  const mf = ctx.mf(a);
  const clever = a.traits.includes('clever') ? 1.4 : 1;
  switch (act.kind) {
    case 'class': a.reform += RATE.reformClass * levelMult(r!.level) * staffFactor(w, r!, 'teacher') * mf * clever * PER_TICK * reformMult(w); break;
    case 'work': {
      a.reform += RATE.reformWorkshop * mf * clever * PER_TICK * reformMult(w);
      const foremen = staffIn(w, r!, 'foreman').length;
      const sup = act.slot < foremen * 4 ? 1 : RATE.workshopNoForemanFactor;
      const lazy = a.traits.includes('lazy') ? 0.7 : 1;
      r!.stack += RATE.workshopCratesPerStation * levelMult(r!.level) * staffFactor(w, r!, 'foreman') * sup * mf * lazy * PER_TICK * workshopMult(w);
      break;
    }
    case 'yard': a.needs.fun = Math.min(100, a.needs.fun + NEEDS.fun.refillPerHourInYard * PER_TICK * yardFunMult(w)); break;
    case 'sleep': {
      const noise = ctx.noiseBunks.has(r!.id) ? 0.8 : 1;
      a.needs.energy = Math.min(100, a.needs.energy + NEEDS.energy.refillPerHourInBed * levelMult(r!.level) * noise * PER_TICK * energyRefillMult(w));
      break;
    }
  }
  if (a.reform >= a.sentence && a.sentence > 0 && act.kind !== 'sleep' && act.kind !== 'eat') { finish(w, a); return; }
  // a critical need only interrupts the block if it can be fixed right now (else the rascal would loop walk → abort → walk)
  const low = (a.needs.hunger < NEEDS.alarmBelow && inMeal(hourOf(w.t)) && canFix(w, 'canteen'))
    || (a.needs.hygiene < NEEDS.alarmBelow && canFix(w, 'wash'))
    || (needActive(w, 'fun') && a.needs.fun < NEEDS.alarmBelow && act.kind !== 'yard' && canFix(w, 'yard'));
  const blockKind = act.kind === 'class' || act.kind === 'work' || act.kind === 'yard' || act.kind === 'hang';
  // lunch bell: a meal window opens and the rascal is peckish → leave the block and go eat
  const h = hourOf(w.t), hPrev = hourOf(w.t - 1);
  const bell = blockKind && inMeal(h) && !inMeal(hPrev) && a.needs.hunger < 85;
  if (w.t >= act.untilT || (blockKind && low) || bell || (r && r.blockedUntilMs > w.rtMs)) finish(w, a);
}

/** is there a usable room of this type with a free slot right now? */
function canFix(w: World, type: RoomType): boolean {
  for (const r of roomsUsable(w, type)) { const n = openSlots(w, r); for (let i = 0; i < n; i++) if (r.slotUser[i] === 0) return true; }
  return false;
}

function finish(w: World, a: Agent) {
  const act = a.act!;
  const r = act.roomId ? roomById(w, act.roomId) : undefined;
  if (act.kind === 'eat' && w.t >= act.untilT) a.needs.hunger = Math.min(100, a.needs.hunger + NEEDS.hunger.refill * mealRefillMult(w));
  if (act.kind === 'shower' && w.t >= act.untilT) {
    const dirty = r && r.clean < CLEAN.dirtyBelow ? 0.6 : 1;
    a.needs.hygiene = Math.min(100, a.needs.hygiene + NEEDS.hygiene.refill * dirty * hygieneRefillMult(w));
    // tutorial script: Earl is reformed right after his first shower (Brief §4.2)
    if (a.flags & AF.earl && !(a.flags & AF.celebrated)) { a.reform = a.sentence; a.flags |= AF.celebrated; }
  }
  if (act.kind !== 'sleep') releaseSlot(w, a);
  if (r) promoteQueue(w, r);
  a.act = act.kind === 'sleep' ? null : null;
  setState(w, a, 'idle');
}

/** hand freed slots to the first in the queue */
export function promoteQueue(w: World, r: Room) {
  if (!r.queueUsers.length) return;
  const n = openSlots(w, r);
  for (let i = 0; i < n && r.queueUsers.length; i++) {
    if (r.slotUser[i] !== 0) continue;
    const id = r.queueUsers.shift()!;
    const q = w.agents.find(x => x.id === id);
    if (!q || !q.act) continue;
    r.slotUser[i] = q.id; q.act.slot = i;
    const s = r.slots[i]; goTo(q, '#' + r.id, r.x + s.x, r.y + s.y);
    setState(w, q, 'walking');
  }
  // move remaining queue members up
  r.queueUsers.forEach((id, k) => { const q = w.agents.find(x => x.id === id); const t = r.queue[k]; if (q && t && q.state === 'queued') { goTo(q, '#' + r.id, r.x + t.x + 0.5, r.y + t.y + 0.5); setState(w, q, 'walking'); } });
}

export const rascals = (w: World) => w.agents.filter(a => a.kind === 'rascal' || a.kind === 'vip');
/** rascal with an assigned bed (counts for board, flow bar, invariants) */
export const isResident = (a: Agent) => (a.kind === 'rascal' || a.kind === 'vip') && a.bed > 0;
export { isWalled };
void rngChance;
