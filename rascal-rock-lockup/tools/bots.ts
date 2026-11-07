/**
 * Balance bots (Brief §4.1): headless players that use the same command API as the UI.
 *  - casual: reaction 3–8 s, 30 % suboptimal purchases, follows the clipboard
 *  - optimal: reaction 1 s, ROI-driven
 *  - naive / random (H2): cheapest-first / random affordable
 * `layout`: 'good' places rooms near their partners, 'random' anywhere valid (H1b).
 */
import { newGame, tick, cmd } from '../src/sim/sim';
import type { World, Room, GradeCat } from '../src/sim/types';
import { roomsOf, starsOf } from '../src/sim/world';
import { validatePlacement } from '../src/sim/rooms';
import { OBJECTIVES, mandatoryDone } from '../src/sim/objectives';
import { totalBeds } from '../src/sim/ferry';
import { staffOf } from '../src/sim/staff';
import { rascals } from '../src/sim/agents';
import { flow } from '../src/sim/flow';
import { roomCost, upCost, ROOMS, PARCELS, STARS, type RoomType, type StaffRole } from '../src/content/balance';
import { TUTORIAL_WASH, PATH_Y } from '../src/content/site1';
import { PROJECTS, LEADS } from '../src/content/progress';
import { projectCard } from '../src/sim/projects';
import { slotOpen } from '../src/sim/leads';
import { inspectionBlock, forecast } from '../src/sim/inspection';
import { leadHired } from '../src/sim/effects';
import { beginSession, syncWall } from '../src/sim/wall';

/** wall clock of a bot session: Monday 2026-01-05 10:00 UTC (no local midnight inside a 45-min run) */
export const BOT_WALL_START = Date.UTC(2026, 0, 5, 10, 0, 0);

export type Profile = 'casual' | 'optimal' | 'naive' | 'random';
export interface BotOpts {
  profile: Profile; seed?: number; layout?: 'good' | 'random'; minutes?: number; skipTutorial?: boolean;
  /**
   * M5 hooks (docs/M5_DESIGN.md §11) for the balance pass – all on by default, `false` turns one off:
   * projects: start Project Board projects · leads: hire department leads · inspect: call the inspection when ready
   * ('ready' = as soon as callable, 'pass' = only when the forecast shows ≥ 1★; default casual 'ready', optimal 'pass') ·
   * improve: after the unlock, buy against the forecast's worst category (the inspector's tip)
   */
  m5?: { projects?: boolean; leads?: boolean; inspect?: false | 'ready' | 'pass'; improve?: boolean };
}

export interface Milestone { key: string; rt: number }
export interface BotReport {
  profile: Profile; layout: string; seed: number;
  milestones: Record<string, number>;
  minutes: World['stats']['minute'];
  income: Record<string, number>; spend: Record<string, number>; rufBy: Record<string, number>;
  idleGaps: number[];      // seconds without affordable purchase or trackable objective
  newThings: number[];     // rt seconds of "something new" (unlock, built, milestone, event, hire)
  /** income/spend/Ruf sources at 15:00 (Brief §3.8: the mix is checked at minute 15 and 30) */
  at15: { income: Record<string, number>; spend: Record<string, number>; rufBy: Record<string, number> } | null;
  /** cumulative Ruf by source at the end of every real minute (Brief §12.9 H1 "Ruf-Quellen pro Minute") */
  rufMin: Record<string, number>[];
  /** §4.3 "no runaway": real seconds in which the coins exceeded the most expensive available purchase (no sink), and
   *  the longest such stretch (a few seconds are the reaction time before buying it) */
  noSinkSec: number; noSinkMax: number;
  /** pressure states (H2): escape attempts (tunnels), food fights, ruckus */
  pressure: { tunnels: number; foodFights: number; ruckus: number };
  /** lifetime coins when the first inspection was called (keys, Brief §3.17); -1 = never */
  lifeAtCall: number;
  final: { coins: number; ruf: number; stars: number; maxStars: number; released: number; rascals: number; beds: number; caught: number; escaped: number; teleports: number; inspectionAt: number };
  world: World;
}

class Rng { constructor(public s: number) {} next() { this.s = (this.s + 0x6d2b79f5) | 0; let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } }

