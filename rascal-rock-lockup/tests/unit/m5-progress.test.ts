/**
 * M5 progression behaviour (docs/M5_DESIGN.md §2–§6, owner sim-progress): Project Board, department leads, clipboard,
 * Inspection Day (goose walk, grade formulas, stars, result), transfer + keys + perks, hand-grip tap limit.
 * Every number marked (brief) in the design is asserted exactly here.
 */
import { describe, it, expect } from 'vitest';
import { newGame, cmd, runFor, tick } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { worldToPlain, plainToWorld } from '../../src/save/serialize';
import { PROJECTS, PROJECT_UNLOCK_STARS, LEAD_SLOT_STARS, LEAD_HORN_DELAY_MS, LEAD_CART_MIN_CRATES, PERKS, SITES, COMPLETION, projectDef } from '../../src/content/progress';
import { STARS, ECON, INSPECTION, PRESTIGE, GUARD_RADIUS, TAP_COOLDOWN_SEC, RATE, keysFor } from '../../src/content/balance';
import * as fx from '../../src/sim/effects';
import { projectCard, projectsUnlocked, advanceProjects, doneProjects, projectLeftSec } from '../../src/sim/projects';
import { hireInfo, slotOpen, slotStars, leadWages } from '../../src/sim/leads';
import { inspectionBlock, forecast, scoresOf, gradeOf, starsFor, worstOf, inspectedRooms, inspectionRoute, walkSpeed, inspectionTipKey } from '../../src/sim/inspection';
import { transferKeys, transferTargets, completionPercent, perkNextCost } from '../../src/sim/prestige';
import { OBJECTIVES, currentGoal, mandatoryDone, objectiveReward } from '../../src/sim/objectives';
import { ferrySizeNow } from '../../src/sim/ferry';
import { guardRadius } from '../../src/sim/director';
import { priceBuild } from '../../src/sim/rooms';
import { cartTick } from '../../src/sim/staff';
import { roomsOf } from '../../src/sim/world';
import { dayOf } from '../../src/sim/time';
import { BotDriver, placeAndBuild } from '../../tools/bots';
import en from '../../src/i18n/parts/progress.en.json';
import type { World, SimEvent, HourBucket } from '../../src/sim/types';

const atStars = (w: World, s: number) => { w.ruf = s > 0 ? STARS[s - 1] : 0; };
const afterTutorial = (seed = 1) => { const w = newGame(seed); cmd.skipTutorial(w); return w; };
const allMandatory = (w: World) => { for (const o of OBJECTIVES) if (o.mandatory) w.obj.done[o.id] = true; };
/** run `ms` of 1x time and return the events of the given types that happened meanwhile */
function collect(w: World, ms: number, types: string[]): SimEvent[] {
  const out: SimEvent[] = []; let seq = w.eventSeq; const end = w.rtMs + ms;
  while (w.rtMs < end) {
    tick(w);
    const n = Math.min(w.events.length, w.eventSeq - seq); seq = w.eventSeq;
    for (const e of w.events.slice(w.events.length - n)) if (types.includes(e.type)) out.push(e);
  }
  return out;
}
const zeroRng = { next: () => 0 } as never;

