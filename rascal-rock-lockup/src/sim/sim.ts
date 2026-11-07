/** The tick loop, frame stepper (integer µs accumulator) and the command API (SIM_DESIGN §0, §8; Brief §9.4). */
import { ECON, TIME, TAP_COOLDOWN_SEC, CLEAN, wageFor, boardPerBedHour, moodFactor, STAFF_ROOM, type RoomType, type StaffRole } from '../content/balance';
import { TICKS_PER_HOUR, TICKS_PER_DAY, AF, type World, type CommandResult, type Agent } from './types';
import { createWorld, emit, earn, roomsOf, roomById, rebuild, applyParcels, spend } from './world';
import { rascalTick, computeMood, rascals, setState, isResident, promoteQueue } from './agents';
import { staffTick, cartTick, crewTick, addStaff, defaultRoomFor, staffOf, spawnCrew, hireFee } from './staff';
import { ferryTick, gateTick, scheduleNextFerry } from './ferry';
import { directorTick, dazedTick, catchEscapee, calm } from './director';
import { objectivesTick, onEvent, skipTutorial } from './objectives';
import { build, resize, moveDoor, upgrade, demolish, undoLastBuild, finishConstruction } from './rooms';
import { noisePenalty } from './layout';
import { checkInvariants } from './invariants';
import { hourOf, dayOf, tickMs, isNight } from './time';
import { PARCELS } from '../content/balance';
// ---- M5 (docs/M5_DESIGN.md)
import { projectsTick, startProject } from './projects';
import { leadsTick, hireLead, leadWages } from './leads';
import { inspectionTick, inspectionHour, callInspection, closeInspection } from './inspection';
import { transfer, buyPerk } from './prestige';
import { mailTick, mailOnEvent, claimMail, seeMail } from './mail';
import { vipTick, vipOnDayEnd, vipOnEvent } from './vip';
import { offlineTick, collectOffline } from './offline';
import type { ProjectId, LeadId, PerkId } from './types';

export function newGame(seed = 1, opts: { debug?: boolean; firstSession?: boolean } = {}): World {
  const w = createWorld(seed, opts);
  addStaff(w, 'cook', roomsOf(w, 'canteen')[0].id, true);
  addStaff(w, 'carter', roomsOf(w, 'dock')[0].id, true);
  spawnCrew(w);
  scheduleNextFerry(w);
  w.ferry.nextT = w.t; // the first ferry is already at anchor, honking (Brief §4.2 0:00)
  return w;
}

/** one simulation tick (1/75 game hour) */
export function tick(w: World) {
  const h0 = hourOf(w.t);
  w.rtMs += tickMs(w.t);
  w.t++;
  w.cache.doorRes.fill(0);
  const h1 = hourOf(w.t);
  // ---- hour boundaries
  if (Math.floor(h1) !== Math.floor(h0)) onHour(w, Math.floor(h1));
  // first session: skip the night in the first 5 minutes (Brief §3.2)
  if (w.firstSession && Math.floor(h1) === TIME.nightStartHour && Math.floor(h0) !== TIME.nightStartHour && w.rtMs < 300000) skipNight(w);
  finishConstruction(w);
  ferryTick(w);
  gateTick(w);
  // ---- agents
  const noise = new Set<number>(noisePenalty(w.rooms.filter(r => r.built)).map((n: { bunkId: number }) => n.bunkId));
  const ctx = { mf: (a: Agent) => moodFactor(a.mood), noiseBunks: noise };
  for (const a of w.agents) {
    if (a.kind === 'rascal' || a.kind === 'vip') {
      if (a.state === 'dazed') dazedTick(w, a);
      else if (a.state !== 'escaping' && a.state !== 'brawling') rascalTick(w, a, ctx);
      if ((w.t & 7) === (a.id & 7)) a.mood = computeMood(w, a, aura);
    } else if (a.kind === 'staff') staffTick(w, a);
  }
  crewTick(w);
  cartTick(w);
  directorTick(w);
  objectivesTick(w);
  // ---- M5 systems (each a cheap no-op while inactive)
  projectsTick(w);
  leadsTick(w);
  inspectionTick(w);
  mailTick(w);
  vipTick(w);
  offlineTick(w);
  // ---- remove agents that left the island
  if (w.agents.some(a => a.flags & AF.gone)) w.agents = w.agents.filter(a => !(a.flags & AF.gone));
  // ---- route new events to the tutorial/objective hooks
  flushEvents(w);
  if (w.rtMs >= 60000 * (w.stats.minute.length + 1)) snapshot(w);
  if (w.debug) checkInvariants(w);
}
const aura = () => 0;