/** per-tick bot brain; usable headless (runBot) and in the browser (?sim&bot=casual) */
export class BotDriver {
  rnd: Rng; nextActMs: number; ms: Record<string, number> = {}; newThings: number[] = []; idleGaps: number[] = [];
  at15: BotReport['at15'] = null; rufMin: Record<string, number>[] = []; noSinkSec = 0; lifeAtCall = -1; maxStars = 0;
  pressure = { tunnels: 0, foodFights: 0, ruckus: 0 }; private lastSec = -1;
  /** wages owed at the day ends (Brief §3.8 Lohnanteil – paid wages hide what a broke bot owes) and unpaid day ends */
  wagesDue = 0; unpaidDays = 0; noSinkRun = 0; noSinkMax = 0;
  private lastSeq = 0; private idleSince = -1; private layout: 'good' | 'random'; private pending: Record<string, number> = {};
  constructor(public w: World, public o: BotOpts) {
    this.rnd = new Rng((o.seed ?? 1) * 7919 + (o.profile === 'casual' ? 1 : 2));
    this.layout = o.layout ?? 'good';
    this.nextActMs = this.react();
  }
  react() { const p = this.o.profile; return p === 'optimal' ? 1000 : p === 'casual' ? 3000 + this.rnd.next() * 5000 : 2000; }
  mark(k: string) { if (this.ms[k] === undefined) this.ms[k] = Math.round(this.w.rtMs / 100) / 10; }
  /** call after every sim tick */
  step() {
    const w = this.w;
    if (w.eventSeq !== this.lastSeq) {
      const n = Math.min(w.events.length, w.eventSeq - this.lastSeq); this.lastSeq = w.eventSeq;
      for (const e of w.events.slice(w.events.length - n)) {
        const t = e.type;
        if (t === 'star') this.mark(`star${e.stars}`);
        if (t === 'release') { this.mark('release1'); if (w.stats.released >= 2 && w.stats.released <= 4) this.mark(`release${w.stats.released}`); }
        if (t === 'tutorialDone') this.mark('tutorialDone');
        if (t === 'built') this.mark(`built:${e.rtype}`);
        if (t === 'milestone') this.mark(`milestone:${roomTypeOf(w, e.roomId as number)}${e.level}`);
        if (t === 'tunnel') { this.mark('tunnel1'); this.pressure.tunnels++; }
        if (t === 'foodFight') { this.mark('foodFight1'); this.pressure.foodFights++; }
        if (t === 'ruckus') this.pressure.ruckus++;
        if (t === 'dayEnd') this.wagesDue += Number(e.wages) || 0;
        if (t === 'unpaid') this.unpaidDays++;
        if (t === 'parcel') this.mark(`parcel${e.k}`);
        if (t === 'unlock') this.mark(`unlock:${e.what}`);
        if (t === 'objective') this.mark(`obj:${e.id}`);
        // M5
        if (t === 'projectStart') { this.mark('project1'); this.mark(`project:${e.id}`); }
        if (t === 'projectDone') this.mark('projectDone1');
        if (t === 'leadHired') { this.mark('lead1'); this.mark(`lead:${e.id}`); }
        if (t === 'mailVisible') this.mark('mailVisible');
        if (t === 'inspectionCalled') { this.mark('inspection1'); if (this.lifeAtCall < 0) this.lifeAtCall = w.stats.lifetimeCoins; }
        if (t === 'inspectionResult') { this.mark('inspectionResult1'); if (e.passed) this.mark('inspectionPassed'); this.mark(`inspStars${e.stars}`); }
        if (['unlock', 'built', 'milestone', 'tunnel', 'foodFight', 'hire', 'objective', 'star', 'release', 'projectStart', 'projectDone', 'leadHired', 'inspectionCalled', 'inspectionResult', 'parcel', 'mailVisible'].includes(t)) this.newThings.push(Math.round(w.rtMs / 1000));
      }
    }
    if (mandatoryDone(w)) this.mark('inspectionReady');
    this.maxStars = Math.max(this.maxStars, starsOf(w.ruf));
    if (!this.at15 && w.rtMs >= 900000) this.at15 = { income: { ...w.stats.income }, spend: { ...w.stats.spend, wagesDue: this.wagesDue }, rufBy: { ...w.stats.rufBy } };
    if (w.rtMs >= 60000 * (this.rufMin.length + 1)) this.rufMin.push({ ...w.stats.rufBy });
    // §4.3 no runaway: once per real second, the coins must stay below the most expensive purchase on offer
    const sec = Math.floor(w.rtMs / 1000);
    if (sec !== this.lastSec) { this.lastSec = sec; if (w.tutorial.done && w.coins > maxOffer(w)) { this.noSinkSec++; this.noSinkRun++; this.noSinkMax = Math.max(this.noSinkMax, this.noSinkRun); } else this.noSinkRun = 0; }
    reflexes(w, this.o.profile, this.rnd, this.pending);
    if (w.rtMs >= this.nextActMs) {
      const acted = m5Decide(w, this.o, this.rnd) || decide(w, this.o.profile, this.rnd, this.layout, !!this.o.skipTutorial, this.o.m5);
      this.nextActMs = w.rtMs + this.react();
      if (!acted && !anyAffordable(w)) { if (this.idleSince < 0) this.idleSince = w.rtMs; }
      else if (this.idleSince >= 0) { this.idleGaps.push((w.rtMs - this.idleSince) / 1000); this.idleSince = -1; }
    }
  }
}