// ------------------------------------------------------------------ Project Board (Brief §3.13)
describe('Project Board', () => {
  it('unlocks at exactly 2★ (brief) and stays unlocked when the Ruf drops again', () => {
    expect(PROJECT_UNLOCK_STARS).toBe(2);
    const w = afterTutorial();
    w.ruf = STARS[1] - 1;
    expect(projectsUnlocked(w)).toBe(false);
    expect(projectCard(w, 'form27b')).toEqual({ state: 'locked', stars: 2 });
    w.ruf = STARS[1];
    runFor(w, 200); // objectivesTick records unlocked.projects
    expect(projectsUnlocked(w)).toBe(true);
    w.ruf = STARS[1] - 10; // an escape
    expect(projectsUnlocked(w)).toBe(true);
  });
  it('12 projects, exactly one runs at a time, paid in coins, 60–300 s', () => {
    expect(PROJECTS.length).toBe(12);
    const w = afterTutorial(); atStars(w, 2); w.coins = 100_000;
    expect(cmd.startProject(w, 'form27b').ok).toBe(true);
    expect(w.coins).toBe(100_000 - projectDef('form27b').cost);
    for (const p of PROJECTS) if (p.id !== 'form27b') expect(['busy', 'needsRoom']).toContain(projectCard(w, p.id).state);
    for (const p of PROJECTS) expect(p.sec >= 60 && p.sec <= 300, p.id).toBe(true);
  });
  it('the timer counts real 1x time: the first two projects take 90 s (brief pacing 9:00–10:00)', () => {
    expect(projectDef('mattresses').sec).toBe(90);
    expect(projectDef('recipeBook').sec).toBe(90);
    const w = afterTutorial(); atStars(w, 2); w.coins = 10_000;
    cmd.startProject(w, 'mattresses');
    runFor(w, 89_000);
    expect(w.projects.done.mattresses).toBeFalsy();
    const c = projectCard(w, 'mattresses');
    expect(c.state).toBe('running');
    if (c.state === 'running') { expect(c.leftMs).toBeLessThanOrEqual(1000); expect(c.progress01).toBeGreaterThan(0.98); }
    expect(projectLeftSec(w)).toBe(1);
    const ev = collect(w, 1200, ['projectDone']);
    expect(w.projects.done.mattresses).toBe(true);
    expect(w.projects.running).toBeNull();
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ id: 'mattresses', effect: 'energyRefill', v: 0.25 });
    expect(typeof ev[0].x).toBe('number');
    expect(doneProjects(w).map(p => p.id)).toEqual(['mattresses']);
  });
  it('the timer continues offline (advanceProjects with the away time) and finishes there', () => {
    const w = afterTutorial(); atStars(w, 2); w.coins = 10_000;
    cmd.startProject(w, 'speedyCarts'); // 180 s
    advanceProjects(w, 60_000);
    expect(w.projects.running!.leftMs).toBe(120_000);
    advanceProjects(w, -5_000); // negative deltas never run a timer backwards
    expect(w.projects.running!.leftMs).toBe(120_000);
    advanceProjects(w, 10 * 3_600_000);
    expect(w.projects.done.speedyCarts).toBe(true);
  });
  it('every project changes the game in a measurable way (the 7 brief effects exactly)', () => {
    const w = afterTutorial();
    const base = { ferry: ferrySizeNow(w), guard: guardRadius(w), build: priceBuild(w, 'yard', 4, 4) };
    for (const p of PROJECTS) w.projects.done[p.id] = true;
    expect(fx.energyRefillMult(w)).toBeCloseTo(1.25);      // Comfy Mattresses +25 % (brief)
    expect(fx.mealRefillMult(w)).toBeCloseTo(1.25);        // Recipe Book +25 % (brief)
    expect(guardRadius(w)).toBe(base.guard + 2);           // Whistle Training +2 (brief)
    expect(guardRadius(w)).toBe(GUARD_RADIUS + 2);
    expect(fx.crateValueMult(w)).toBeCloseTo(1.25);        // Assembly Knitting +25 % (brief)
    expect(fx.reformMult(w)).toBeCloseTo(1.2);             // Night School +20 % (brief)
    expect(fx.cartSpeedMult(w)).toBeCloseTo(1.3);          // Speedy Carts +30 % (brief)
    expect(ferrySizeNow(w)).toBe(base.ferry + 2);          // Bigger Ferry +2 seats (brief)
    expect(fx.releaseBountyMult(w)).toBeCloseTo(1.15);
    expect(fx.hygieneRefillMult(w)).toBeCloseTo(1.25);
    expect(fx.yardFunMult(w)).toBeCloseTo(1.3);
    expect(fx.moodFlatBonus(w)).toBe(5);
    expect(fx.dirtPerUseMult(w)).toBeCloseTo(0.7);
    expect(priceBuild(w, 'yard', 4, 4)).toBe(base.build); // projects never touch build prices
    for (const p of PROJECTS) expect(p.visual.length, p.id).toBeGreaterThan(10); // render hint "im Bild sichtbar"
  });
});

