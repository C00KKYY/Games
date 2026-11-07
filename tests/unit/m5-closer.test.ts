/**
 * Closer pass M5: regression tests for the verifier findings (docs/QA_REPORT.md "Stand M5" → "Closer").
 *  - clock toggling (OS clock +2 h / back / +2 h …) pays the offline cap only once (wall high-water mark, Brief §3.18)
 *  - a clock that was far ahead and is corrected re-anchors the daily mail instead of locking it for months
 *  - a mail day re-rolled after a back-jump never advances the key streak
 *  - v2 → v3 save migration (high-water mark from the save time)
 */
import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { newGame, tick, cmd } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { encode, decode, plainToWorld, worldToPlain, crc32, DEFAULT_SETTINGS, SAVE_VERSION, type SaveDoc } from '../../src/save/serialize';
import { awayMs } from '../../src/save/store';
import { planAway, applyOfflineFormula, collectOffline } from '../../src/sim/offline';
import { beginSession, syncWall, markSessionEnd, awayBaseMs, resumeSession } from '../../src/sim/wall';
import { localDayOf } from '../../src/sim/clock';
import { MAIL, MAIL_POOL } from '../../src/content/retention';
import type { World } from '../../src/sim/types';
import { scoresOf, inspectionCounters } from '../../src/sim/inspection';
import { escapeScore } from '../../src/sim/director';
import { completionPercent, onInspectionPassed } from '../../src/sim/prestige';
import { rascals } from '../../src/sim/agents';
import { BotDriver } from '../../tools/bots';
import { DIRECTOR } from '../../src/content/balance';
import { COMPLETION, siteDef } from '../../src/content/progress';

const H = 3_600_000, D = 24 * H, T = Date.UTC(2026, 5, 10, 12, 0);
const CAP = 10 * 365 * D;

/** a mid-game world with a measured income (ring) and the wall clock started at T */
function earning(perMin = 300): World {
  const w = newGame(11);
  tick(w); cmd.skipTutorial(w); w.firstSession = false;
  w.offline.ring = [perMin, perMin, perMin, perMin, perMin];
  beginSession(w, T, 0);
  return w;
}
/** exactly what src/app.ts does: load → absence from the high-water mark → session start → Collect → save at clock.now() */
function reload(save: string, now: number): { w: World; save: string } {
  const doc = decode(save)!;
  const w = plainToWorld(doc.world);
  const plan = planAway(w, awayMs(awayBaseMs(w, doc.savedAt), now, CAP));
  if (plan.mode === 'formula') applyOfflineFormula(w, plan.awayMs);
  beginSession(w, now, 0, true);
  collectOffline(w);
  markSessionEnd(w, now, 0);
  return { w, save: encode(w, DEFAULT_SETTINGS, doc.seq + 1, now) };
}

describe('anti-exploit: wall high-water mark (Brief §3.18, H4)', () => {
  it('toggling the OS clock +2 h / back five times pays the 2 h cap once, not five times', () => {
    let w = earning();
    markSessionEnd(w, T, 0);
    let save = encode(w, DEFAULT_SETTINGS, 1, T);
    const once = (() => { const r = reload(save, T + 2 * H); return r.w.offline.collected; })();
    expect(once).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) for (const now of [T + 2 * H, T]) ({ w, save } = reload(save, now));
    expect(w.offline.collected).toBe(once);
    expect(w.wall.maxSeenMs).toBe(T + 2 * H);
    // real time catches up with the mark: from then on absences pay again
    ({ w, save } = reload(save, T + 2 * H + 30 * 60_000));
    expect(w.offline.collected).toBeGreaterThan(once);
  });
  it('the same through the tab-hide path: the hidden time counts from the mark, never twice', () => {
    const w = earning();
    markSessionEnd(w, T + 2 * H, 0);                         // the clock was +2 h when the tab was hidden
    // tab shown again with the clock back at T: nothing; the mark never lowers
    expect(awayMs(awayBaseMs(w, T), T, CAP)).toBe(0);
    resumeSession(w, T, 0);
    expect(w.wall.maxSeenMs).toBe(T + 2 * H);
    // hidden at T (clock back) and shown at T + 2 h: 0, the furthest time seen was already T + 2 h
    expect(awayMs(awayBaseMs(w, T), T + 2 * H, CAP)).toBe(0);
    expect(awayMs(awayBaseMs(w, T), T + 3 * H, CAP)).toBe(H);
  });
  it('the morning-VIP wait measures from the mark: a clock set back before the save cannot restart it', () => {
    const w = earning();
    w.vip.phase = 'teased'; markSessionEnd(w, T, 0);
    syncWall(w, T + 9 * H, 0);                                // clock +9 h: VIP ready (rule b, ≥ 8 h)
    expect(w.vip.phase).toBe('ready');
    w.vip.phase = 'teased';
    markSessionEnd(w, T, 0);                                  // saved with the clock back at T
    expect(w.vip.sessionEndMs).toBe(T + 9 * H);
    syncWall(w, T + 9 * H, 0);
    expect(w.vip.phase).toBe('teased');
  });
  it('the mark is saved (H4: same hash before the first tick) and a garbage clock never moves it', () => {
    const w = earning();
    syncWall(w, NaN, 0); syncWall(w, -5, 0);
    expect(w.wall.maxSeenMs).toBe(T);
    const w2 = plainToWorld(JSON.parse(JSON.stringify(worldToPlain(w))));
    expect(w2.wall.maxSeenMs).toBe(T);
    expect(stateHash(w2)).toBe(stateHash(w));
  });
});