export function runBot(o: BotOpts): BotReport {
  const seed = o.seed ?? 1;
  const w = newGame(seed, { debug: false });
  const bot = new BotDriver(w, o);
  const endMs = (o.minutes ?? 30) * 60000;
  // the app feeds the wall clock once per second (src/app.ts); a fixed local morning keeps the run deterministic
  const wall0 = BOT_WALL_START; beginSession(w, wall0);
  let wallSec = 0;
  while (w.rtMs < endMs) { tick(w); bot.step(); const s = Math.floor(w.rtMs / 1000); if (s !== wallSec) { wallSec = s; syncWall(w, wall0 + w.rtMs); } }
  const beds = totalBeds(w);
  const ms = bot.ms;
  return {
    profile: o.profile, layout: o.layout ?? 'good', seed, milestones: ms, minutes: w.stats.minute,
    income: { ...w.stats.income }, spend: { ...w.stats.spend, wagesDue: bot.wagesDue, unpaidDays: bot.unpaidDays }, rufBy: { ...w.stats.rufBy }, idleGaps: bot.idleGaps, newThings: bot.newThings,
    at15: bot.at15, rufMin: bot.rufMin, noSinkSec: bot.noSinkSec, noSinkMax: bot.noSinkMax, pressure: bot.pressure, lifeAtCall: bot.lifeAtCall,
    final: { coins: Math.round(w.coins), ruf: w.ruf, stars: starsOf(w.ruf), maxStars: bot.maxStars, released: w.stats.released, rascals: rascals(w).length, beds, caught: w.stats.caught, escaped: w.stats.escaped, teleports: w.stats.teleports, inspectionAt: ms.inspectionReady ?? -1 },
    world: w,
  };
}
const roomTypeOf = (w: World, id: number) => w.rooms.find(r => r.id === id)?.type ?? '?';

// ------------------------------------------------------------------ reflexes
function reflexes(w: World, p: Profile, rnd: Rng, pending: Record<string, number>) {
  const delay = (key: string, ms: number) => { if (pending[key] === undefined) pending[key] = w.rtMs + ms; return w.rtMs >= pending[key]; };
  const clear = (key: string) => { delete pending[key]; };
  const rt = p === 'optimal' ? 600 : p === 'casual' ? 1800 + rnd.next() * 2500 : 1500;
  if (w.ferry.state === 'arriving') { if (delay('horn', rt)) { cmd.tapHorn(w); clear('horn'); } } else clear('horn');
  for (const a of w.agents) {
    if (a.state === 'escaping') {
      const key = 'esc' + a.id;
      // the random clicker notices an escapee only every second time (no plan, no attention to the edge arrow)
      if (p === 'random' && pending['seen' + a.id] === undefined) pending['seen' + a.id] = rnd.next() < 0.5 ? 1 : 0;
      if (p === 'random' && !pending['seen' + a.id]) continue;
      // the first (scripted) tunnel has a pointer hint → casual reacts within 2–4 s; later 2.2–8.2 s (may miss)
      const first = w.stats.caught + w.stats.escaped === 0;
      if (delay(key, p === 'optimal' ? 900 : first ? 2000 + rnd.next() * 2000 : 2200 + rnd.next() * 6000)) { cmd.tapEscapee(w, a.id); clear(key); }
    }
    if (a.state === 'brawling') { const key = 'br' + a.id; if (delay(key, p === 'optimal' ? 700 : 1500 + rnd.next() * 3500)) { cmd.tapRangler(w, a.id); clear(key); } }
  }
  if (w.agents.some(a => a.state === 'atGate') && w.tutorial.active) { if (delay('stamp', rt)) { cmd.stamp(w); clear('stamp'); } }
  // crate taps until the logistics supervisor exists (casual taps when it notices ≥ 3)
  if (!w.unlocked.supLogistics) for (const r of roomsOf(w, 'workshop')) {
    const thr = p === 'optimal' ? 2 : 3;
    if (r.stack >= thr && w.cart.state === 'depot') { const key = 'cr' + r.id; if (delay(key, rt)) { cmd.tapCrates(w, r.id); clear(key); } }
  }
}

