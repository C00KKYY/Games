/**
 * M5 contract (docs/M5_DESIGN.md): defaults, save migration v1 → v2, hash coverage of the new state, command
 * validation, content invariants, wall-clock helpers. Behaviour tests of the systems belong to the builders.
 */
import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { newGame, cmd, runFor, flushEvents } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { m5Defaults } from '../../src/sim/world';
import { encode, decode, plainToWorld, worldToPlain, crc32, fillDefaults, SAVE_VERSION, DEFAULT_SETTINGS, type SaveDoc } from '../../src/save/serialize';
import { PROJECTS, PERKS, LEADS, LEAD_SLOT_STARS, SITES, COMPLETION } from '../../src/content/progress';
import { MAIL_POOL } from '../../src/content/retention';
import { STARS, keysFor } from '../../src/content/balance';
import { FakeClock, localDayOf, localDay } from '../../src/sim/clock';
import * as fx from '../../src/sim/effects';
import { vipAvailable } from '../../src/sim/vip';
import { syncWall } from '../../src/sim/wall';
import { advanceProjects } from '../../src/sim/projects';
import { completionPercent } from '../../src/sim/prestige';
import { gradeOf, starsFor } from '../../src/sim/inspection';
import { planAway } from '../../src/sim/offline';
import en from '../../src/i18n/parts/progress.en.json';
import type { World } from '../../src/sim/types';

const M5_KEYS = ['projects', 'leads', 'taps', 'inspection', 'prestige', 'mail', 'vip', 'wall', 'offline'] as const;
const atStars = (w: World, s: number) => { w.ruf = s > 0 ? STARS[s - 1] : 0; };
const tutorialDone = (w: World) => { cmd.skipTutorial(w); };

/** a save string exactly as M4 (v1) wrote it: no M5 fields, v = 1 */
function v1Save(w: World): string {
  const plain = worldToPlain(w);
  for (const k of M5_KEYS) delete plain[k];
  const doc: SaveDoc = { v: 1, seq: 1, savedAt: 0, settings: DEFAULT_SETTINGS, world: plain };
  const json = JSON.stringify(doc);
  return `${crc32(json).toString(16)}:${LZString.compressToBase64(json)}`;
}

describe('M5 defaults', () => {
  it('a new game has every M5 field with its default', () => {
    const w = newGame(3);
    const d = m5Defaults(1);
    for (const k of M5_KEYS) expect(w[k], k).toEqual(d[k]);
    expect(w.leads.slots).toEqual([null, null]); // site 1: 2 slots
  });
  it('all effects are neutral in a fresh game (M2–M4 balance untouched)', () => {
    const w = newGame(1);
    for (const f of [fx.energyRefillMult, fx.mealRefillMult, fx.hygieneRefillMult, fx.yardFunMult, fx.reformMult, fx.crateValueMult, fx.cartSpeedMult, fx.releaseBountyMult, fx.workshopMult, fx.buildCostMult, fx.mailRewardMult, fx.dirtPerUseMult]) expect(f(w), f.name).toBe(1);
    for (const f of [fx.guardRadiusBonus, fx.moodFlatBonus, fx.ferrySeatBonus, fx.startCapitalBonus]) expect(f(w), f.name).toBe(0);
    expect(fx.offlineEff(w)).toBeCloseTo(0.4);
    expect(fx.offlineCapMs(w)).toBe(2 * 3_600_000);
  });
  it('effects read finished projects, leads and perks', () => {
    const w = newGame(1);
    w.projects.done.whistle = true; w.projects.done.biggerFerry = true;
    w.prestige.perks.ferry = 1; w.prestige.perks.offlineCap = 2; w.prestige.perks.buildCost = 3;
    w.leads.slots = ['intake', 'logistics'];
    expect(fx.guardRadiusBonus(w)).toBe(2);
    expect(fx.ferrySeatBonus(w)).toBe(3);
    expect(fx.offlineEff(w)).toBeCloseTo(0.6);
    expect(fx.offlineCapMs(w)).toBe(4 * 3_600_000);
    expect(fx.buildCostMult(w)).toBeCloseTo(0.85);
  });
});