describe('daily mail and a clock that was far ahead', () => {
  const complete = (w: World) => {
    for (const t of w.mail.tasks) { const c = MAIL_POOL.find(p => p.id === t.id)!.counter; w.mail.count[c] = (w.mail.count[c] ?? 0) + t.target; }
    tick(w);
    for (let i = 0; i < w.mail.tasks.length; i++) cmd.claimMail(w, i);
  };
  it('+400 days, then corrected: today gets a closed slot (no reward), the next real day brings new mail', () => {
    const w = earning();
    const today = w.mail.day;
    syncWall(w, T + 400 * D, 0);
    expect(w.mail.day).toBe(today + 400);
    const coins = w.coins;
    syncWall(w, T + 1 * H, 0);                                // clock corrected
    expect(w.mail.day).toBe(today);
    expect(w.mail.tasks.every(t => t.claimed)).toBe(true);   // "New mail tomorrow", nothing paid
    expect(w.coins).toBe(coins);
    syncWall(w, T + D, 0);                                    // the next real day
    expect(w.mail.day).toBe(today + 1);
    expect(w.mail.tasks.length).toBe(MAIL.tasksPerDay);
    expect(w.mail.tasks.some(t => t.claimed)).toBe(false);
  });
  it(`small back-jumps (≤ ${MAIL.reanchorAfterDays} days) never re-roll`, () => {
    const w = earning();
    syncWall(w, T + 2 * D, 0);
    const day = w.mail.day, tasks = JSON.stringify(w.mail.tasks);
    syncWall(w, T + 2 * D - MAIL.reanchorAfterDays * D, 0);
    syncWall(w, T + 2 * D, 0);
    expect(w.mail.day).toBe(day);
    expect(JSON.stringify(w.mail.tasks)).toBe(tasks);
  });
  it('mail days re-rolled after a back-jump pay coins but never advance the key streak', () => {
    const w = earning();
    const keys0 = w.keys;
    syncWall(w, T + 10 * D, 0);                               // far ahead …
    syncWall(w, T, 0);                                        // … and back: re-anchored at the real day
    for (let d = 1; d <= 6; d++) {                            // six days below the high-water day
      syncWall(w, T + d * D, 0);
      expect(w.mail.day).toBe(localDayOf(T + d * D, 0));
      complete(w);
    }
    expect(w.mail.daysCompleted).toBe(6);
    expect(w.mail.streak).toBe(0);
    expect(w.keys).toBe(keys0);
    for (let d = 11; d <= 13; d++) { syncWall(w, T + d * D, 0); complete(w); } // past the old mark: keys again
    expect(w.keys).toBe(keys0 + 1);
  });
});

describe('save v2 → v3', () => {
  it(`SAVE_VERSION ${SAVE_VERSION}: a v2 save gets maxSeenMs = its save time and mail.hiDay = its mail day, hash-stable`, () => {
    const w = earning();
    const plain = worldToPlain(w) as Record<string, Record<string, unknown>>;
    delete plain.wall.maxSeenMs; delete plain.mail.hiDay;
    const doc: SaveDoc = { v: 2, seq: 3, savedAt: T + 5 * H, settings: DEFAULT_SETTINGS, world: plain };
    const json = JSON.stringify(doc);
    const got = decode(`${crc32(json).toString(16)}:${LZString.compressToBase64(json)}`)!;
    expect(got.v).toBe(3);
    const w2 = plainToWorld(got.world);
    expect(w2.wall.maxSeenMs).toBe(T + 5 * H);
    expect(w2.mail.hiDay).toBe(w.mail.day);
    const w3 = plainToWorld(decode(encode(w2, DEFAULT_SETTINGS, 4, T + 5 * H))!.world);
    expect(stateHash(w3)).toBe(stateHash(w2));
  });
});