// ------------------------------------------------------------------ deliberate decisions
function decide(w: World, p: Profile, rnd: Rng, layout: 'good' | 'random', skip: boolean, m5?: BotOpts['m5']): boolean {
  if (w.tutorial.active) {
    if (skip) { cmd.skipTutorial(w); return true; }
    // humans read the bubble and find the pointer: wait in each step (casual 5–9 s, optimal 2 s)
    const key = 'tut' + w.tutorial.step;
    const need = p === 'optimal' ? 3500 + rnd.next() * 1000 : 5000 + rnd.next() * 4000;
    const since = (w as unknown as { __tutSince?: Record<string, number> }).__tutSince ??= {};
    since[key] ??= w.rtMs;
    if (w.rtMs - since[key] < need) return false;
    const st = w.tutorial.step;
    if (st === 1 && !roomsOf(w, 'wash').length) return cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h).ok;
    if (st === 3) return cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, 1).ok;
    return false;
  }
  // the first drag-build after the tutorial: the gesture is shown once, players need a moment (casual 15–30 s, optimal 8 s)
  const td = w.director.data.tutorialEndMs ?? 0;
  const learn = p === 'optimal' ? 8000 : 15000 + (rnd.next() * 15000);
  if (!roomsOf(w, 'workshop').length && w.rtMs - td < learn) return false;
  if (w.coins < 60 && !w.loan.open && cheapestNeeded(w) > w.coins + 200 && w.rtMs > 600000) { cmd.loan(w); }
  if (p === 'random') return randomAction(w, rnd);
  const options = candidates(w, p, layout, rnd, m5);
  const affordable = options.filter(c => c.cost <= w.coins);
  if (!affordable.length) return false;
  let pick = affordable[0];
  // 30 % suboptimal purchases (Brief §4.1) – but not with the coins of the clipboard goal the guide points at: the
  // casual still builds the goal (before, a random upgrade right after the tutorial could leave it without a workshop
  // until ~3:15, a poverty trap of the bot, not of the game)
  if (p === 'casual' && rnd.next() < 0.3) {
    const goal = affordable[0].prio >= 88 ? affordable[0] : null;
    const pool = goal ? affordable.filter(c => c === goal || w.coins - c.cost >= goal.cost) : affordable;
    pick = pool[Math.floor(rnd.next() * pool.length)];
  }
  if (p === 'naive') pick = affordable.slice().sort((a, b) => a.cost - b.cost)[0];
  return pick.run();
}

interface Cand { label: string; cost: number; prio: number; run: () => boolean }