/** route not-yet-seen events to the objective/tutorial hooks; called after each tick and each command, and before saving */
export function flushEvents(w: World) {
  const cur = w.cache.evCursor;
  if (w.eventSeq === cur) return;
  const n = Math.min(w.events.length, w.eventSeq - cur);
  const fresh = w.events.slice(w.events.length - n);
  w.cache.evCursor = w.eventSeq;
  for (const e of fresh) { onEvent(w, e.type, e); mailOnEvent(w, e.type, e); vipOnEvent(w, e.type, e); }
  objectivesTick(w);
}

function onHour(w: World, hour: number) {
  // board for assigned beds, per bunk room level (GDD E17)
  for (const r of roomsOf(w, 'bunk')) {
    const n = rascals(w).filter(a => a.bed === r.id).length;
    if (n) earn(w, 'board', n * boardPerBedHour(r.level), { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }
  inspectionHour(w, Math.floor(w.t / TICKS_PER_HOUR));
  if (hour === 0) onMidnight(w);
  if (hour === 6 && !staffOf(w, 'janitor').length) for (const r of w.rooms) r.clean = Math.max(r.clean, CLEAN.nightReset);
}

function onMidnight(w: World) {
  let wages = 0;
  for (const s of staffOf(w)) {
    const role = s.role as StaffRole;
    const own = s.roomId ? roomById(w, s.roomId) : undefined;
    const type: RoomType = STAFF_ROOM[role];
    // pay grade = level of the room the staff member works in; roaming roles use the best room of their type
    const lvl = own && own.type === type ? own.level : Math.max(1, ...roomsOf(w, type).map(r => r.level));
    wages += wageFor(role, lvl);
  }
  wages += leadWages(w);
  if (w.coins >= wages) { spend(w, 'wages', wages); }
  else { spend(w, 'wages', w.coins); w.unpaidUntilT = w.t + TICKS_PER_DAY; emit(w, 'unpaid', { wages }); }
  for (const r of w.rooms) { r.usesToday = 0; r.moodSumToday = 0; }
  emit(w, 'dayEnd', { day: dayOf(w.t) - 1, wages });
  vipOnDayEnd(w, dayOf(w.t) - 1);
}

function skipNight(w: World) {
  const target = (dayOf(w.t) + 1) * TICKS_PER_DAY + 6 * TICKS_PER_HOUR;
  const hours = (target - w.t) / TICKS_PER_HOUR;
  for (const a of rascals(w)) {
    if (!isResident(a)) continue;
    a.needs.energy = Math.min(100, a.needs.energy + hours * 12);
    a.needs.hunger = Math.max(0, a.needs.hunger - hours * 2);
    a.needs.hygiene = Math.max(0, a.needs.hygiene - hours * 1);
    a.needs.fun = Math.max(0, a.needs.fun - hours * 1.5);
  }
  // wages and board of the skipped hours are settled as if the night happened (23:00 … 06:00, clock already moved)
  w.t = target;
  for (let h = 23; h <= 24 + 6; h++) onHour(w, h % 24);
  w.rtMs += 2000; // 2 s fade "Next morning…"
  if (!staffOf(w, 'janitor').length) for (const r of w.rooms) r.clean = Math.max(r.clean, CLEAN.nightReset);
  if (w.ferry.state === 'away') scheduleNextFerry(w);
  emit(w, 'nightSkip');
}

function snapshot(w: World) {
  const rs = rascals(w).filter(isResident);
  w.stats.minute.push({
    m: w.stats.minute.length + 1, life: Math.round(w.stats.lifetimeCoins), coins: Math.round(w.coins), ruf: w.ruf, released: w.stats.released, rascals: rs.length,
    beds: roomsOf(w, 'bunk').reduce((s, r) => s + r.slots.length, 0), mood: rs.length ? Math.round(rs.reduce((s, a) => s + a.mood, 0) / rs.length) : 0,
  });
}

// ------------------------------------------------------------------ frame stepper (Brief §9.4)
export class Stepper {
  /** integer microseconds of 1x-real time not yet simulated */
  accUs = 0;
  ticks = 0;
  /** sub-µs remainder of frame times, so rounding never drifts with the refresh rate (review finding) */
  private fracUs = 0;
  constructor(public w: World) {}
  /** advance by a frame of `frameUs` real microseconds; returns ticks run */
  frame(frameUs: number): number {
    const exact = Math.min(Math.max(0, frameUs), 250000) + this.fracUs;
    const whole = Math.floor(exact);
    this.fracUs = exact - whole;
    this.accUs += whole * this.w.speed;
    let n = 0;
    while (n < TIME.maxTicksPerFrame) {
      const cost = tickMs(this.w.t) * 1000;
      if (this.accUs < cost) break;
      this.accUs -= cost; tick(this.w); n++;
    }
    // spiral-of-death guard: drop what could not be simulated this frame
    if (n === TIME.maxTicksPerFrame) this.accUs = Math.min(this.accUs, tickMs(this.w.t) * 1000);
    this.ticks += n;
    return n;
  }
  /** render interpolation factor 0..1 */
  alpha() { return this.accUs / (tickMs(this.w.t) * 1000); }
}

/** run the sim for `ms` of 1x real time (headless) */
export function runFor(w: World, ms: number, each?: (w: World) => void) {
  const end = w.rtMs + ms;
  while (w.rtMs < end) { tick(w); each?.(w); }
}

// ------------------------------------------------------------------ commands (UI & bots)
export const cmd = {
  build: (w: World, type: RoomType, x: number, y: number, ww: number, hh: number) => logged(w, 'build', [type, x, y, ww, hh], () => build(w, type, x, y, ww, hh)),
  resize: (w: World, id: number, x: number, y: number, ww: number, hh: number) => logged(w, 'resize', [id, x, y, ww, hh], () => resize(w, id, x, y, ww, hh)),
  moveDoor: (w: World, id: number, side: 'N' | 'E' | 'S' | 'W', off: number) => logged(w, 'moveDoor', [id, side, off], () => moveDoor(w, id, side, off)),
  upgrade: (w: World, id: number, n = 1) => logged(w, 'upgrade', [id, n], () => upgrade(w, id, n)),
  demolish: (w: World, id: number) => logged(w, 'demolish', [id], () => demolish(w, id)),
  undo: (w: World) => logged(w, 'undo', [], () => undoLastBuild(w)),
  hire: (w: World, role: StaffRole, roomId?: number) => logged(w, 'hire', [role, roomId], () => {
    if (roomId !== undefined) { const r = roomById(w, roomId); const want = role === 'clerk' ? 'gate' : role === 'carter' ? 'dock' : STAFF_ROOM[role]; if (!r || !r.built || r.type !== want) return { ok: false, reason: 'noRoom' }; }
    const rid = roomId ?? defaultRoomFor(w, role);
    if (!rid && role !== 'janitor' && role !== 'guard') return { ok: false, reason: 'noRoom' };
    if (role === 'guard' && !roomsOf(w, 'guard').some(r => r.built)) return { ok: false, reason: 'noRoom' };
    const a = addStaff(w, role, rid);
    return a ? { ok: true, cost: hireFee(role) } : { ok: false, reason: 'coins', cost: hireFee(role) };
  }),
  buyParcel: (w: World, k: number) => logged(w, 'buyParcel', [k], (): CommandResult => {
    if (k <= 0 || k >= PARCELS.length || w.parcels[k]) return { ok: false, reason: 'invalid' };
    if (!spend(w, 'parcel', PARCELS[k].price)) return { ok: false, reason: 'coins', cost: PARCELS[k].price };
    w.parcels[k] = true; applyParcels(w); rebuild(w);
    emit(w, 'parcel', { k });
    return { ok: true, cost: PARCELS[k].price };
  }),
  tapHorn: (w: World) => logged(w, 'tapHorn', [], (): CommandResult => {
    if (w.ferry.state !== 'arriving') return { ok: false, reason: 'noFerry' };
    if (w.ferry.tapped) return { ok: false, reason: 'cooldown' }; // one counted tap per ferry
    w.ferry.tapped = true; w.stats.horntaps++; w.taps.horn++; w.taps.hornTotal++; emit(w, 'hornTap');
    return { ok: true };
  }),
  tapCrates: (w: World, roomId: number) => logged(w, 'tapCrates', [roomId], (): CommandResult => {
    const last = w.cart.tapMs[roomId] ?? -1e9;
    if (w.rtMs - last < TAP_COOLDOWN_SEC * 1000) return { ok: false, reason: 'cooldown' };
    const r = roomById(w, roomId); if (!r || r.stack < 1) return { ok: false, reason: 'empty' };
    w.cart.tapMs[roomId] = w.rtMs; w.stats.cratetaps++; w.taps.crates++; w.taps.cratesTotal++;
    return { ok: true };
  }),
  tapEscapee: (w: World, id: number) => logged(w, 'tapEscapee', [id], (): CommandResult => {
    const a = w.agents.find(x => x.id === id && x.state === 'escaping');
    if (!a) return { ok: false, reason: 'none' };
    catchEscapee(w, a, 'tap'); return { ok: true };
  }),
  tapRangler: (w: World, id: number) => logged(w, 'tapRangler', [id], (): CommandResult => {
    const a = w.agents.find(x => x.id === id && x.state === 'brawling');
    if (!a) return { ok: false, reason: 'none' };
    calm(w, a, 'tap'); return { ok: true };
  }),
  stamp: (w: World) => logged(w, 'stamp', [], (): CommandResult => {
    if (!w.agents.some(a => a.state === 'atGate')) return { ok: false, reason: 'none' };
    w.director.data.stamped = 1; gateTick(w); return { ok: true };
  }),
  skipTutorial: (w: World) => logged(w, 'skipTutorial', [], (): CommandResult => { skipTutorial(w); return { ok: true }; }),
  setSpeed: (w: World, s: number) => logged(w, 'setSpeed', [s], (): CommandResult => {
    if (s === 3 && !w.unlocked.speed3) return { ok: false, reason: 'locked' };
    if (![0, 1, 2, 3].includes(s)) return { ok: false, reason: 'invalid' };
    w.speed = s; return { ok: true };
  }),
  loan: (w: World) => logged(w, 'loan', [], (): CommandResult => {
    if (w.loan.open) return { ok: false, reason: 'open' };
    const perMin = incomePerMinute(w);
    const amount = Math.max(300, perMin * ECON.loanMinutesIncome);
    w.loan = { amount, open: true }; w.coins += amount; emit(w, 'loan', { amount });
    return { ok: true, cost: -amount };
  }),
  // ---- M5 (docs/M5_DESIGN.md §11) – failure reasons are mapped to i18n in app.ts REASON_KEY
  startProject: (w: World, id: ProjectId) => logged(w, 'startProject', [id], () => startProject(w, id)),
  hireLead: (w: World, id: LeadId) => logged(w, 'hireLead', [id], () => hireLead(w, id)),
  callInspection: (w: World) => logged(w, 'callInspection', [], () => callInspection(w)),
  closeInspection: (w: World) => logged(w, 'closeInspection', [], () => closeInspection(w)),
  transfer: (w: World, toSite: number) => logged(w, 'transfer', [toSite], () => transfer(w, toSite, (seed) => newGame(seed, { firstSession: false, debug: w.debug }))),
  buyPerk: (w: World, id: PerkId) => logged(w, 'buyPerk', [id], () => buyPerk(w, id)),
  seeMail: (w: World) => logged(w, 'seeMail', [], () => seeMail(w)),
  claimMail: (w: World, i: number) => logged(w, 'claimMail', [i], () => claimMail(w, i)),
  collectOffline: (w: World) => logged(w, 'collectOffline', [], () => collectOffline(w)),
};
function logged(w: World, name: string, args: unknown[], fn: () => CommandResult): CommandResult {
  const r = fn();
  flushEvents(w);
  w.log.push({ t: w.t, cmd: name, args });
  if (w.log.length > 4000) w.log.splice(0, 1000);
  emit(w, 'cmd', { name, ok: r.ok, reason: r.reason });
  return r;
}

/** average income per real minute over the last 5 minutes (Brief §3.15) */
export function incomePerMinute(w: World) {
  const m = w.stats.minute; if (m.length < 2) return 0;
  const a = m[Math.max(0, m.length - 6)], b = m[m.length - 1];
  return (b.life - a.life) / Math.max(1, b.m - a.m);
}
export { isNight, setState, promoteQueue };