// ------------------------------------------------------------------ Department leads (Brief §3.11)
describe('Department leads', () => {
  it('site 1: 2 slots, slot 1 from 3★, slot 2 from 4★ (brief)', () => {
    expect(LEAD_SLOT_STARS[1]).toEqual([3, 4]);
    const w = afterTutorial();
    expect(w.leads.slots.length).toBe(2);
    expect([slotStars(w, 0), slotStars(w, 1)]).toEqual([3, 4]);
    atStars(w, 2); expect([slotOpen(w, 0), slotOpen(w, 1)]).toEqual([false, false]);
    atStars(w, 3); expect([slotOpen(w, 0), slotOpen(w, 1)]).toEqual([true, false]);
    atStars(w, 4); expect([slotOpen(w, 0), slotOpen(w, 1)]).toEqual([true, true]);
  });
  it('the hire dialog knows today\'s taps ("You tapped 34 times today")', () => {
    const w = afterTutorial();
    w.taps.horn = 34; w.taps.hornTotal = 50; w.taps.crates = 7;
    expect(hireInfo(w, 'intake')).toMatchObject({ name: 'Olli', grip: 'horn', tapsToday: 34, tapsTotal: 50, hired: false });
    expect(hireInfo(w, 'logistics')).toMatchObject({ name: 'Becca', grip: 'crates', tapsToday: 7 });
    atStars(w, 3); w.coins = 10_000;
    const before = w.eventSeq;
    cmd.hireLead(w, 'intake');
    const ev = w.events.slice(w.events.length - (w.eventSeq - before)).find(e => e.type === 'leadHired');
    expect(ev).toMatchObject({ id: 'intake', slot: 0, taps: 34 });
    expect(hireInfo(w, 'intake').hired).toBe(true);
  });
  it('Intake automates the ferry horn after a short visible delay', () => {
    const w = afterTutorial();
    atStars(w, 3); w.coins = 10_000;
    expect(cmd.hireLead(w, 'intake').ok).toBe(true);
    // wait for the next honking ferry
    for (let i = 0; i < 200_000 && w.ferry.state !== 'arriving'; i++) tick(w);
    expect(w.ferry.state).toBe('arriving');
    const t0 = w.ferry.sinceMs;
    const ev = collect(w, LEAD_HORN_DELAY_MS + 300, ['leadAutoTap']);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ id: 'intake', grip: 'horn' });
    expect(ev[0].rtMs - t0).toBeGreaterThanOrEqual(LEAD_HORN_DELAY_MS);
    expect(w.taps.horn).toBe(0); // automated taps are not the player's
  });
  it('Logistics automates the crate stack: the cart leaves at 2 crates instead of 6', () => {
    expect(LEAD_CART_MIN_CRATES).toBe(2);
    expect(RATE.cartCrates).toBe(6);
    const w = afterTutorial(); w.coins = 10_000;
    expect(placeAndBuild(w, 'workshop', 4, 4, 'good', zeroRng)).toBe(true);
    runFor(w, 20_000);
    const ws = roomsOf(w, 'workshop')[0];
    expect(ws.built).toBe(true);
    ws.stack = 2; w.cart.state = 'depot';
    cartTick(w);
    expect(w.cart.state).toBe('depot'); // without lead: waits for 6 (or a tap)
    atStars(w, 3);
    expect(cmd.hireLead(w, 'logistics').ok).toBe(true);
    cartTick(w);
    expect(w.cart.state).toBe('toWorkshop');
  });
  it('each lead adds +10 pp offline efficiency (brief) and draws a daily wage', () => {
    const w = afterTutorial(); w.coins = 100_000;
    expect(fx.offlineEff(w)).toBeCloseTo(0.4);
    atStars(w, 4);
    cmd.hireLead(w, 'logistics');
    expect(fx.offlineEff(w)).toBeCloseTo(0.5);
    cmd.hireLead(w, 'intake');
    expect(fx.offlineEff(w)).toBeCloseTo(0.6);
    expect(leadWages(w)).toBe(120);
  });
});