function candidates(w: World, p: Profile, layout: 'good' | 'random', rnd: Rng, m5?: BotOpts['m5']): Cand[] {
  const out: Cand[] = [];
  const add = (label: string, cost: number, prio: number, run: () => boolean) => out.push({ label, cost, prio, run });
  const cur = OBJECTIVES[w.obj.current];
  const built = (t: RoomType) => roomsOf(w, t).filter(r => r.built);
  const hireIf = (role: StaffRole, need: boolean, prio: number) => { if (need) add('hire ' + role, 60, prio, () => cmd.hire(w, role).ok); };
  const want: RoomType[] = [];
  // objective-driven builds
  if (cur?.id === 'workshop' && !roomsOf(w, 'workshop').length) want.push('workshop');
  if (cur?.id === 'classroom' && !roomsOf(w, 'classroom').length) want.push('classroom');
  if (w.unlocked.guard && !roomsOf(w, 'guard').length && (cur?.id === 'guard' || (p === 'optimal' && roomsOf(w, 'classroom').length > 0))) want.push('guard');
  if (w.unlocked.yard && !roomsOf(w, 'yard').length) want.push('yard');
  for (const t of want) {
    const size = { workshop: [4, 4], classroom: [4, 4], guard: [2, 2], yard: [5, 5] }[t as 'workshop'] ?? [ROOMS[t].minW, ROOMS[t].minH];
    const fallback = [ROOMS[t].minW, ROOMS[t].minH];
    add('build ' + t, roomCost(t, size[0], size[1]), 100, () => placeAndBuild(w, t, size[0], size[1], layout, rnd) || placeAndBuild(w, t, fallback[0], fallback[1], layout, rnd));
  }
  // staffing
  for (const r of built('workshop')) hireIf('foreman', staffOf(w, 'foreman').filter(s => s.roomId === r.id).length * 4 < Math.min(r.slots.length, 4), 95);
  for (const r of built('classroom')) hireIf('teacher', !staffOf(w, 'teacher').some(s => s.roomId === r.id), 98);
  if (built('guard').length) hireIf('guard', staffOf(w, 'guard').length < built('guard').length, 90);
  const residents = rascals(w).filter(a => a.bed).length;
  hireIf('cook', staffOf(w, 'cook').length * 8 < Math.min(residents, roomsOf(w, 'canteen').reduce((s, r) => s + r.slots.length, 0)), 85);
  if (w.tutorial.done && built('wash').length && staffOf(w, 'janitor').length < Math.floor(w.rooms.length / 5) && w.rtMs > 480000) hireIf('janitor', true, 50);
  // beds when the dock queue forms or the objective asks
  const waiting = rascals(w).filter(a => a.state === 'waitingDock').length;
  const beds = totalBeds(w);
  // the casual reacts to the dock queue at ~5:00 (pacing §4.2 5:30–6:30); with the goal on the clipboard it saves for it
  // from 4:20 on (the clipboard shows "Saving: n/m"), instead of spending the coins on upgrades and expanding at 6–7 min
  const bedsGoal = cur?.id === 'beds12' || cur?.id === 'beds24';
  const saveOnly = bedsGoal && w.rtMs > 260000 && w.rtMs <= 300000;
  if ((waiting > 0 || bedsGoal) && (w.rtMs > 300000 || saveOnly)) {
    const bunk = roomsOf(w, 'bunk')[0];
    if (bunk && bunk.h < 6) add('expand bunk', saveOnly ? Infinity : ROOMS.bunk.perTile * bunk.w * 3, 92, () => cmd.resize(w, bunk.id, bunk.x, bunk.y - 3, bunk.w, bunk.h + 3).ok || cmd.resize(w, bunk.id, bunk.x, bunk.y, bunk.w, bunk.h + 3).ok || placeAndBuild(w, 'bunk', 6, 3, layout, rnd));
    else add('build bunk', roomCost('bunk', 6, 6), 88, () => placeAndBuild(w, 'bunk', 6, 6, layout, rnd));
  }
  // parcels when space is needed: no room for another 6x3 bunk while rascals wait at the dock → save for land
  const noSpace = !hasSpot(w, 'bunk', 6, 3);
  // …and when the Flow Bar asks for another workshop/classroom/canteen that no longer fits (pacing §4.2 20:00–24:00
  // "Parzelle 3, Layout optimieren"; balance pass M5 – before, only a missing bunk spot made the bot save for land)
  const fb0 = flow(w).bottleneck;
  const roomSqueeze = (fb0 === 'workshop' || fb0 === 'class' || fb0 === 'meals') && w.rtMs > 900000 && !hasSpot(w, 'workshop', 4, 4);
  // from 20:00, with Lv15 done and the first lead hired, the casual's next big goal is more land (the Land card in the
  // Rooms menu; pacing §4.2 20:00–24:00) – it saves for it; inspection improvements (prio ≥ 90) still go first
  const bigGoal = w.rtMs > 1200000 && !!w.obj.done.workshop15 && w.leads.slots.some(x => x !== null);
  for (let k = 1; k < PARCELS.length; k++) if (!w.parcels[k] && w.parcels[k - 1] && (k === 1 ? beds >= 12 && w.rtMs > 600000 : w.rtMs > 1100000)) add('parcel ' + k, PARCELS[k].price, (noSpace && (waiting > 0 || cur?.id === 'beds24')) || roomSqueeze ? 94 : k >= 2 && bigGoal ? 96 : 70 - k * 5, () => cmd.buyParcel(w, k).ok);
  // react to the Flow Bar's red stage (that is what it is for); casual notices it with some delay (reaction already applied)
  const fb = flow(w).bottleneck;
  // stages whose capacity is a level (meals, showers, cart, gate) are fixed by an upgrade; stages whose capacity is a
  // place count (workshop stations, class desks, canteen seats when every seat is served) need another room – the old
  // rule upgraded the workshop/classroom on a red stage, which does not change the number the bar shows, so the bot
  // kept upgrading while 24+ rascals stood around (balance pass M5: Ø mood 35–40 from minute 18, docs/BALANCE.md §7)
  const boost: Partial<Record<string, string>> = { meals: 'canteen', showers: 'wash', cart: 'dock', gate: 'gate' };
  const hot = fb ? boost[fb] : undefined;
  const cookCap = staffOf(w, 'cook').length * 8, seats = roomsOf(w, 'canteen').reduce((s2, r) => s2 + r.slots.length, 0);
  if (fb === 'meals' && cookCap < seats) hireIf('cook', true, 97);
  const capBuild = (t: RoomType, ww: number, hh: number, prio: number) => add('capacity ' + t, roomCost(t, ww, hh), prio, () => placeAndBuild(w, t, ww, hh, layout, rnd) || placeAndBuild(w, t, ROOMS[t].minW, ROOMS[t].minH, layout, rnd));
  if (w.tutorial.done && roomsOf(w, 'workshop').length) {
    // every clearly red stage, not only the worst one; a deep red stage (< 60 %) outranks the clipboard's level goal –
    // the bar is the loudest thing on screen (before, the casual sank 10 min into Workshop Lv15 while 36 rascals starved)
    const st = flow(w).stages;
    const ratio = (k: string) => st.find(x => x.stage === k && x.unlocked)?.ratio ?? Infinity;
    const cp = (r: number) => r < 0.5 ? 92 : 87;
    if (ratio('workshop') < 0.8) capBuild('workshop', 4, 4, cp(ratio('workshop')));
    if (ratio('class') < 0.8 && w.unlocked.classroom) capBuild('classroom', 4, 4, cp(ratio('class')));
    if (ratio('meals') < 0.8 && cookCap >= seats) capBuild('canteen', 5, 4, cp(ratio('meals')));
    // fun has no Flow Bar stage: the ball bubbles (fun < 35) tell the player; one yard per 12 residents
    const funAvg = residents ? rascals(w).filter(a => a.bed).reduce((s2, a) => s2 + a.needs.fun, 0) / residents : 100;
    if (w.unlocked.yard && roomsOf(w, 'yard').length && funAvg < 35 && roomsOf(w, 'yard').length * 12 < residents) capBuild('yard', 4, 4, 86);
  }
  // upgrades: core rooms by ROI-ish value
  const upgradable = w.rooms.filter(r => r.built && ['canteen', 'workshop', 'classroom', 'gate', 'dock', 'bunk', 'wash'].includes(r.type));
  for (const r of upgradable) {
    const c = upCost(r.type, r.level);
    let prio = 40;
    // a level goal is about ONE room: push the highest one (cheapest-first picked the newest, lowest room – the goal
    // moved away with every capacity build; balance pass M5)
    const top = (t: RoomType) => roomsOf(w, t).filter(x => x.built).sort((a, b) => b.level - a.level || a.id - b.id)[0] === r;
    if (r.type === 'canteen' && (cur?.id === 'canteen5' || r.level < 5)) prio = cur?.id === 'canteen5' && top('canteen') ? 96 : 45;
    if (r.type === 'workshop') prio = cur?.id === 'workshop15' && top('workshop') ? 96 : 60;
    if (r.type === 'classroom') prio = 58;
    if (r.type === 'gate') prio = 52;
    if (r.type === 'dock' && w.cart.state !== 'depot' && roomsOf(w, 'workshop').some(x => x.stack >= 6)) prio = 75;
    // milestone pull
    if ([4, 14, 29].includes(r.level)) prio += 8;
    if (hot === r.type) prio = Math.max(prio, 93);
    add(`up ${r.type}${r.id}`, c, prio, () => cmd.upgrade(w, r.id, 1).ok);
  }
  m5Candidates(w, p, m5, layout, rnd, add);
  out.sort((a, b) => b.prio - a.prio || a.cost - b.cost);
  // never spend the money reserved for the top objective build
  const top = out[0];
  if (top && top.prio >= 88 && top.cost > w.coins) return out.filter(c => c === top || (c.label.startsWith('hire') && w.coins - c.cost >= 0));
  void STARS;
  return out;
}