describe('M5 save migration (v1 → v2)', () => {
  it('SAVE_VERSION is 2', () => expect(SAVE_VERSION).toBe(2));
  it('an M4 save loads, gets every M5 default and hashes like the same world created now', () => {
    const w = newGame(7);
    flushEvents(w);                    // route the start events (M5 counters see them) …
    Object.assign(w, m5Defaults(1));   // … then reset to the shape an M4 world had (all M5 fields at default)
    const doc = decode(v1Save(w));
    expect(doc).not.toBeNull();
    expect(doc!.v).toBe(2);
    for (const k of M5_KEYS) expect(doc!.world[k], k).toEqual(m5Defaults(1)[k]);
    const w2 = plainToWorld(doc!.world);
    expect(stateHash(w2)).toBe(stateHash(w));
  });
  it('an M4 save from mid-game loads and keeps running', () => {
    const w = newGame(5);
    runFor(w, 200_000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); if (x.tutorial.active) cmd.skipTutorial(x); });
    const doc = decode(v1Save(w))!;
    const w2 = plainToWorld(doc.world);
    expect(w2.coins).toBe(w.coins);
    expect(w2.rooms.length).toBe(w.rooms.length);
    expect(() => runFor(w2, 30_000)).not.toThrow();
  });
  it('fillDefaults fills missing nested keys and keeps existing values', () => {
    const o: Record<string, unknown> = { mail: { day: 5, tasks: [{ id: 'x' }] }, keys: 3 };
    fillDefaults(o, { mail: { day: -1, tasks: [], streak: 0, count: {} }, keys: 0, wall: { nowMs: 0 } });
    expect(o).toEqual({ mail: { day: 5, tasks: [{ id: 'x' }], streak: 0, count: {} }, keys: 3, wall: { nowMs: 0 } });
  });
});

describe('M5 hash coverage + H4 with M5 state', () => {
  it('every M5 field is part of the state hash', () => {
    const base = newGame(2), h0 = stateHash(base);
    const muts: [string, (w: World) => void][] = [
      ['projects', w => { w.projects.running = { id: 'mattresses', leftMs: 1000, totalMs: 90000 }; }],
      ['leads', w => { w.leads.slots[0] = 'intake'; }],
      ['taps', w => { w.taps.crates = 3; }],
      ['inspection', w => { w.inspection.hours.push({ h: 1, moodSum: 50, moodN: 1, escaped: 0, unsolved: 0, released: 1, income: 10, wages: 0, beds: 6 }); }],
      ['prestige', w => { w.prestige.perks.mail = 1; }],
      ['mail', w => { w.mail.streak = 2; }],
      ['vip', w => { w.vip.phase = 'teased'; }],
      ['wall', w => { w.wall.nowMs = 123; }],
      ['offline', w => { w.offline.ring.push(42); }],
    ];
    for (const [k, m] of muts) { const w = newGame(2); m(w); expect(stateHash(w), k).not.toBe(h0); }
  });
  it('H4: save → load gives an identical hash with populated M5 state', () => {
    const w = newGame(4);
    runFor(w, 120_000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); if (x.tutorial.active) cmd.skipTutorial(x); });
    syncWall(w, Date.UTC(2026, 10, 5, 9), 60);
    w.projects.running = { id: 'recipeBook', leftMs: 4321, totalMs: 90000 };
    w.prestige.perks.workshop = 2; w.keys = 3; w.offline.pending = { coins: 99, awayMs: 600000, effPct: 40, capMs: 7_200_000, capped: false };
    const w2 = plainToWorld(decode(encode(w, DEFAULT_SETTINGS, 1, 0))!.world);
    expect(stateHash(w2)).toBe(stateHash(w));
    expect(w2.mail.tasks.length).toBe(3);
  });
});

