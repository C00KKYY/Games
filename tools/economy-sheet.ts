/**
 * Economy sheet (Brief §4.1, test H0).
 * A closed, aggregated (non-agent) model of site 1 that follows the casual build order
 * of the pacing table and checks: affordability, star unlock times, income mix,
 * wage share, workshop payback, inspection-ready time.
 * It reads ALL numbers from src/content/balance.ts – no constants of its own except
 * the behavioural assumptions of the casual player, listed in ASSUME.
 *
 * Run: npm run economy   (exit code 1 on any contradiction)
 */
import {
  TIME, STARS, RUF, ROOMS, RATE, WAGES, ECON, SENTENCE, FERRY, UPGRADE, PARCELS,
  roomCost, roomSlots, upCost, levelMult, releaseBounty, gateBountyMult, wageFor, boardPerBedHour, STAFF_ROOM, ferrySize, moodFactor, keysFor,
  type RoomType, type StaffRole,
} from '../src/content/balance';

/** Behavioural assumptions of the aggregated model (casual player). */
export const ASSUME = {
  /** share of activity hours (08–20) a rascal spends in class/work/yard (rest: meals, shower, walking) */
  activeShare: 0.62,
  /** average mood of the population */
  mood: 62,
  /** real seconds a casual player needs to react to an affordable next step */
  reactSec: 5,
  /** share of crates sold per minute without supervisor (taps / auto at 6) */
  cartEfficiency: 0.9,
  /** casual player spends spare coins on core-room upgrades when this many coins are left over */
  upgradeSpare: 1.4,
};

interface Room { t: RoomType; w: number; h: number; lvl: number }
interface Rascal { sentence: number; pts: number; arrived: number }

interface Step { at: number; label: string; kind: 'build' | 'upgrade' | 'hire' | 'parcel' | 'expand'; t?: RoomType; w?: number; h?: number; role?: StaffRole; parcel?: number; to?: number; objective?: string }

/** Casual build order (pacing table §4.2). `at` = earliest real second. */
const ORDER: Step[] = [
  { at: 15, label: 'Wash Hut 3x3 (tutorial)', kind: 'build', t: 'wash', w: 3, h: 3 },
  { at: 70, label: 'Canteen Lv2 (tutorial)', kind: 'upgrade', t: 'canteen', to: 2 },
  { at: 90, label: 'Workshop 4x4', kind: 'build', t: 'workshop', w: 4, h: 4, objective: 'workshop' },
  { at: 95, label: 'Hire foreman', kind: 'hire', role: 'foreman' },
  { at: 210, label: 'Classroom 4x4', kind: 'build', t: 'classroom', w: 4, h: 4, objective: 'classroom' },
  { at: 215, label: 'Hire teacher', kind: 'hire', role: 'teacher' },
  { at: 270, label: 'Guard Post', kind: 'build', t: 'guard', w: 2, h: 2, objective: 'guard' },
  { at: 275, label: 'Hire guard', kind: 'hire', role: 'guard' },
  { at: 330, label: 'Cells 6x3 → 6x6 (12 beds)', kind: 'expand', t: 'bunk', w: 6, h: 6, objective: 'beds12' },
  { at: 390, label: 'Yard 5x5', kind: 'build', t: 'yard', w: 5, h: 5, objective: 'yard' },
  { at: 450, label: 'Canteen → Lv5 (milestone)', kind: 'upgrade', t: 'canteen', to: 5, objective: 'canteen5' },
  { at: 560, label: 'Workshop → Lv5 (milestone)', kind: 'upgrade', t: 'workshop', to: 5 },
  { at: 620, label: 'Hire janitor', kind: 'hire', role: 'janitor' },
  { at: 720, label: 'Parcel 2', kind: 'parcel', parcel: 1, objective: 'parcel2' },
  { at: 760, label: 'Cells 2nd block 6x6 (+12 beds → 24)', kind: 'build', t: 'bunk', w: 6, h: 6, objective: 'beds24' },
  { at: 800, label: 'Classroom → 5x5', kind: 'expand', t: 'classroom', w: 5, h: 5 },
  { at: 900, label: 'Workshop 2 4x4', kind: 'build', t: 'workshop', w: 4, h: 4 },
  { at: 905, label: 'Hire foreman 2', kind: 'hire', role: 'foreman' },
  { at: 940, label: 'Depot → Lv5 (cart bottleneck)', kind: 'upgrade', t: 'dock', to: 5 },
  { at: 960, label: 'Classroom → Lv5', kind: 'upgrade', t: 'classroom', to: 5 },
  { at: 1080, label: 'Workshop → Lv10', kind: 'upgrade', t: 'workshop', to: 10 },
  { at: 1200, label: 'Parcel 3', kind: 'parcel', parcel: 2 },
  { at: 1290, label: 'Workshop → Lv15 (milestone)', kind: 'upgrade', t: 'workshop', to: 15, objective: 'workshop15' },
  { at: 1300, label: 'Classroom 2 4x4', kind: 'build', t: 'classroom', w: 4, h: 4 },
  { at: 1305, label: 'Hire teacher 2', kind: 'hire', role: 'teacher' },
  { at: 1400, label: 'Depot → Lv10 (flow bar shows cart bottleneck)', kind: 'upgrade', t: 'dock', to: 10 },
  { at: 1500, label: 'Workshop 3 5x4', kind: 'build', t: 'workshop', w: 5, h: 4 },
  { at: 1505, label: 'Hire foreman 3', kind: 'hire', role: 'foreman' },
  { at: 1620, label: 'Cells 3rd block 6x6 (36 beds)', kind: 'build', t: 'bunk', w: 6, h: 6 },
];