/**
 * H2 random bot: a player who taps whatever is affordable, without a plan – uniformly one of: build any unlocked room
 * type (random size, random valid spot), upgrade any room, hire any role, buy the next parcel, start any project, hire
 * a lead. (Until the balance pass it picked randomly among the heuristic bot's candidates, which already were the
 * sensible purchases – that was a strategy, not random play.)
 */
const RANDOM_ROOMS: RoomType[] = ['bunk', 'canteen', 'wash', 'workshop', 'classroom', 'guard', 'yard'];
const RANDOM_ROLES: StaffRole[] = ['cook', 'janitor', 'guard', 'teacher', 'foreman', 'clerk', 'carter'];
function randomAction(w: World, rnd: Rng): boolean {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd.next() * a.length)];
  const kind = Math.floor(rnd.next() * 6);
  if (kind === 0) {
    const t = pick(RANDOM_ROOMS.filter(t => !!w.unlocked[t]));
    if (!t) return false;
    const ww = ROOMS[t].minW + Math.floor(rnd.next() * 3), hh = ROOMS[t].minH + Math.floor(rnd.next() * 3);
    return roomCost(t, ww, hh) <= w.coins && placeAndBuild(w, t, ww, hh, 'random', rnd);
  }
  if (kind === 1) { const r = pick(w.rooms.filter(r => r.built && ROOMS[r.type].baseUp > 0)); return !!r && cmd.upgrade(w, r.id, 1).ok; }
  if (kind === 2) return cmd.hire(w, pick(RANDOM_ROLES)).ok;
  if (kind === 3) { const k = w.parcels.findIndex(p => !p); return k > 0 && cmd.buyParcel(w, k).ok; }
  if (kind === 4) { const d = pick(PROJECTS); return !!d && cmd.startProject(w, d.id).ok; }
  const l = pick(LEADS); return !!l && cmd.hireLead(w, l.id).ok;
}

function anyAffordable(w: World) {
  return w.rooms.some(r => r.built && upCost(r.type, r.level) <= w.coins);
}
/** the most expensive purchase the game offers right now: next upgrade of any built room, next parcel, a startable project */
function maxOffer(w: World): number {
  let m = 0;
  for (const r of w.rooms) if (r.built && r.level < 30 && ROOMS[r.type].baseUp) m = Math.max(m, upCost(r.type, r.level));
  const k = w.parcels.findIndex(p => !p); if (k > 0) m = Math.max(m, PARCELS[k].price);
  if (w.unlocked.projects && !w.projects.running) for (const d of PROJECTS) if (projectCard(w, d.id).state === 'available') m = Math.max(m, d.cost);
  return m;
}
function cheapestNeeded(w: World) { return Math.min(...w.rooms.filter(r => r.built).map(r => upCost(r.type, r.level))); }