// ------------------------------------------------------------------ Clipboard (Brief §3.16)
describe('Clipboard objectives', () => {
  it('10 objectives per site, 7 mandatory, coins scaled by position + 10 Ruf each (brief)', () => {
    const regular = OBJECTIVES.filter(o => !o.onlyIfSkipped);
    expect(regular.length).toBe(10);
    expect(regular.filter(o => o.mandatory).length).toBe(7);
    expect(objectiveReward(1)).toBeLessThan(objectiveReward(9));
    const w = afterTutorial(); runFor(w, 1000);
    const ruf0 = w.ruf;
    w.coins += 5000; // build the Knitting Nook → objective 'workshop'
    expect(placeAndBuild(w, 'workshop', 4, 4, 'good', zeroRng)).toBe(true);
    const ev = collect(w, 20_000, ['objective']);
    expect(ev.map(e => e.id)).toContain('workshop');
    expect(w.stats.rufBy.objective).toBe(10);
    expect(w.ruf - ruf0).toBeGreaterThanOrEqual(10);
    expect(w.stats.income.objective).toBe(objectiveReward(OBJECTIVES.findIndex(o => o.id === 'workshop')));
  });
  it('there is always a current objective after the tutorial (casual bot, 30 min)', () => {
    const w = newGame(11); const bot = new BotDriver(w, { profile: 'casual', seed: 11 });
    let missing = 0, checks = 0;
    while (w.rtMs < 30 * 60_000) {
      tick(w); bot.step();
      if (w.tutorial.done && w.t % 75 === 0) { checks++; if (!currentGoal(w)) missing++; }
    }
    expect(checks).toBeGreaterThan(100);
    expect(missing).toBe(0);
  }, 30_000);
});