describe('M5 command validation', () => {
  it('startProject', () => {
    const w = newGame(1); tutorialDone(w);
    expect(cmd.startProject(w, 'mattresses').reason).toBe('locked');
    atStars(w, 2);
    expect(cmd.startProject(w, 'nope' as never).reason).toBe('invalid');
    expect(cmd.startProject(w, 'tetherball').reason).toBe('noRoom');
    w.coins = 0;
    expect(cmd.startProject(w, 'mattresses').reason).toBe('coins');
    w.coins = 10_000;
    expect(cmd.startProject(w, 'mattresses').ok).toBe(true);
    expect(cmd.startProject(w, 'recipeBook').reason).toBe('busy');
    advanceProjects(w, 90_000);
    expect(w.projects.done.mattresses).toBe(true);
    expect(cmd.startProject(w, 'mattresses').reason).toBe('done');
    expect(cmd.startProject(w, 'recipeBook').ok).toBe(true);
  });
  it('hireLead: slot 1 at 3★, slot 2 at 4★', () => {
    const w = newGame(1); tutorialDone(w); w.coins = 10_000;
    atStars(w, 2);
    expect(cmd.hireLead(w, 'logistics').reason).toBe('noSlot');
    expect(cmd.hireLead(w, 'nope' as never).reason).toBe('invalid');
    atStars(w, 3);
    expect(cmd.hireLead(w, 'logistics').ok).toBe(true);
    expect(w.unlocked.supLogistics).toBe(true);
    expect(cmd.hireLead(w, 'logistics').reason).toBe('done');
    expect(cmd.hireLead(w, 'intake').reason).toBe('noSlot');
    atStars(w, 4);
    w.coins = 0;
    expect(cmd.hireLead(w, 'intake').reason).toBe('coins');
    w.coins = 10_000;
    expect(cmd.hireLead(w, 'intake').ok).toBe(true);
    expect(w.leads.slots).toEqual(['logistics', 'intake']);
  });
  it('callInspection / closeInspection / transfer', () => {
    const w = newGame(1);
    expect(cmd.callInspection(w).reason).toBe('tutorial');
    tutorialDone(w);
    expect(cmd.callInspection(w).reason).toBe('notReady');
    expect(cmd.closeInspection(w).reason).toBe('none');
    expect(cmd.transfer(w, 1).reason).toBe('notPassed');
    w.inspection.best = 1;
    expect(cmd.transfer(w, 2).reason).toBe('locked'); // site 2 content arrives with M6
  });
  it('buyPerk', () => {
    const w = newGame(1);
    expect(cmd.buyPerk(w, 'nope' as never).reason).toBe('invalid');
    expect(cmd.buyPerk(w, 'ferry').reason).toBe('keys');
    w.keys = 10;
    expect(cmd.buyPerk(w, 'ferry').ok).toBe(true);
    expect(w.keys).toBe(10 - PERKS.find(p => p.id === 'ferry')!.costs[0]);
    expect(cmd.buyPerk(w, 'ferry').reason).toBe('max');
  });
  it('mail and offline commands', () => {
    const w = newGame(1);
    expect(cmd.seeMail(w).reason).toBe('locked');
    expect(cmd.claimMail(w, 0).reason).toBe('locked');
    expect(cmd.collectOffline(w).reason).toBe('none');
  });
  it('every M5-specific failure reason has EN text', () => {
    for (const r of ['done', 'busy', 'noSlot', 'notReady', 'tooSoon', 'tutorial', 'notPassed', 'keys', 'notDone', 'claimed']) expect((en as Record<string, string>)[`progress.reason.${r}`], r).toBeTruthy();
  });
});

describe('M5 content', () => {
  it('12 projects, 60–300 s, the 7 from the brief with their effects, all with text', () => {
    expect(PROJECTS.length).toBe(12);
    expect(new Set(PROJECTS.map(p => p.id)).size).toBe(12);
    for (const p of PROJECTS) { expect(p.sec).toBeGreaterThanOrEqual(60); expect(p.sec).toBeLessThanOrEqual(300); expect(p.cost).toBeGreaterThan(0); expect(p.visual.length).toBeGreaterThan(5); }
    const brief: [string, string, number][] = [['mattresses', 'energyRefill', 0.25], ['recipeBook', 'mealRefill', 0.25], ['whistle', 'guardRadius', 2], ['assembly', 'crateValue', 0.25], ['nightSchool', 'reform', 0.2], ['speedyCarts', 'cartSpeed', 0.3], ['biggerFerry', 'ferrySeats', 2]];
    for (const [id, e, v] of brief) { const p = PROJECTS.find(x => x.id === id)!; expect(p.effect, id).toBe(e); expect(p.v, id).toBe(v); }
    for (const p of PROJECTS) { expect((en as Record<string, string>)[`progress.project.${p.id}`], p.id).toBeTruthy(); expect((en as Record<string, string>)[`progress.projectFx.${p.id}`], p.id).toBeTruthy(); }
  });
  it('6 perks costing 2–6 keys; 6–8 keys buy exactly 2 perks', () => {
    expect(PERKS.length).toBe(6);
    for (const p of PERKS) { expect(p.costs.length).toBe(p.max); for (const c of p.costs) { expect(c).toBeGreaterThanOrEqual(2); expect(c).toBeLessThanOrEqual(6); } }
    const lvl1 = PERKS.map(p => p.costs[0]).sort((a, b) => a - b);
    expect(lvl1[0] + lvl1[1]).toBeLessThanOrEqual(6);
    expect(lvl1[0] + lvl1[1] + lvl1[2]).toBeGreaterThan(8);
    for (const p of PERKS) expect((en as Record<string, string>)[`progress.perk.${p.id}`], p.id).toBeTruthy();
  });
  it('site 1 leads, slots, mail pool, sites, completion', () => {
    expect(LEADS.filter(l => l.site === 1).map(l => l.id).sort()).toEqual(['intake', 'logistics']);
    expect(LEAD_SLOT_STARS[1]).toEqual([3, 4]);
    expect(MAIL_POOL.length).toBeGreaterThanOrEqual(3);
    for (const m of MAIL_POOL) expect((en as Record<string, string>)[`progress.mail.${m.id}`], m.id).toBeTruthy();
    expect(SITES.find(s => s.id === 1)!.available).toBe(true);
    const w = newGame(1);
    expect(completionPercent(w)).toBe(0);
    w.prestige.completedSites = [1];
    expect(completionPercent(w)).toBe(COMPLETION.percentPerSite);
  });
  it('key formula keeps the brief star bonus (2★ +2, 3★ +4)', () => {
    expect(keysFor(0, 1)).toBe(0);
    expect(keysFor(0, 2) - keysFor(0, 1)).toBe(2);
    expect(keysFor(0, 3) - keysFor(0, 1)).toBe(4);
  });
  it('grade thresholds and star rule (brief)', () => {
    expect([85, 84.9, 70, 55, 40, 25, 24.9].map(gradeOf)).toEqual(['A', 'B', 'B', 'C', 'D', 'E', 'F']);
    expect(starsFor({ comfort: 'A', safety: 'B', reform: 'B', profit: 'B' })).toBe(3);
    expect(starsFor({ comfort: 'B', safety: 'B', reform: 'B', profit: 'B' })).toBe(2);
    expect(starsFor({ comfort: 'B', safety: 'B', reform: 'B', profit: 'D' })).toBe(2);
    expect(starsFor({ comfort: 'C', safety: 'D', reform: 'B', profit: 'B' })).toBe(1);
    expect(starsFor({ comfort: 'A', safety: 'A', reform: 'A', profit: 'E' })).toBe(0);
  });
});