/** find a valid rectangle; 'good' = minimise door distance to the room's partner, 'random' = random valid spot */
export function placeAndBuild(w: World, t: RoomType, ww: number, hh: number, layout: 'good' | 'random', rnd: Rng): boolean {
  const spots: { x: number; y: number; score: number }[] = [];
  const partner = partnerOf(w, t);
  for (let y = 0; y < w.grid.h - hh; y++) for (let x = 0; x < w.grid.w - ww; x++) {
    // cheap pre-check on tiles
    let ok = true;
    for (let yy = y; yy < y + hh && ok; yy++) for (let xx = x; xx < x + ww; xx++) { const i = yy * w.grid.w + xx; if (!w.grid.owned[i] || w.grid.fixed[i] || w.grid.roomAt[i] || w.grid.ground[i] < 2) { ok = false; break; } }
    if (!ok) continue;
    const cx = x + ww / 2, cy = y + hh / 2;
    const px = partner ? partner.x + partner.w / 2 : 9, py = partner ? partner.y + partner.h / 2 : PATH_Y;
    let score = Math.hypot(cx - px, cy - py) + Math.abs(cy - PATH_Y) * 0.3;
    if (t !== 'bunk') for (const b of roomsOf(w, 'bunk')) { // keep the zone above the bunk free for the edge-drag expansion
      if (x < b.x + b.w && x + ww > b.x && y + hh > b.y - 3 && y < b.y) score += 40;
    }
    if (t === 'workshop' || t === 'yard') { // noise: keep away from bunks
      for (const b of roomsOf(w, 'bunk')) { const gap = Math.max(b.x - (x + ww), x - (b.x + b.w), b.y - (y + hh), y - (b.y + b.h)); if (gap < 3) score += 20; }
    }
    // compact packing: reward edges that touch rooms, fixed structures or the parcel border (keeps big holes for later rooms)
    let touch = 0;
    for (let xx = x; xx < x + ww; xx++) { touch += blockedAt(w, xx, y - 1) + blockedAt(w, xx, y + hh); }
    for (let yy = y; yy < y + hh; yy++) { touch += blockedAt(w, x - 1, yy) + blockedAt(w, x + ww, yy); }
    score -= touch * 0.9;
    if (layout === 'random') score = rnd.next() * 100;
    spots.push({ x, y, score });
  }
  spots.sort((a, b) => a.score - b.score);
  for (const s of spots.slice(0, 40)) {
    if (validatePlacement(w, t, s.x, s.y, ww, hh).reason === 'ok') return cmd.build(w, t, s.x, s.y, ww, hh).ok;
  }
  return false;
}
function hasSpot(w: World, t: RoomType, ww: number, hh: number): boolean {
  for (let y = 0; y < w.grid.h - hh; y++) for (let x = 0; x < w.grid.w - ww; x++) {
    let ok = true;
    for (let yy = y; yy < y + hh && ok; yy++) for (let xx = x; xx < x + ww; xx++) { const i = yy * w.grid.w + xx; if (!w.grid.owned[i] || w.grid.fixed[i] || w.grid.roomAt[i] || w.grid.ground[i] < 2) { ok = false; break; } }
    if (ok && validatePlacement(w, t, x, y, ww, hh).reason === 'ok') return true;
  }
  return false;
}
function blockedAt(w: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.grid.w || y >= w.grid.h) return 1;
  const i = y * w.grid.w + x;
  return w.grid.roomAt[i] || w.grid.blocked[i] || !w.grid.owned[i] || (w.grid.fixed[i] && !w.grid.road[i]) ? 1 : 0;
}
function partnerOf(w: World, t: RoomType): Room | undefined {
  const map: Partial<Record<RoomType, RoomType>> = { wash: 'bunk', workshop: 'dock', yard: 'canteen', classroom: 'bunk', bunk: 'wash', guard: 'yard' };
  const p = map[t]; return p ? roomsOf(w, p)[0] : undefined;
}
// ------------------------------------------------------------------ M5 hooks (docs/M5_DESIGN.md §11, balance pass)
/**
 * Inspection flow, run before the purchase decision: close a result screen (players read it first), call the
 * inspection when the clipboard follow-up asks for it. 'ready' calls the FIRST inspection as soon as it is callable
 * (casual follows the clipboard) and retries only once the forecast is better than the last result; 'pass' waits until
 * the forecast shows ≥ 1★ (optimal) and then retries for more stars.
 */
function m5Decide(w: World, o: BotOpts, rnd: Rng): boolean {
  if (!w.tutorial.done) return false;
  const I = w.inspection;
  const box = w as unknown as { __m5ReadMs?: number };
  if (I.phase === 'result') {
    box.__m5ReadMs ??= w.rtMs + (o.profile === 'optimal' ? 2000 : 6000 + rnd.next() * 6000);
    if (w.rtMs < box.__m5ReadMs) return false;
    delete box.__m5ReadMs;
    return cmd.closeInspection(w).ok;
  }
  const mode = o.m5?.inspect ?? (o.profile === 'optimal' ? 'pass' : 'ready');
  if (!mode || inspectionBlock(w)) return false;
  const f = forecast(w).stars, last = I.last?.stars ?? -1;
  const go = I.count === 0 ? mode === 'ready' || f >= 1 : f > Math.max(last, I.best) && f >= 1;
  return go ? cmd.callInspection(w).ok : false;
}