// ------------------------------------------------------------------ Inspection Day (Brief §3.17)
function bucket(over: Partial<HourBucket> = {}): HourBucket {
  return { h: 0, moodSum: 0, moodN: 0, escaped: 0, unsolved: 0, released: 0, income: 0, wages: 0, beds: 20, ...over };
}
describe('Inspection Day', () => {
  it('callable once the 7 mandatory objectives are done; reasons tutorial / notReady / busy / tooSoon', () => {
    const w = newGame(1);
    expect(inspectionBlock(w)).toBe('tutorial');
    cmd.skipTutorial(w);
    expect(inspectionBlock(w)).toBe('notReady');
    allMandatory(w);
    expect(mandatoryDone(w)).toBe(true);
    expect(inspectionBlock(w)).toBeNull();
    expect(cmd.callInspection(w).ok).toBe(true);
    expect(inspectionBlock(w)).toBe('busy');
    expect(cmd.callInspection(w).reason).toBe('busy');
  });
  it('grade formulas over the last 2 game days (brief)', () => {
    expect(INSPECTION.windowHours).toBe(48);
    const w = afterTutorial();
    // 48 hours = 2 days: mood 60 %, 1 escape + 2 unsolved, 4 releases on 20 beds, net 1 500 per day
    w.inspection.hours = Array.from({ length: 48 }, (_, h) => bucket({ h, moodSum: 600, moodN: 10, beds: 20, income: 1500 * 2 / 48 + 10, wages: 10 }));
    w.inspection.hours[3].escaped = 1; w.inspection.hours[5].unsolved = 2; w.inspection.hours[7].released = 4;
    const s = scoresOf(w);
    expect(s.comfort).toBeCloseTo(60);                         // Ø mood in %
    expect(s.safety).toBe(100 - 25 * 1 - 10 * 2);              // 55
    expect(s.reform).toBeCloseTo((4 / 2 / (20 / 10)) * 50);    // releases per day per 10 beds × 50 = 50
    expect(s.profit).toBeCloseTo(100 * 1500 / SITES[0].profitTarget); // net/day ÷ target × 100
    // caps and floors
    w.inspection.hours[3].escaped = 9; w.inspection.hours[7].released = 400; w.inspection.hours.forEach(b => { b.income = 1e6; });
    const t = scoresOf(w);
    expect(t.safety).toBe(0); expect(t.reform).toBe(100); expect(t.profit).toBe(100);
  });
  it('grades A–F, stars 1/2/3 and the worst category with its tip (brief)', () => {
    expect([100, 85, 84.99, 70, 69.9, 55, 54.9, 40, 39.9, 25, 24.9, 0].map(gradeOf)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'F', 'F']);
    expect(starsFor({ comfort: 'D', safety: 'D', reform: 'D', profit: 'D' })).toBe(1);   // no grade below D
    expect(starsFor({ comfort: 'E', safety: 'A', reform: 'A', profit: 'A' })).toBe(0);
    expect(starsFor({ comfort: 'B', safety: 'B', reform: 'B', profit: 'C' })).toBe(2);   // ≥ 3 grades B+
    expect(starsFor({ comfort: 'A', safety: 'B', reform: 'B', profit: 'B' })).toBe(3);   // all B+ and ≥ 1 A
    expect(starsFor({ comfort: 'A', safety: 'A', reform: 'A', profit: 'C' })).toBe(2);
    expect(worstOf({ comfort: 80, safety: 100, reform: 30, profit: 60 })).toBe('reform');
    for (const c of ['comfort', 'safety', 'reform', 'profit'] as const) expect((en as Record<string, string>)[inspectionTipKey(c)], c).toBeTruthy();
  });
  it('the goose walks 45 s from the dock past every room door to the gate, one inspectorAt per room (brief)', () => {
    expect(INSPECTION.walkSec).toBe(45);
    const w = afterTutorial(); w.coins = 10_000;
    placeAndBuild(w, 'workshop', 4, 4, 'good', zeroRng); placeAndBuild(w, 'yard', 4, 4, 'good', zeroRng);
    runFor(w, 20_000);
    allMandatory(w);
    const rooms = inspectedRooms(w);
    expect(rooms.length).toBeGreaterThanOrEqual(3);
    const route = inspectionRoute(w);
    expect(route[0]).toEqual({ x: Math.floor(w.poi.ferryBerth.x) + 0.5, y: Math.floor(w.poi.ferryBerth.y) + 0.5 });
    const gate = roomsOf(w, 'gate')[0];
    expect(route[route.length - 1]).toEqual({ x: gate.door.x + 0.5, y: gate.door.y + 0.5 });
    for (let i = 1; i < route.length; i++) expect(Math.max(Math.abs(route[i].x - route[i - 1].x), Math.abs(route[i].y - route[i - 1].y))).toBe(1); // tile steps, no jumps
    const fc = forecast(w);
    expect(cmd.callInspection(w).ok).toBe(true);
    expect(w.inspection.phase).toBe('walking');
    expect(w.inspection.route).toEqual(route);
    const at = collect(w, 44_800, ['inspectorAt', 'inspectionResult']);
    expect(w.inspection.phase).toBe('walking');
    expect(at.filter(e => e.type === 'inspectionResult').length).toBe(0);
    expect(at.map(e => e.roomId).sort()).toEqual(rooms.map(r => r.id).sort());          // each room exactly once
    expect(w.inspection.walker.moving).toBe(false);                                         // arrived at the gate before the end
    expect({ x: w.inspection.walker.x, y: w.inspection.walker.y }).toEqual(route[route.length - 1]);
    expect((route.length - 1) / walkSpeed(route.length)).toBeLessThanOrEqual(INSPECTION.walkSec - INSPECTION.walkSlackSec + 1e-9);
    const res = collect(w, 300, ['inspectionResult', 'completion']);
    expect(w.inspection.phase).toBe('result');
    const r = res.find(e => e.type === 'inspectionResult')!;
    expect(r).toMatchObject({ worst: w.inspection.last!.worst, tip: `progress.tip.${w.inspection.last!.worst}` });
    expect(w.inspection.last!.stars).toBe(starsFor(w.inspection.last!.grades));
    expect(Object.keys(fc.grades).sort()).toEqual(Object.keys(w.inspection.last!.grades).sort());
    expect(res.some(e => e.type === 'completion')).toBe(true); // reported after EVERY inspection (brief §3.17)
  });
  it('result: pass completes the site (completion event, happytime), retry only from the next game day', () => {
    const w = afterTutorial();
    allMandatory(w);
    cmd.callInspection(w);
    // a perfect window right before the end of the walk
    w.inspection.hours = Array.from({ length: 48 }, (_, h) => bucket({ h, moodSum: 900, moodN: 10, released: 1, income: 400, wages: 0, beds: 10 }));
    const ev = collect(w, 45_200, ['inspectionResult', 'siteCompleted', 'completion', 'happytime']);
    const r = ev.find(e => e.type === 'inspectionResult')!;
    expect(r).toMatchObject({ stars: 3, passed: true, firstPass: true });
    expect(r.bonusKeys).toBe(4);
    expect(ev.find(e => e.type === 'siteCompleted')).toMatchObject({ site: 1, stars: 3, next: 2 });
    expect(ev.find(e => e.type === 'completion')).toMatchObject({ percent: COMPLETION.percentPerSite });
    expect(ev.filter(e => e.type === 'happytime').map(e => e.reason)).toEqual(['inspection']);
    expect(w.prestige.completedSites).toEqual([1]);
    expect(completionPercent(w)).toBe(COMPLETION.percentPerSite);
    expect(w.inspection.best).toBe(3);
    expect(cmd.closeInspection(w).ok).toBe(true);
    expect(w.inspection.phase).toBe('idle');
    expect(inspectionBlock(w)).toBe('tooSoon');
    expect(w.inspection.retryDay).toBe(w.inspection.last!.day + 1);
    while (dayOf(w.t) < w.inspection.retryDay) tick(w);
    expect(inspectionBlock(w)).toBeNull();
  });
  it('a failed inspection does not complete the site and the follow-up stays "call inspection"', () => {
    const w = afterTutorial();
    allMandatory(w);
    cmd.callInspection(w);
    w.inspection.hours = Array.from({ length: 48 }, (_, h) => bucket({ h, moodSum: 100, moodN: 10 }));
    const ev = collect(w, 45_200, ['inspectionResult', 'siteCompleted', 'happytime', 'completion']);
    expect(ev.find(e => e.type === 'inspectionResult')).toMatchObject({ stars: 0, passed: false, firstPass: false });
    expect(ev.some(e => e.type === 'siteCompleted' || e.type === 'happytime')).toBe(false);
    expect(ev.find(e => e.type === 'completion')).toMatchObject({ percent: 0 });
    for (const o of OBJECTIVES) w.obj.done[o.id] = true;
    expect(currentGoal(w)).toMatchObject({ kind: 'followup', id: 'callInspection' });
  });
  it('save/load in the middle of the walk continues identically (H4)', () => {
    const w = afterTutorial(3); w.coins = 5000;
    placeAndBuild(w, 'workshop', 4, 4, 'good', zeroRng);
    runFor(w, 20_000); allMandatory(w);
    cmd.callInspection(w);
    runFor(w, 17_000);
    const copy = plainToWorld(worldToPlain(w));
    expect(stateHash(copy)).toBe(stateHash(w));
    runFor(w, 30_000); runFor(copy, 30_000);
    expect(stateHash(copy)).toBe(stateHash(w));
    expect(copy.inspection.last).toEqual(w.inspection.last);
  });
});