/** Objective → reached flag + Ruf (each objective +10 Ruf, coins scaled) */
const MANDATORY = ['workshop', 'classroom', 'guard', 'beds24', 'release15', 'workshop15', 'catch3'];

export function run(verbose = true) {
  const errors: string[] = [];
  const log: string[] = [];
  let coins: number = ECON.startCoins, ruf = 0;
  const rooms: Room[] = [
    { t: 'bunk', w: 6, h: 3, lvl: 1 }, // 6 beds pre-built (18 tiles / 3)
    { t: 'canteen', w: 4, h: 3, lvl: 1 },
    { t: 'gate', w: 2, h: 2, lvl: 1 },
    { t: 'dock', w: 3, h: 2, lvl: 1 },
  ];
  const staff: Record<StaffRole, number> = { cook: 1, carter: 1, janitor: 0, guard: 0, teacher: 0, foreman: 0, clerk: 0 };
  const rascals: Rascal[] = [];
  let arrivedCount = 0, released = 0, caught = 0;
  const done = new Set<string>();
  const income = { release: 0, crates: 0, board: 0, events: 0, objectives: 0 };
  const incomeAt: Record<number, typeof income> = {};
  let wagesPaid = 0;
  const wagesAt: Record<number, number> = {};
  const starAt: number[] = [];
  let lifetime = 0;
  let workshopBuiltAt = -1, workshopCost = 0, workshopEarned = 0, paybackAt = -1;
  let inspectionAt = -1;
  let gateCd = 0;
  let crateBuf = 0, cartCap = 0;

  const beds = () => rooms.filter(r => r.t === 'bunk').reduce((s, r) => s + roomSlots('bunk', r.w, r.h), 0);
  const stars = () => STARS.filter(s => ruf >= s).length;
  const addCoins = (v: number, k: keyof typeof income) => { coins += v; income[k] += v; lifetime += v; };
  const addRuf = (v: number, t: number) => {
    const before = stars(); ruf += v; const after = stars();
    for (let s = before; s < after; s++) starAt[s] = t;
  };
  const objective = (id: string, t: number) => {
    if (done.has(id)) return;
    done.add(id); addRuf(RUF.objective, t);
    addCoins(100 + 40 * done.size, 'objectives');
    log.push(`${fmt(t)}  objective ${id} (+${RUF.objective} Ruf)  ruf=${ruf}`);
  };

  let gameH = TIME.newGameHour; // hours since day 0 00:00
  let nextFerryIdx = 1; // ferries at 7,15 each day; first one at t=4s (tutorial horn)
  const ferryTimes: number[] = [];
  for (let d = 0; d < 30; d++) for (const h of TIME.ferryHours) ferryTimes.push(d * 24 + h);
  let lastDay = 0;

  const T_END = 1800;
  const stepQueue = ORDER.slice();
  for (let t = 0; t <= T_END; t++) {
    let hod = gameH % 24;
    let isNight = hod >= TIME.nightStartHour || hod < TIME.dayStartHour;
    // first session skips the night during the first 5 minutes (Brief §3.2): jump to 06:00
    if (isNight && t < 300) {
      gameH = Math.floor(gameH / 24) * 24 + (hod >= TIME.nightStartHour ? 24 : 0) + TIME.dayStartHour;
      hod = gameH % 24; isNight = false;
    }
    const dh = isNight ? 1 / TIME.nightHourSec : 1 / TIME.dayHourSec;

    // --- ferry
    if (t === 4) { // tutorial ferry: 4 rascals incl. Earl
      for (let i = 0; i < 4; i++) rascals.push({ sentence: i === 0 ? SENTENCE.earl : SENTENCE.early[0] + ((i * 37) % (SENTENCE.early[1] - SENTENCE.early[0] + 1)), pts: 0, arrived: t });
      arrivedCount = 4; nextFerryIdx = 1;
    } else if (t > 4 && nextFerryIdx < ferryTimes.length && gameH >= ferryTimes[nextFerryIdx]) {
      nextFerryIdx++;
      const size = ferrySize(ruf);
      const free = beds() - rascals.length;
      const n = Math.max(0, Math.min(size, free + 0)); // waiting at dock not modelled as resident
      for (let i = 0; i < n; i++) {
        const early = arrivedCount < SENTENCE.earlyCount;
        const [a, b] = early ? SENTENCE.early : SENTENCE.normal;
        rascals.push({ sentence: a + ((arrivedCount * 37) % (b - a + 1)), pts: 0, arrived: t });
        arrivedCount++;
      }
    }

    // --- Earl scripted (tutorial): reform 100 after shower
    if (t === 40 && rascals[0]) rascals[0].pts = rascals[0].sentence;

    // --- activities
    const mf = moodFactor(ASSUME.mood);
    const active = hod >= TIME.activityHours[0] && hod < TIME.activityHours[1];
    let avail = active ? rascals.length * ASSUME.activeShare : 0;
    // classroom
    const cls = rooms.filter(r => r.t === 'classroom');
    const desks = Math.min(cls.reduce((s, r) => s + roomSlots('classroom', r.w, r.h), 0), staff.teacher * 10);
    const ws = rooms.filter(r => r.t === 'workshop');
    const stations = ws.reduce((s, r) => s + roomSlots('workshop', r.w, r.h), 0);
    // rascals spread over free slots proportionally (they pick whatever is free nearby)
    const students = Math.min(desks, avail * desks / Math.max(1, desks + stations));
    avail -= students;
    const workers = Math.min(avail, stations);
    avail -= workers;
    const wsLvl = ws.length ? ws.reduce((s, r) => s + levelMult(r.lvl) * roomSlots('workshop', r.w, r.h), 0) / Math.max(1, stations) : 1;
    const supervised = Math.min(workers, staff.foreman * 4);
    const crateRate = (supervised + (workers - supervised) * RATE.workshopNoForemanFactor) * RATE.workshopCratesPerStation * wsLvl * mf;
    crateBuf += crateRate * dh;
    // cart: 6 crates per 20 s trip, faster with depot level (logistics bottleneck)
    const dock = rooms.find(r => r.t === 'dock')!;
    // logistics supervisor at 3 stars (no idle waiting), project "Speedy Carts" (+30 %) researched ~18:00
    const cartEff = stars() >= 3 ? 1 : ASSUME.cartEfficiency;
    const speedy = t >= 1080 ? 1.3 : 1;
    cartCap += (RATE.cartCrates / RATE.cartTripSec) * levelMult(dock.lvl) * cartEff * speedy;
    const sold = Math.floor(Math.min(crateBuf, cartCap)); crateBuf -= sold; cartCap = Math.min(cartCap - sold, RATE.cartCrates);
    if (crateBuf > 60) crateBuf = 60; // stack full → stations idle
    if (sold > 0) {
      const v = sold * ECON.crateValue; addCoins(v, 'crates');
      if (workshopBuiltAt >= 0) { workshopEarned += v; if (paybackAt < 0 && workshopEarned >= workshopCost) paybackAt = t; }
    }
    // reform distribution: students first (oldest arrivals), then workers
    const clsLvl = cls.length ? levelMult(cls[0].lvl) : 1;
    const sorted = rascals.slice().sort((a, b) => a.arrived - b.arrived);
    let s = students, w = workers;
    for (const r of sorted) {
      if (s >= 1) { r.pts += RATE.reformClass * clsLvl * mf * dh; s--; }
      else if (s > 0) { r.pts += RATE.reformClass * clsLvl * mf * dh * s; s = 0; }
      else if (w >= 1) { r.pts += RATE.reformWorkshop * mf * dh; w--; }
      if (ASSUME.mood >= RATE.reformPassiveMood) r.pts += RATE.reformPassive * mf * dh;
    }
    // --- gate
    gateCd -= 1;
    const gate = rooms.find(r => r.t === 'gate')!;
    const ready = rascals.findIndex(r => r.pts >= r.sentence);
    if (ready >= 0 && gateCd <= 0 && (t >= 40)) {
      rascals.splice(ready, 1); released++;
      addCoins(releaseBounty(stars()) * gateBountyMult(gate.lvl), 'release'); addRuf(RUF.release, t);
      gateCd = RATE.gateSecPerRelease;
      log.push(`${fmt(t)}  release #${released} (pop ${rascals.length})  coins=${coins.toFixed(0)} ruf=${ruf}`);
      if (released >= 5) objective('release5', t);
      if (released >= 15) objective('release15', t);
    }
    // --- board
    const bunkLvl = Math.max(...rooms.filter(r => r.t === 'bunk').map(r => r.lvl));
    addCoins(rascals.length * boardPerBedHour(bunkLvl) * dh, 'board');

    // --- scripted events: tunnel at ~180 s, then director every ~200 s (casual catches 70 %)
    if (t === 185) { caught++; addCoins(ECON.caughtCoins, 'events'); addRuf(RUF.caught + RUF.eventSolved, t); log.push(`${fmt(t)}  spoon tunnel caught ruf=${ruf}`); }
    if (t === 600) { addRuf(RUF.eventSolved, t); log.push(`${fmt(t)}  food fight solved ruf=${ruf}`); }
    if (t > 300 && t % 200 === 0 && t !== 600) {
      if ((t / 200) % 10 < 7) { caught++; addCoins(ECON.caughtCoins, 'events'); addRuf(RUF.caught + RUF.eventSolved, t); }
      else addRuf(RUF.escaped, t);
      if (caught >= 3) objective('catch3', t);
    }

    // --- wages at midnight
    const day = Math.floor(gameH / 24);
    if (day > lastDay) {
      lastDay = day;
      let wsum = 0; for (const k of Object.keys(staff) as StaffRole[]) wsum += staff[k] * wageFor(k, roomLvlFor(k, rooms));
      coins = Math.max(0, coins - wsum); wagesPaid += wsum;
    }

    // --- casual staffing (real game: queues/tips push the player to hire)
    if (t % 10 === 0 && t > 120) {
      const needCooks = Math.ceil(rascals.length / 8);
      const needGuards = staff.guard > 0 ? Math.ceil(rascals.length / 12) : 0;
      const needJan = t > 600 ? Math.ceil(rooms.length / 4) : 0;
      const needTeach = staff.teacher > 0 ? rooms.filter(r => r.t === 'classroom').length : 0;
      const wants: [StaffRole, number][] = [['cook', needCooks], ['guard', needGuards], ['janitor', needJan], ['teacher', needTeach]];
      for (const [role, n] of wants) if (staff[role] < n && coins > WAGES[role] * 3) { coins -= WAGES[role]; staff[role]++; }
    }

    // --- casual player buys
    const next = stepQueue[0];
    if (next && t >= next.at + ASSUME.reactSec) {
      const cost = stepCost(next, rooms);
      if (coins >= cost) {
        coins -= cost; stepQueue.shift();
        applyStep(next, rooms, staff, (r) => { if (r === 'workshop' && workshopBuiltAt < 0) { workshopBuiltAt = t; workshopCost = cost + WAGES.foreman; } });
        if (next.kind === 'upgrade' && next.to && next.to >= UPGRADE.milestones[0]) { addRuf(RUF.milestone, t); }
        log.push(`${fmt(t)}  BUY ${next.label} (-${cost.toFixed(0)})  coins=${coins.toFixed(0)} ruf=${ruf} beds=${beds()} rascals=${rascals.length}`);
        if (next.objective) objective(next.objective, t);
        if (next.at + 45 < t - ASSUME.reactSec) errors.push(`${next.label}: planned ${fmt(next.at)}, affordable only at ${fmt(t)} (>45 s late)`);
      }
    }
    // spare-coin upgrades on canteen/workshop (casual habit)
    const nextCost = next ? stepCost(next, rooms) : Infinity;
    if (t > 120 && coins > nextCost * ASSUME.upgradeSpare + 200) {
      const core = rooms.filter(r => r.t === 'workshop' || r.t === 'canteen' || r.t === 'classroom' || r.t === 'gate' || r.t === 'dock' || r.t === 'bunk').sort((a, b) => upCost(a.t, a.lvl) - upCost(b.t, b.lvl))[0];
      if (core && core.lvl < UPGRADE.maxLevel) {
        const c = upCost(core.t, core.lvl);
        if (coins - c > nextCost) { coins -= c; core.lvl++; if ((UPGRADE.milestones as readonly number[]).includes(core.lvl)) addRuf(RUF.milestone, t); }
      }
    }

    if (inspectionAt < 0 && MANDATORY.every(m => done.has(m))) inspectionAt = t;
    if (t === 900 || t === 1800) { incomeAt[t] = { ...income }; wagesAt[t] = wagesPaid; }
    gameH += dh;
  }

  // ---------- checks (Brief §3.8, §4.2, §4.3)
  const win = (lo: number, hi: number, v: number | undefined, label: string) => {
    if (v === undefined || v < 0) { errors.push(`${label}: never reached`); return; }
    if (v < lo * 0.8 || v > hi * 1.2) errors.push(`${label}: ${fmt(v)} outside ${fmt(lo)}–${fmt(hi)} (±20 %)`);
  };
  win(180, 210, starAt[0], '1 star');
  win(450, 540, starAt[1], '2 stars');
  win(840, 960, starAt[2], '3 stars');
  win(1320, 1800, inspectionAt, 'inspection ready (22–30 min)');
  for (const at of [900, 1800]) {
    const inc = incomeAt[at]; const tot = inc.release + inc.crates + inc.board;
    const mix = { release: inc.release / tot, crates: inc.crates / tot, board: inc.board / tot };
    const wageShare = wagesAt[at] / (tot + inc.events + inc.objectives);
    log.push(`@${fmt(at)} mix release ${(mix.release * 100).toFixed(0)} % · crates ${(mix.crates * 100).toFixed(0)} % · board ${(mix.board * 100).toFixed(0)} % · wages ${(wageShare * 100).toFixed(0)} %`);
    if (mix.release < 0.4 || mix.release > 0.5) errors.push(`@${fmt(at)} release share ${(mix.release * 100).toFixed(0)} % (target 40–50)`);
    if (mix.crates < 0.3 || mix.crates > 0.4) errors.push(`@${fmt(at)} crate share ${(mix.crates * 100).toFixed(0)} % (target 30–40)`);
    if (mix.board > 0.2) errors.push(`@${fmt(at)} board share ${(mix.board * 100).toFixed(0)} % (target ≤ 20)`);
    if (wageShare < 0.2 || wageShare > 0.35) errors.push(`@${fmt(at)} wage share ${(wageShare * 100).toFixed(0)} % (target 20–35)`);
  }
  const payback = paybackAt - workshopBuiltAt;
  if (paybackAt < 0 || payback < 120 || payback > 240) errors.push(`workshop payback ${paybackAt < 0 ? 'never' : fmt(payback)} (target 2–4 min)`);
  const keys = keysFor(lifetime, 1);
  log.push(`lifetime coins @30:00 ${lifetime.toFixed(0)} → base keys ${keys}`);
  if (keys < 4 || keys > 6) errors.push(`base keys ${keys} (target 4–6)`);
  if (stepQueue.length) errors.push(`build order unfinished: ${stepQueue.map(s => s.label).join(', ')}`);

  const summary = {
    stars: starAt.map(fmt), inspection: fmt(inspectionAt), releases: released, coinsEnd: Math.round(coins), ruf,
    payback: paybackAt < 0 ? 'never' : fmt(payback), keys,
  };
  if (verbose) {
    console.log(log.join('\n'));
    console.log('\nSUMMARY', summary);
    console.log(errors.length ? `\nH0 FAIL (${errors.length})\n - ` + errors.join('\n - ') : '\nH0 OK');
  }
  return { errors, summary, log };
}