/** which projects help which inspection category (for the 'improve' hook) */
const PROJECT_CAT: Record<string, GradeCat> = {
  mattresses: 'comfort', recipeBook: 'comfort', bubbleBath: 'comfort', tetherball: 'comfort', suggestionBox: 'comfort', squeakyMops: 'comfort',
  form27b: 'profit', assembly: 'profit', speedyCarts: 'profit', biggerFerry: 'profit', nightSchool: 'reform', whistle: 'safety',
};

/**
 * Purchase candidates of M5 systems:
 *  - Project Board: one at a time, the first available card in board order (naive/random: any card)
 *  - department leads: Logistics first (pacing §4.2 "Kisten verschwinden von selbst"), then Intake; reserves the fee
 *  - improve: from 3★ on, follow the inspector's forecast like the tip on the panel – the worst
 *    category gets a high-priority purchase (a matching project, a missing room or an upgrade)
 */
function m5Candidates(w: World, p: Profile, m5: BotOpts['m5'], layout: 'good' | 'random', rnd: Rng, add: (label: string, cost: number, prio: number, run: () => boolean) => void) {
  // the forecast drives the late game from 3★ on (pacing §4.2 16:00–24:00 "Optimieren … Prognose-Noten steigen")
  const worst = m5?.improve !== false && starsOf(w.ruf) >= 3 && w.inspection.phase === 'idle' ? forecast(w).worst : null;
  if (m5?.projects !== false && w.unlocked.projects && !w.projects.running) {
    const avail = PROJECTS.filter(d => projectCard(w, d.id).state === 'available');
    const first = avail.find(d => worst && PROJECT_CAT[d.id] === worst) ?? avail[0];
    // a matching project is the inspector's tip (reserves coins); otherwise projects take spare coins only (a saving
    // casual – prio ≥ 88 for every cheap project – starved Lv15 and the inspection in the 30-min run, balance pass M5)
    // the first project right after the unlock (toast + new button, pacing §4.2 9:00–10:00 "Projekt wählen") is tried
    // like a new toy; later ones take spare coins
    const prio = worst && PROJECT_CAT[first?.id ?? ''] === worst ? 90 : !Object.keys(w.projects.done).length ? 89 : p === 'optimal' ? 80 : 66;
    if (first) add('project ' + first.id, first.cost, prio, () => cmd.startProject(w, first.id).ok);
    if (p === 'naive' || p === 'random') for (const d of avail) if (d !== first) add('project ' + d.id, d.cost, 50, () => cmd.startProject(w, d.id).ok);
  }
  if (m5?.leads !== false) {
    const free = w.leads.slots.some((s, k) => s === null && slotOpen(w, k));
    const next = (['logistics', 'intake'] as const).map(id => LEADS.find(l => l.id === id)!).find(l => !leadHired(w, l.id));
    if (free && next) add('lead ' + next.id, next.fee, 97, () => cmd.hireLead(w, next.id).ok);
  }
  if (!worst) return;
  const res = rascals(w).filter(a => a.bed);
  const n = Math.max(1, res.length);
  const built = (t: RoomType) => roomsOf(w, t).filter(r => r.built);
  const room = (t: RoomType, ww: number, hh: number, max: number) => {
    if (roomsOf(w, t).length < max) add('improve: build ' + t, roomCost(t, ww, hh), 95, () => placeAndBuild(w, t, ww, hh, layout, rnd) || placeAndBuild(w, t, ROOMS[t].minW, ROOMS[t].minH, layout, rnd));
  };
  const up = (t: RoomType) => { const r = built(t).sort((a, b) => a.level - b.level)[0]; if (r) add('improve: up ' + t, upCost(t, r.level), 90, () => cmd.upgrade(w, r.id, 1).ok); };
  if (worst === 'comfort') {
    // the lowest average need decides what is missing
    const avg = (k: 'hunger' | 'energy' | 'hygiene' | 'fun') => res.reduce((s, a) => s + a.needs[k], 0) / n;
    const need = [...(['hunger', 'fun', 'hygiene', 'energy'] as const)].sort((a, b) => avg(a) - avg(b))[0];
    if (need === 'hunger') { room('canteen', 5, 4, 1 + Math.floor(n / 14)); up('canteen'); }
    else if (need === 'fun') { if (w.unlocked.yard) room('yard', 4, 4, 1 + Math.floor(n / 16)); up('yard'); }
    else if (need === 'hygiene') { room('wash', 3, 3, 1 + Math.floor(n / 16)); up('wash'); }
    else up('bunk');
  } else if (worst === 'reform') { room('classroom', 4, 4, 1 + Math.floor(n / 12)); up('classroom'); }
  else if (worst === 'profit') { up('workshop'); up('dock'); }
  else if (worst === 'safety' && w.unlocked.guard) room('guard', 2, 2, 1 + Math.floor(n / 15));
}
export { tick };