// ------------------------------------------------------------------ Transfer, keys, perks (Brief §3.17)
describe('Transfer, golden keys, perks', () => {
  it('keys = floor(k·sqrt(L/C)) + star bonus 2★ +2, 3★ +4 (brief)', () => {
    for (const L of [0, 800, 5000, 20_000, 1e6]) {
      const base = Math.floor(PRESTIGE.k * Math.sqrt(L / PRESTIGE.C));
      expect(keysFor(L, 1)).toBe(base);
      expect(keysFor(L, 2)).toBe(base + 2);
      expect(keysFor(L, 3)).toBe(base + 4);
    }
  });
  it('calibration: the casual bot gets 4–6 base keys at its first inspection; with 2★ that buys exactly 2 perks (brief)', () => {
    // the TIME of the first inspection is H3 (tools/balance.ts, 22–30 min); this test checks the key calibration of
    // every seed that called one within 36 min – at least 3 of 5 must, so the calibration is never measured on nothing
    let measured = 0;
    for (const seed of [11, 28, 45, 62, 79]) {
      const w = newGame(seed); const bot = new BotDriver(w, { profile: 'casual', seed });
      let L = -1;
      while (w.rtMs < 36 * 60_000 && L < 0) { tick(w); bot.step(); if (w.inspection.count > 0) L = w.stats.lifetimeCoins; }
      if (L < 0) continue;
      measured++;
      const base = keysFor(L, 1);
      expect(base, `seed ${seed} L=${Math.round(L)}`).toBeGreaterThanOrEqual(4);
      expect(base, `seed ${seed} L=${Math.round(L)}`).toBeLessThanOrEqual(6);
    }
    expect(measured).toBeGreaterThanOrEqual(3);
    // 6–8 keys (4–6 base + 2 for 2★) buy exactly 2 perks, cheapest first
    for (let keys = 6; keys <= 8; keys++) {
      const w = newGame(1); w.keys = keys;
      let bought = 0;
      for (;;) {
        const next = PERKS.filter(p => perkNextCost(w, p.id) !== null).sort((a, b) => perkNextCost(w, a.id)! - perkNextCost(w, b.id)!)[0];
        if (!next || !cmd.buyPerk(w, next.id).ok) break;
        bought++;
      }
      expect(bought, `${keys} keys`).toBe(2);
    }
  }, 60_000);
  it('transfer resets the site run, keeps keys/perks/completion, and starts without tutorial beats', () => {
    const w = afterTutorial(5);
    w.coins = 50_000; atStars(w, 3);
    cmd.hireLead(w, 'logistics'); cmd.startProject(w, 'form27b');
    w.stats.lifetimeCoins = 20_000; w.inspection.best = 2; w.prestige.completedSites = [1];
    w.keys = 1; w.prestige.perks.startCapital = 1; w.taps.hornTotal = 40;
    const keys = transferKeys(w);
    expect(keys).toBe(keysFor(20_000, 2));
    expect(transferTargets(w)).toEqual([1]);              // site 2 arrives with M6 (no dead target)
    const ev = (() => { const s = w.eventSeq; const r = cmd.transfer(w, 1); expect(r.ok).toBe(true); return w.events.slice(w.events.length - (w.eventSeq - s)); })();
    expect(ev.find(e => e.type === 'transfer')).toMatchObject({ fromSite: 1, toSite: 1, keys, transfers: 1 });
    expect(ev.find(e => e.type === 'keysEarned')).toMatchObject({ n: keys, source: 'transfer' });
    const fresh = newGame(1);
    expect(w.keys).toBe(1 + keys);
    expect(w.coins).toBe(ECON.startCoins + 1000);         // start capital perk +1 000 × site factor (brief)
    expect(w.rooms.length).toBe(fresh.rooms.length);
    expect(w.ruf).toBe(0);
    expect(w.projects).toEqual({ done: {}, running: null });
    expect(w.leads.slots).toEqual([null, null]);
    expect(w.unlocked.supLogistics).toBeFalsy();
    expect(w.inspection.best).toBe(0);
    expect(w.prestige).toMatchObject({ completedSites: [1], transfers: 1, keysEarned: keys, lifetimeCoins: 20_000, perks: { startCapital: 1 } });
    expect(w.taps.hornTotal).toBe(40);
    expect(w.tutorial).toMatchObject({ active: false, done: true });
    expect(w.firstSession).toBe(false);
    // no scripted 3:00 tunnel, no food fight in the lock window, no tutorial wash objective
    const evs = collect(w, 5 * 60_000, ['tunnel', 'foodFight', 'tutorialStep']);
    expect(evs.filter(e => e.type === 'tunnel' && e.scripted).length).toBe(0);
    expect(evs.filter(e => e.type === 'foodFight').length).toBe(0);
    expect(evs.filter(e => e.type === 'tutorialStep').length).toBe(0);
    expect(currentGoal(w)).not.toBeNull();
    // the fresh lockup has no Wash Hut: its optional goal comes first (integrator, M5 flow)
    expect(OBJECTIVES[w.obj.current].id).toBe('wash');
  });
  it('transfer is deterministic and survives save/load (H4)', () => {
    const mk = () => { const w = afterTutorial(7); runFor(w, 30_000); w.inspection.best = 1; w.stats.lifetimeCoins = 12_345; cmd.transfer(w, 1); runFor(w, 30_000); return w; };
    const a = mk(), b = mk();
    expect(stateHash(a)).toBe(stateHash(b));
    const c = plainToWorld(worldToPlain(a));
    expect(stateHash(c)).toBe(stateHash(a));
  });
  it('6 perks costing 2–6 keys, each wired into the economy (brief)', () => {
    expect(PERKS.map(p => p.id).sort()).toEqual(['buildCost', 'ferry', 'mail', 'offlineCap', 'startCapital', 'workshop']);
    for (const p of PERKS) for (const c of p.costs) expect(c >= 2 && c <= 6, p.id).toBe(true);
    expect(PERKS.find(p => p.id === 'startCapital')!.max).toBe(3);  // (brief) max 3
    expect(PERKS.find(p => p.id === 'offlineCap')!.max).toBe(3);    // (brief) max 3
    const w = newGame(1);
    const base = { ferry: ferrySizeNow(w), build: priceBuild(w, 'workshop', 4, 4) };
    w.prestige.perks = { startCapital: 2, workshop: 3, offlineCap: 3, ferry: 1, buildCost: 2, mail: 1 };
    expect(fx.startCapitalBonus(w)).toBe(2000);                       // +1 000 × site factor per level
    expect(fx.workshopMult(w)).toBeCloseTo(1.3);                      // +10 % per level
    expect(fx.offlineCapMs(w)).toBe((2 + 3) * 3_600_000);             // +1 h per level
    expect(ferrySizeNow(w)).toBe(base.ferry + 1);                     // +1 seat
    expect(priceBuild(w, 'workshop', 4, 4)).toBe(Math.ceil(base.build * 0.9 - 1e-9)); // −5 % per level
    expect(fx.mailRewardMult(w)).toBeCloseTo(1.25);                   // +25 %
  });
});