describe('inspection Profit counts wages owed (Brief §3.17, §3.18 "Unbezahlte Löhne bremsen")', () => {
  it('a broke prison: the day end books the whole wage bill as owed, even though nothing could be paid', () => {
    const w = newGame(3);
    tick(w); cmd.skipTutorial(w);
    expect(cmd.hire(w, 'cook').ok).toBe(true);
    let due = -1;
    while (due < 0) { w.coins = 0; tick(w); const e = w.events.find(x => x.type === 'dayEnd'); if (e) due = Number(e.wages); }
    expect(due).toBeGreaterThan(0);
    expect(w.stats.wagesOwed).toBe(due);
    expect(w.stats.spend.wages ?? 0).toBeLessThan(due);
    expect(inspectionCounters(w).wages).toBe(due);
  });
  it('Profit = (income − wages owed) per day ÷ target: a known wage bill lowers it exactly', () => {
    const w = newGame(3);
    const target = siteDef(w.site).profitTarget;
    const bucket = (income: number, wages: number) => ({ h: 0, moodSum: 0, moodN: 0, escaped: 0, unsolved: 0, released: 0, income, wages, beds: 6 });
    w.inspection.hours = Array.from({ length: 24 }, () => bucket(target / 24, 0));
    expect(scoresOf(w).profit).toBeCloseTo(100);
    w.inspection.hours = Array.from({ length: 24 }, () => bucket(target / 24, target / 96));
    expect(scoresOf(w).profit).toBeCloseTo(75);
  });
});

describe('escape score (deviation 22: coverage at the rascal\'s tile, 0.85 inside a guard radius)', () => {
  it('no guard → score 1; a guard on the rascal\'s tile → (1 − 0.85)', () => {
    const w = newGame(5);
    tick(w); cmd.skipTutorial(w);
    const a = rascals(w)[0] ?? w.agents[0];
    const base = { ...a, flags: 0, traits: [] as typeof a.traits, mood: 50, x: 10.5, y: 12.5 };
    expect(escapeScore(w, base)).toBeCloseTo(1);
    expect(cmd.hire(w, 'cook').ok).toBe(true);                // guards need a guard post: re-badge a staff member
    const g = w.agents.filter(x => x.role === 'cook').at(-1)!;
    g.role = 'guard'; g.flags = 0; g.x = base.x; g.y = base.y;
    expect(escapeScore(w, base)).toBeCloseTo(0.15);
  });
});

describe('small guards the mutation run found uncovered', () => {
  it('one counted horn tap per ferry: a second tap while it arrives returns cooldown and counts nothing', () => {
    const w = newGame(2);
    while (w.ferry.state !== 'arriving') tick(w);
    expect(cmd.tapHorn(w).ok).toBe(true);
    const n = w.stats.horntaps, today = w.taps.horn;
    expect(cmd.tapHorn(w)).toEqual({ ok: false, reason: 'cooldown' });
    expect(w.stats.horntaps).toBe(n);
    expect(w.taps.horn).toBe(today);
  });
  it(`director slots: random gaps lie in ${DIRECTOR.minGapSec}–${DIRECTOR.maxGapSec} s, no empty slot before ${DIRECTOR.emptySlotsFromSec} s`, () => {
    for (const seed of [4, 9]) {
      const w = newGame(seed); const bot = new BotDriver(w, { profile: 'casual', seed });
      let prevNext = 0;
      const gaps: number[] = [];
      while (w.rtMs < 22 * 60_000) {
        tick(w); bot.step();
        const nx = w.director.nextMs;
        if (nx !== prevNext && prevNext && nx > w.rtMs + 6000) gaps.push((nx - w.rtMs) / 1000);
        prevNext = nx;
        if (w.rtMs < DIRECTOR.emptySlotsFromSec * 1000) expect(w.director.data.emptySlots ?? 0).toBe(0);
      }
      expect(gaps.length).toBeGreaterThan(3);
      for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(DIRECTOR.minGapSec - 0.2); expect(g).toBeLessThanOrEqual(DIRECTOR.maxGapSec + 0.2); }
    }
  }, 60_000);
  it(`completion: ${COMPLETION.percentPerSite} % per passed site (deviation 4, RULES_CHECK §6), reported after the pass`, () => {
    const w = newGame(1);
    expect(completionPercent(w)).toBe(0);
    onInspectionPassed(w, 1);
    expect(completionPercent(w)).toBe(50);
    expect(w.events.filter(e => e.type === 'completion').at(-1)?.percent).toBe(50);
    onInspectionPassed(w, 2);                                  // a second pass of the same site adds nothing
    expect(completionPercent(w)).toBe(50);
  });
});