describe('M5 wall clock', () => {
  it('local day respects the UTC offset; FakeClock is injectable', () => {
    const t = Date.UTC(2026, 10, 5, 23, 30);
    expect(localDayOf(t, 60)).toBe(localDayOf(t, 0) + 1); // 00:30 next day in UTC+1
    const c = new FakeClock(t, -300);
    expect(localDay(c)).toBe(localDayOf(t, -300));
    c.advance(3_600_000);
    expect(c.now()).toBe(t + 3_600_000);
  });
  it('morning VIP rule: (a) new local day AND ≥ 4 h, or (b) ≥ 8 h', () => {
    const end = Date.UTC(2026, 10, 5, 21, 0), endDay = localDayOf(end, 0), H = 3_600_000;
    expect(vipAvailable(end, endDay, end + 3.9 * H, 0)).toBe(false); // next day (00:54) but < 4 h
    expect(vipAvailable(end, endDay, end + 4 * H, 0)).toBe(true);    // next day and 4 h
    const morning = Date.UTC(2026, 10, 5, 8, 0);
    expect(vipAvailable(morning, localDayOf(morning, 0), morning + 7.9 * H, 0)).toBe(false); // same day, < 8 h
    expect(vipAvailable(morning, localDayOf(morning, 0), morning + 8 * H, 0)).toBe(true);
    expect(vipAvailable(0, 0, end, 0)).toBe(false);                  // no session end known
    expect(vipAvailable(end, endDay, end - H, 0)).toBe(false);       // clock turned back
  });
  it('mail day rolls on the local day and does not touch the sim RNG', () => {
    const w = newGame(9), rng = w.rngState;
    syncWall(w, Date.UTC(2026, 10, 5, 10), 0);
    expect(w.mail.tasks.length).toBe(3);
    expect(new Set(w.mail.tasks.map(t => t.id)).size).toBe(3);
    const day = w.mail.day;
    syncWall(w, Date.UTC(2026, 10, 5, 23), 0);
    expect(w.mail.day).toBe(day);
    syncWall(w, Date.UTC(2026, 10, 6, 0, 1), 0);
    expect(w.mail.day).toBe(day + 1);
    expect(w.rngState).toBe(rng);
  });
  it('away planning thresholds and clamps (H4)', () => {
    const w = newGame(1);
    expect(planAway(w, -5000).mode).toBe('none');
    expect(planAway(w, NaN).mode).toBe('none');
    expect(planAway(w, 30_000).mode).toBe('silent');
    expect(planAway(w, 120_000).mode).toBe('catchup');
    expect(planAway(w, 300_000).mode).toBe('formula');
    expect(planAway(w, 10 * 365 * 86_400_000).mode).toBe('formula');
  });
});