// ------------------------------------------------------------------ hand-grip tap limit (Brief §3.11, §3.18)
describe('Hand-grip tap limit', () => {
  it('a crate stack takes at most 1 effective tap per 2 s', () => {
    expect(TAP_COOLDOWN_SEC).toBe(2);
    const w = afterTutorial(); w.coins = 5000;
    placeAndBuild(w, 'workshop', 4, 4, 'good', zeroRng); runFor(w, 20_000);
    const ws = roomsOf(w, 'workshop')[0]; ws.stack = 3;
    expect(cmd.tapCrates(w, ws.id).ok).toBe(true);
    expect(cmd.tapCrates(w, ws.id).reason).toBe('cooldown');
    runFor(w, 1_800);
    ws.stack = Math.max(ws.stack, 3);
    expect(cmd.tapCrates(w, ws.id).reason).toBe('cooldown');
    runFor(w, 300);
    ws.stack = Math.max(ws.stack, 3);
    expect(cmd.tapCrates(w, ws.id).ok).toBe(true);
    expect(w.taps.crates).toBe(2);
  });
  it('a brawler calms once per tap, a calmed rascal ignores further taps', () => {
    const w = afterTutorial();
    runFor(w, 60_000);
    const a = w.agents.find(x => x.kind === 'rascal')!;
    a.state = 'brawling';
    expect(cmd.tapRangler(w, a.id).ok).toBe(true);
    expect(cmd.tapRangler(w, a.id).reason).toBe('none');
  });
});