function roomLvlFor(role: StaffRole, rooms: Room[]) {
  const rs = rooms.filter(r => r.t === STAFF_ROOM[role]);
  return rs.length ? Math.max(...rs.map(r => r.lvl)) : 1;
}

function stepCost(s: Step, rooms: Room[]): number {
  switch (s.kind) {
    case 'build': return roomCost(s.t!, s.w!, s.h!);
    case 'expand': {
      const r = rooms.find(x => x.t === s.t)!;
      return ROOMS[s.t!].perTile * (s.w! * s.h! - r.w * r.h);
    }
    case 'upgrade': {
      const r = rooms.find(x => x.t === s.t)!; let c = 0;
      for (let l = r.lvl; l < s.to!; l++) c += upCost(s.t!, l);
      return c;
    }
    case 'hire': return WAGES[s.role!];
    case 'parcel': return PARCELS[s.parcel!].price;
  }
}

function applyStep(s: Step, rooms: Room[], staff: Record<StaffRole, number>, onBuild: (t: RoomType) => void) {
  switch (s.kind) {
    case 'build': rooms.push({ t: s.t!, w: s.w!, h: s.h!, lvl: 1 }); onBuild(s.t!); break;
    case 'expand': { const r = rooms.find(x => x.t === s.t)!; r.w = s.w!; r.h = s.h!; break; }
    case 'upgrade': { const r = rooms.find(x => x.t === s.t)!; r.lvl = Math.max(r.lvl, s.to!); break; }
    case 'hire': staff[s.role!]++; break;
    case 'parcel': break;
  }
}

const fmt = (t: number | undefined) => t === undefined || t < 0 ? '—' : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

if (process.argv[1]?.endsWith('economy-sheet.ts')) {
  const { errors } = run(true);
  process.exit(errors.length ? 1 : 0);
}
void FERRY;
