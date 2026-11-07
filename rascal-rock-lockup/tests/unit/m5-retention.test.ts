/**
 * M5 retention (docs/M5_DESIGN.md §4.2, §7–§10; Brief §3.12, §3.15, §3.16, §5, H4, H5). Owner: sim-retention.
 * Every wall-clock test runs on an injected FakeClock – the sim never reads real time.
 */
import { describe, it, expect } from 'vitest';
import { newGame, tick, cmd, runFor } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { encode, decode, plainToWorld, worldToPlain, DEFAULT_SETTINGS } from '../../src/save/serialize';
import { FakeClock, localDayOf } from '../../src/sim/clock';
import { planAway, ticksFor, CatchUp, applyOfflineFormula, offlineCoins, incomePerMin1x, offlineTick, incomeCounter } from '../../src/sim/offline';
import { syncWall, beginSession, resumeSession, markSessionEnd } from '../../src/sim/wall';
import { mailBadge, mailAllClaimed, taskProgress, mailTarget, mailReward } from '../../src/sim/mail';
import { vipBoard } from '../../src/sim/vip';
import { escapeScore, escapeRisk, foodFightMeter01, foodRuckusLocked } from '../../src/sim/director';
import { tickMs, dayOf } from '../../src/sim/time';
import { roomsOf, roomById } from '../../src/sim/world';
import { rascals } from '../../src/sim/agents';
import { staffOf } from '../../src/sim/staff';
import { BotDriver } from '../../tools/bots';
import { OFFLINE, DIRECTOR, RUF, STARS, releaseBounty } from '../../src/content/balance';
import { MAIL, MAIL_POOL, DIRECTOR_RET } from '../../src/content/retention';
import { AF, TICKS_PER_DAY, TICKS_PER_HOUR, type World } from '../../src/sim/types';

const H = 3_600_000, MIN = 60_000;
const clone = (w: World) => plainToWorld(worldToPlain(w));
const skip = (w: World) => { tick(w); cmd.skipTutorial(w); };
/** a fresh game with a measured income of `perMin` coins per 1x-minute */
const withIncome = (perMin: number, seed = 1) => { const w = newGame(seed); w.offline.ring = [perMin, perMin, perMin, perMin, perMin]; return w; };
/** run the casual bot until `pred` or `maxMs` */
function botUntil(seed: number, maxMs: number, pred: (w: World) => boolean = () => false) {
  const w = newGame(seed); const bot = new BotDriver(w, { profile: 'casual', seed });
  while (w.rtMs < maxMs && !pred(w)) { tick(w); bot.step(); }
  return { w, bot };
}
const firstEvent = (w: World, type: string) => w.events.find(e => e.type === type);

// ====================================================================== H4: offline, absence tiers, clamps
describe('offline earnings and absence tiers (Brief §3.15, H4)', () => {
  it('tiers: < 1 s none, < 60 s silent, 60 s – 5 min catch-up, ≥ 5 min formula', () => {
    const w = newGame(1);
    expect(planAway(w, 999).mode).toBe('none');
    expect(planAway(w, 59_999).mode).toBe('silent');
    expect(planAway(w, 60_000).mode).toBe('catchup');
    expect(planAway(w, 299_999).mode).toBe('catchup');
    expect(planAway(w, 300_000).mode).toBe('formula');
  });
  it('time jumps are clamped: negative / NaN → nothing, +10 years and Infinity → the 2 h cap', () => {
    const w = withIncome(100);
    for (const bad of [-5000, -10 * 365 * 86_400_000, NaN, -Infinity]) {
      expect(planAway(w, bad).mode).toBe('none');
      expect(offlineCoins(w, bad).coins).toBe(0);
    }
    const capCoins = 100 * 120 * OFFLINE.baseEff; // perMin × 120 min × 40 %
    for (const huge of [10 * 365 * 86_400_000, Infinity, 2 * H + 1]) {
      expect(planAway(w, huge).mode).toBe('formula');
      expect(offlineCoins(w, huge).coins).toBe(capCoins);
    }
  });
  it('nothing earned (no measured minute yet): no "+0" return panel, project timers still advance', () => {
    const w = newGame(1);
    w.projects.running = { id: 'recipeBook', leftMs: 90_000, totalMs: 90_000 };
    applyOfflineFormula(w, 30 * MIN);
    expect(w.offline.pending).toBeNull();
    expect(w.projects.running).toBeNull();
  });
  it('formula = income/min × min(away, cap) × efficiency; return-panel state, collect once', () => {
    const w = withIncome(100);
    expect(incomePerMin1x(w)).toBe(100);
    applyOfflineFormula(w, 10 * MIN);
    expect(w.offline.pending).toEqual({ coins: 400, awayMs: 10 * MIN, effPct: 40, capMs: 2 * H, capped: false });
    expect(w.events.some(e => e.type === 'offlinePending' && e.coins === 400)).toBe(true);
    const c0 = w.coins;
    expect(cmd.collectOffline(w)).toEqual({ ok: true, cost: -400 });
    expect(w.coins).toBe(c0 + 400);
    expect(w.offline.pending).toBeNull();
    expect(cmd.collectOffline(w)).toEqual({ ok: false, reason: 'none' });
    // offline coins never feed the income window (no compounding)
    expect(incomeCounter(w)).toBe(0);
  });
  it('the cap: 10 h away pays 2 h; each offlineCap perk level adds 1 h; leads add +10 pp efficiency', () => {
    const w = withIncome(100);
    applyOfflineFormula(w, 10 * H);
    expect(w.offline.pending).toMatchObject({ coins: 4800, awayMs: 2 * H, capped: true, capMs: 2 * H });
    const p = withIncome(100);
    p.prestige.perks.offlineCap = 1;
    p.leads.slots[0] = 'intake';
    applyOfflineFormula(p, 10 * H);
    expect(p.offline.pending).toMatchObject({ coins: Math.floor(100 * 180 * 0.5), awayMs: 3 * H, effPct: 50, capMs: 3 * H });
  });
  it('an uncollected result is added to, never lost', () => {
    const w = withIncome(100);
    applyOfflineFormula(w, 10 * MIN);
    applyOfflineFormula(w, 3 * H);
    expect(w.offline.pending).toMatchObject({ coins: 400 + 4800, awayMs: 10 * MIN + 2 * H, capped: true });
  });
  it('project timers keep running offline (by the capped time); a walking inspection does not', () => {
    const w = withIncome(10);
    w.projects.running = { id: 'mattresses', leftMs: 50_000, totalMs: 90_000 };
    applyOfflineFormula(w, 10 * MIN);
    expect(w.projects.running).toBeNull();
    expect(w.projects.done.mattresses).toBe(true);
    const v = withIncome(10);
    v.projects.running = { id: 'recipeBook', leftMs: 3 * H, totalMs: 3 * H };
    v.inspection.phase = 'walking'; v.inspection.startMs = v.rtMs;
    const insp = JSON.stringify(v.inspection);
    applyOfflineFormula(v, 10 * H);
    expect(v.projects.running!.leftMs).toBe(1 * H); // 3 h − the 2 h cap
    expect(JSON.stringify(v.inspection)).toBe(insp);
  });
  it('exact resim ticks across day and night: the smallest n with Σ tickMs ≥ away', () => {
    const w = newGame(1);
    expect(planAway(w, 30_000)).toMatchObject({ mode: 'silent', ticks: 300, blocks: [300] }); // 07:00, 100 ms/tick
    // 21:40 → crosses 22:00 (night ticks are 50 ms)
    w.t = 21 * TICKS_PER_HOUR + 50;
    const p = planAway(w, 120_000);
    let sum = 0; for (let i = 0; i < p.ticks; i++) sum += tickMs(w.t + i);
    expect(sum).toBeGreaterThanOrEqual(120_000);
    expect(sum - tickMs(w.t + p.ticks - 1)).toBeLessThan(120_000);
    expect(p.ticks).toBeGreaterThan(1200); // more than the day-tick estimate
    // just under 5 min from 23:00: two game days (2 × (16 h × 100 ms + 8 h × 50 ms) per 150 s) = 3 599 ticks
    w.t = TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
    const n = planAway(w, 299_950);
    expect(n.ticks).toBe(3599);
    expect(n.blocks).toEqual([3000, 599]);
    expect(ticksFor(w.t, 0)).toBe(0);
  });
  it('a paused world does not resim (the tab was hidden with the game paused)', () => {
    const w = newGame(1); w.speed = 0;
    expect(planAway(w, 120_000).mode).toBe('none');
    expect(planAway(w, 600_000).mode).toBe('formula');
  });
  it('catch-up runs in blocks of ≤ 3000 ticks spread over frames of ≤ 300, and equals playing those ticks', () => {
    const a = newGame(2), b = newGame(2);
    a.firstSession = b.firstSession = false; // (the first-session night skip has its own test below)
    skip(a); skip(b);
    runFor(a, 30_000); runFor(b, 30_000);
    const plan = planAway(a, 280_000);
    expect(plan.mode).toBe('catchup');
    const rt0 = a.rtMs;
    const cu = new CatchUp(a, plan.ticks, tick);
    let frames = 0, maxStep = 0;
    while (!cu.done) { const n = cu.step(); maxStep = Math.max(maxStep, n); frames++; }
    expect(maxStep).toBeLessThanOrEqual(OFFLINE.catchupTicksPerFrame);
    expect(frames).toBeGreaterThanOrEqual(Math.ceil(plan.ticks / OFFLINE.catchupTicksPerFrame));
    expect(cu.blocksDone).toBe(plan.blocks.length);
    for (let i = 0; i < plan.ticks; i++) tick(b);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.rtMs - rt0).toBeGreaterThanOrEqual(280_000);         // the resim covers the whole absence …
    expect(a.rtMs - rt0).toBeLessThan(280_000 + 100);             // … and not more
  });
  it('a first-session night skip inside the resim: the absence is still covered exactly (no overshoot)', () => {
    const w = newGame(2); skip(w);
    runFor(w, 30_000);
    const plan = planAway(w, 250_000), rt0 = w.rtMs;
    const cu = new CatchUp(w, plan.ticks, tick);
    cu.finish();
    expect(w.events.some(e => e.type === 'nightSkip' && e.rtMs > rt0)).toBe(true);
    expect(w.rtMs - rt0).toBeGreaterThanOrEqual(250_000);
    expect(w.rtMs - rt0).toBeLessThan(250_000 + 2000 + 100);     // + the 2 s "Next morning…" fade at most
  });
  it('a big step request is still cut to one block of ≤ 3000; extend() appends a second absence', () => {
    const w = newGame(3); skip(w);
    const cu = new CatchUp(w, 4500, tick);
    expect(cu.blocks).toEqual([3000, 1500]);
    expect(cu.step(10_000)).toBe(3000);
    cu.extend(2000);
    expect(cu.left).toBe(3500);
    expect(cu.blocks).toEqual([3000, 500]);
    cu.finish();
    expect(cu.done).toBe(true);
  });
  it('income window: one ring minute per 60 s of active play; a migrated save restarts the minute instead of booking its history', () => {
    const w = newGame(4); skip(w);
    runFor(w, 6 * MIN + 1000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); });
    expect(w.offline.ring.length).toBe(OFFLINE.ringMinutes);
    // M4 save: ringMs 0 at a large rtMs, all income already in the stats
    const m = clone(w);
    m.offline = { ring: [], ringLife: 0, ringMs: 0, pending: null, collected: 0 };
    offlineTick(m);
    expect(m.offline.ring).toEqual([]);
    expect(m.offline.ringLife).toBe(incomeCounter(m));
    expect(m.offline.ringMs).toBe(m.rtMs);
  });
  it('H4: save → load keeps the offline state and the hash; a catch-up after the load stays deterministic', () => {
    const w = withIncome(250, 5); skip(w); runFor(w, 20_000);
    applyOfflineFormula(w, 20 * MIN);
    const doc = decode(encode(w, DEFAULT_SETTINGS, 1, 1_700_000_000_000))!;
    const l = plainToWorld(doc.world);
    expect(stateHash(l)).toBe(stateHash(w));
    expect(l.offline.pending).toEqual(w.offline.pending);
    const p = planAway(l, 90_000), q = planAway(w, 90_000);
    new CatchUp(l, p.ticks, tick).finish(); new CatchUp(w, q.ticks, tick).finish();
    expect(stateHash(l)).toBe(stateHash(w));
  });
});

// ====================================================================== H5: daily mail
describe('daily mail (Brief §3.16, §5, H5)', () => {
  const T0 = Date.UTC(2026, 10, 5, 12, 0);
  it('3 tasks per local day, reset exactly at 00:00 LOCAL time (tz from the Clock)', () => {
    const clock = new FakeClock(Date.UTC(2026, 10, 5, 21, 58), 120); // 23:58 in UTC+2
    const w = newGame(1);
    beginSession(w, clock.now(), clock.tzOffsetMin());
    const day = w.mail.day, ids = w.mail.tasks.map(t => t.id);
    expect(w.mail.tasks.length).toBe(MAIL.tasksPerDay);
    expect(day).toBe(localDayOf(clock.now(), 120));
    w.taps.horn = 5; w.taps.crates = 7;
    clock.advance(MIN); syncWall(w, clock.now(), clock.tzOffsetMin()); // 23:59 local
    expect(w.mail.day).toBe(day);
    clock.advance(MIN); syncWall(w, clock.now(), clock.tzOffsetMin()); // 00:00 local = 22:00 UTC
    expect(w.mail.day).toBe(day + 1);
    expect(w.mail.tasks.map(t => t.id)).not.toEqual(ids);
    expect(w.taps.horn + w.taps.crates).toBe(0);           // "today" tap counts follow the local day
    expect(w.events.filter(e => e.type === 'mailNewDay').length).toBe(2);
  });
  it('a clock turned back never re-rolls the mail (no double-reset abuse)', () => {
    const clock = new FakeClock(T0, 0);
    const w = newGame(2);
    beginSession(w, clock.now(), 0);
    clock.advance(24 * H); syncWall(w, clock.now(), 0);
    const tasks = JSON.stringify(w.mail.tasks), day = w.mail.day;
    clock.advance(-48 * H); syncWall(w, clock.now(), 0);   // two days back
    clock.advance(24 * H); syncWall(w, clock.now(), 0);    // and forward to "today" again
    expect(w.mail.day).toBe(day);
    expect(JSON.stringify(w.mail.tasks)).toBe(tasks);
    // a time-zone change that moves the local day back does not re-roll either
    syncWall(w, clock.now(), -720);
    expect(w.mail.day).toBe(day);
  });
  it('never repeats yesterday\'s tasks, only offers doable ones, never touches the sim RNG', () => {
    const w = newGame(3), rng = w.rngState;
    let prev: string[] = [];
    for (let d = 0; d < 30; d++) {
      syncWall(w, T0 + d * 24 * H, 0);
      const ids = w.mail.tasks.map(t => t.id);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(prev).not.toContain(id);
      // a fresh game: no project board, no food fight, no tunnel seen yet
      for (const id of ids) expect(['project', 'foodCalm', 'catch']).not.toContain(id);
      prev = ids;
    }
    expect(w.rngState).toBe(rng);
    // once the systems exist they join the pool
    w.ruf = STARS[1]; w.director.data.foodDone = 1; w.director.data.tunnelDone = 1;
    const seen = new Set<string>();
    for (let d = 30; d < 80; d++) { syncWall(w, T0 + d * 24 * H, 0); w.mail.tasks.forEach(t => seen.add(t.id)); }
    for (const id of ['project', 'foodCalm', 'catch']) expect(seen.has(id), id).toBe(true);
  });
  it('targets: day 1 is the lowest rung; later days follow the player\'s own pace (≈ 10 min of active play)', () => {
    const w = newGame(4);
    for (const p of MAIL_POOL) expect(mailTarget(w, p), p.id).toBe(p.targets[0]);
    const rel = MAIL_POOL.find(p => p.id === 'release')!;
    w.rtMs = 20 * MIN; w.stats.released = 20;                 // 1 release per minute → 10 in 10 min → rung 8
    expect(mailTarget(w, rel)).toBe(8);
    w.stats.released = 2;                                     // slow player: the lowest rung
    expect(mailTarget(w, rel)).toBe(rel.targets[0]);
    const up = MAIL_POOL.find(p => p.id === 'upgrade')!;
    w.ruf = STARS[1];                                         // 2★ → rung 1
    expect(mailTarget(w, up)).toBe(up.targets[1]);
  });
  it('reward scales with the current income (+25 % with the mail perk)', () => {
    const w = newGame(5);
    expect(mailReward(w, 0)).toBe(MAIL.minReward);
    expect(mailReward(w, 1000)).toBe(1000 * MAIL.rewardMinutes);
    w.prestige.perks.mail = 1;
    expect(mailReward(w, 1000)).toBe(Math.round(1000 * MAIL.rewardMinutes * 1.25));
    const r = withIncome(1000, 5);
    syncWall(r, T0, 0);
    expect(r.mail.tasks.every(t => t.reward === 3000)).toBe(true);
  });
  it('session 1: the quiet icon not before minute 12 (and only after the tutorial); a returning session at once', () => {
    const w = newGame(6);
    beginSession(w, T0, 0, false);
    skip(w);
    runFor(w, 11.5 * MIN);
    expect(w.mail.visible).toBe(false);
    expect(mailBadge(w)).toBe(false);
    runFor(w, MIN);
    expect(w.mail.visible).toBe(true);
    expect(mailBadge(w)).toBe(true);                          // new day not seen yet
    expect(cmd.seeMail(w).ok).toBe(true);
    expect(w.mail.seenDay).toBe(w.mail.day);
    const r = newGame(6);
    beginSession(r, T0, 0, true);
    tick(r);
    expect(r.mail.visible).toBe(false);                       // still in the tutorial
    skip(r); tick(r);
    expect(r.mail.visible).toBe(true);
  });
  it('claim rules and 1 golden key per 3 completed mail days', () => {
    const w = newGame(7);
    skip(w); w.firstSession = false;
    expect(cmd.claimMail(w, 0)).toEqual({ ok: false, reason: 'locked' });
    const keys0 = w.keys;
    for (let d = 0; d < 3; d++) {
      syncWall(w, T0 + d * 24 * H, 0);
      tick(w);
      expect(w.mail.visible).toBe(true);
      expect(cmd.claimMail(w, 0).reason).toBe('notDone');
      expect(cmd.claimMail(w, 9).reason).toBe('invalid');
      expect(cmd.claimMail(w, 1.5).reason).toBe('invalid');
      // complete the tasks through their counters
      for (const t of w.mail.tasks) { const c = MAIL_POOL.find(p => p.id === t.id)!.counter; w.mail.count[c] = (w.mail.count[c] ?? 0) + t.target; }
      tick(w);
      w.mail.tasks.forEach(t => expect(taskProgress(w, t)).toBe(t.target));
      expect(mailBadge(w)).toBe(true);
      for (let i = 0; i < 3; i++) expect(cmd.claimMail(w, i).ok).toBe(true);
      expect(cmd.claimMail(w, 0).reason).toBe('claimed');
      expect(mailAllClaimed(w)).toBe(true);                   // UI teaser "New mail tomorrow"
      expect(w.keys).toBe(keys0 + (d === 2 ? 1 : 0));
    }
    expect(w.mail.daysCompleted).toBe(3);
    expect(w.mail.streak).toBe(0);
    expect(w.events.some(e => e.type === 'keysEarned' && e.source === 'mail')).toBe(true);
    expect(w.stats.income.mail).toBeGreaterThan(0);
  });
  it('mail tasks count real play: releases, crates and upgrades move their tasks', () => {
    const { w } = botUntil(8, 1000);
    syncWall(w, T0, 0);
    const base = { ...w.mail.count };
    const b = new BotDriver(w, { profile: 'casual', seed: 8 });
    while (w.rtMs < 9 * MIN) { tick(w); b.step(); }
    expect((w.mail.count.released ?? 0) - (base.released ?? 0)).toBeGreaterThan(0);
    expect((w.mail.count.cratesSold ?? 0) - (base.cratesSold ?? 0)).toBeGreaterThan(0);
    expect((w.mail.count.upgrades ?? 0) - (base.upgrades ?? 0)).toBeGreaterThan(0);
    expect((w.mail.count.earned ?? 0) - (base.earned ?? 0)).toBeGreaterThan(0);
  }, 30_000);
});

// ====================================================================== H5: morning VIP
describe('morning VIP (Brief §5.4, H5)', () => {
  /** a world whose first game day just ended (teased) while the wall clock read `now` */
  function teased(now: number, tz = 0, seed = 1) {
    const w = newGame(seed);
    beginSession(w, now - MIN, tz);
    skip(w);
    while (w.vip.phase === 'none') tick(w);
    syncWall(w, now, tz);
    markSessionEnd(w, now, tz);
    return w;
  }
  it('teased at the end of game day 1; from game day 3 the board stays visible', () => {
    const w = newGame(1); skip(w);
    expect(vipBoard(w)).toBe('hidden');
    while (w.vip.phase === 'none') tick(w);
    expect(dayOf(w.t)).toBe(1);
    expect(vipBoard(w)).toBe('teaser');
    w.vip.phase = 'arrived';
    expect(vipBoard(w)).toBe('hidden');
    while (dayOf(w.t) < 2) tick(w);
    expect(w.vip.boardPermanent).toBe(true);
    expect(vipBoard(w)).toBe('teaser');
  });
  it('(a) new local day AND ≥ 4 h since the session end → ready on the next session start', () => {
    const end = Date.UTC(2026, 10, 5, 21, 0);
    const w = teased(end);
    const c = new FakeClock(end, 0);
    c.advance(3.5 * H); beginSession(w, c.now(), 0, true);   // 00:30, new day but < 4 h
    expect(w.vip.phase).toBe('teased');
    c.advance(0.5 * H); resumeSession(w, c.now(), 0);         // 01:00, new day and 4 h
    expect(w.vip.phase).toBe('ready');
    expect(vipBoard(w)).toBe('ready');
    expect(w.director.data.vipNext).toBe(1);
    expect(w.director.data.vipMorning).toBe(1);
    expect(w.events.some(e => e.type === 'vipReady')).toBe(true);
  });
  it('(b) ≥ 8 h on the same local day → ready; 7 h 59 min → not', () => {
    const end = Date.UTC(2026, 10, 5, 8, 0);
    const w = teased(end);
    beginSession(w, end + 8 * H - MIN, 0, true);
    expect(w.vip.phase).toBe('teased');
    beginSession(w, end + 8 * H, 0, true);
    expect(w.vip.phase).toBe('ready');
  });
  it('(a) uses the LOCAL calendar day: same UTC day but a new local day counts', () => {
    const end = Date.UTC(2026, 10, 5, 3, 0);                  // 22:00 on Nov 4 in UTC−5
    const w = teased(end, -300);
    beginSession(w, end + 4 * H, -300, true);                 // 02:00 local on Nov 5 (UTC: same day 07:00)
    expect(w.vip.phase).toBe('ready');
    const u = teased(end, 0);
    beginSession(u, end + 4 * H, 0, true);                    // UTC: same day, 4 h → not yet
    expect(u.vip.phase).toBe('teased');
  });
  it('an older session end never makes "Tomorrow" come true in the same session', () => {
    const now = Date.UTC(2026, 10, 5, 10, 0);
    const w = newGame(2);
    beginSession(w, now, 0);
    markSessionEnd(w, now - 20 * H, 0);                       // last save of an earlier session
    skip(w);
    while (w.vip.phase === 'none') tick(w);
    syncWall(w, now + MIN, 0);
    expect(w.vip.phase).toBe('teased');
    expect(w.vip.sessionEndMs).toBeGreaterThanOrEqual(now);
    // the machine slept 8 h with the tab open: the 1 Hz wall sync notices
    syncWall(w, now + 9 * H, 0);
    expect(w.vip.phase).toBe('ready');
  });
  it('ready → the next ferry brings the Cat Burglar: sentence 150, high escape risk, ×5 bounty; then teased again', () => {
    const { w, bot } = botUntil(3, 4 * MIN);
    w.vip.phase = 'teased'; w.vip.sessionEndMs = 1; w.vip.sessionEndDay = 0;
    beginSession(w, 9 * H, 0, true);
    expect(w.vip.phase).toBe('ready');
    const phase = () => w.vip.phase;
    while (phase() === 'ready' && w.rtMs < 12 * MIN) { tick(w); bot.step(); }
    expect(w.vip.phase).toBe('arrived');
    expect(w.vip.arrivals).toBe(1);
    const ev = w.events.find(e => e.type === 'vipArrived')!;
    const cat = w.agents.find(a => a.id === ev.id)!;
    expect(cat.flags & AF.vip).toBeTruthy();
    expect(cat.name).toBe('Cat Burglar');
    expect(cat.sentence).toBe(150);
    expect(escapeRisk(w, cat)).toBe('high');
    expect(releaseBounty(2, true)).toBe(releaseBounty(2, false) * 5);
    expect(w.director.data.vipMorning).toBe(0);
    const day = dayOf(w.t);
    while (dayOf(w.t) === day) { tick(w); bot.step(); }
    expect(w.vip.phase).toBe('teased');
  }, 30_000);
  it('the director\'s own VIP does not count as the morning VIP', () => {
    const { w, bot } = botUntil(4, 3 * MIN);
    w.vip.phase = 'teased';
    w.director.data.vipNext = 1;                             // director slot 'vip'
    while (w.director.data.vipNext && w.rtMs < 9 * MIN) { tick(w); bot.step(); }
    expect(w.director.data.vipNext).toBe(0);
    expect(w.vip.phase).toBe('teased');
    expect(w.events.some(e => e.type === 'vipArrived')).toBe(false);
  }, 30_000);
});

// ====================================================================== director (Brief §3.12)
describe('director (Brief §3.12)', () => {
  it('the Cat Burglar escape score: sneaky ×2 and the VIP factor on top', () => {
    const w = newGame(1);
    const a = rascals(w)[0] ?? w.agents[0];
    const base = { ...a, flags: 0, traits: [] as typeof a.traits, mood: 50, x: 0, y: 0 };
    expect(escapeScore(w, base)).toBeCloseTo(1);
    expect(escapeScore(w, { ...base, traits: ['sneaky'] })).toBeCloseTo(2);
    expect(escapeScore(w, { ...base, traits: ['sneaky'], flags: AF.vip })).toBeCloseTo(2 * DIRECTOR_RET.vipEscapeMult);
    expect(escapeRisk(w, { ...base, flags: AF.vip })).toBe('high');
    expect(escapeRisk(w, base)).toBe('low');
  });
  it('scripted food fight lands in the ~10:00 window (±20 %) for several seeds; first food fight = the scripted one', () => {
    for (const seed of [1, 2, 3]) {
      const { w } = botUntil(seed, 13 * MIN, x => x.director.active === 'food');
      const ff = firstEvent(w, 'foodFight');
      expect(ff, `seed ${seed}`).toBeTruthy();
      expect(ff!.scripted).toBe(true);
      expect(ff!.rtMs).toBeGreaterThanOrEqual(DIRECTOR.scriptedFoodFightSec * 1000);
      expect(ff!.rtMs).toBeLessThanOrEqual(630_000 * 1.2);
      expect((ff!.ids as number[]).length).toBeGreaterThanOrEqual(DIRECTOR_RET.brawlersMin);
      expect((ff!.ids as number[]).length).toBeLessThanOrEqual(DIRECTOR_RET.brawlersMax);
    }
  }, 60_000);
  it('food fight (scripted too) and ruckus stay locked until 5 min after the tutorial end', () => {
    const w = newGame(5);
    const bot = new BotDriver(w, { profile: 'casual', seed: 5 });
    while (w.rtMs < 9 * MIN) { tick(w); bot.step(); }
    w.director.data.tutorialEndMs = 8 * MIN;                 // a late tutorial end: locked until 13:00
    expect(foodRuckusLocked(w)).toBe(true);
    while (w.rtMs < 16 * MIN) { tick(w); bot.step(); }
    const ff = firstEvent(w, 'foodFight');
    expect(ff).toBeTruthy();
    expect(ff!.rtMs).toBeGreaterThanOrEqual(13 * MIN);
    expect(w.events.filter(e => e.type === 'ruckus' && e.rtMs < 13 * MIN).length).toBe(0);
  }, 30_000);
  it('never two events at once, nothing in the tutorial, no empty slots before minute 15', () => {
    for (const seed of [1, 6]) {
      const w = newGame(seed); const bot = new BotDriver(w, { profile: 'casual', seed });
      let checked = 0;
      while (w.rtMs < 25 * MIN) {
        tick(w); bot.step();
        const esc = w.agents.filter(a => a.state === 'escaping').length, brawl = w.agents.filter(a => a.state === 'brawling').length;
        expect(esc && brawl, `seed ${seed} t ${w.rtMs}`).toBeFalsy();
        if (esc) expect(w.director.active).toBe('tunnel');
        if (brawl) expect(w.director.active).toBe('food');
        if (w.tutorial.active) expect(w.director.active).toBeNull();
        if (w.rtMs < DIRECTOR.emptySlotsFromSec * 1000) expect(w.director.data.emptySlots ?? 0).toBe(0);
        checked++;
      }
      expect(checked).toBeGreaterThan(10_000);
      // every start happened while nothing else was active: tunnel/foodFight/ruckus starts never overlap
      const starts = w.events.filter(e => ['tunnel', 'foodFight', 'ruckus'].includes(e.type)).map(e => e.rtMs);
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(8000);
    }
  }, 120_000);
  describe('food fight flow', () => {
    let at: World | null = null;
    const fight = (guards = false) => {
      if (!at) at = botUntil(2, 13 * MIN, x => x.director.active === 'food').w;
      expect(at.director.active).toBe('food');
      const w = clone(at);
      if (!guards) w.agents = w.agents.filter(a => a.role !== 'guard'); // no help unless a test wants it
      return w;
    };
    it('tapping every brawler solves it: +5 Ruf, +fun, foodSolved; one effect per brawler', () => {
      const w = fight();
      const brawlers = w.agents.filter(a => a.state === 'brawling');
      expect(brawlers.length).toBeGreaterThanOrEqual(DIRECTOR_RET.brawlersMin);
      const fun = new Map(brawlers.map(a => [a.id, a.needs.fun]));
      const ruf = w.ruf;
      tick(w);
      expect(foodFightMeter01(w)).toBeGreaterThan(0);
      expect(cmd.tapRangler(w, brawlers[0].id).ok).toBe(true);
      expect(cmd.tapRangler(w, brawlers[0].id)).toMatchObject({ ok: false, reason: 'none' }); // no double effect
      for (const b of brawlers.slice(1)) expect(cmd.tapRangler(w, b.id).ok).toBe(true);
      tick(w);
      expect(w.director.active).toBeNull();
      expect(w.ruf - ruf).toBe(RUF.eventSolved);
      expect(w.events.some(e => e.type === 'foodSolved')).toBe(true);
      expect(w.events.filter(e => e.type === 'calmed' && e.by === 'tap').length).toBe(brawlers.length);
      for (const b of brawlers) expect(w.agents.find(a => a.id === b.id)!.needs.fun).toBeGreaterThanOrEqual(Math.min(100, fun.get(b.id)!));
      expect(foodFightMeter01(w)).toBe(0);
    });
    it('ignored for 20 s: canteen blocked 30 s, cleanliness −50, guests stand up, counts as unsolved', () => {
      const w = fight();
      const c = roomById(w, w.director.data.foodRoom)!;
      const unsolved = w.stats.unsolved, t0 = w.director.activeSinceMs;
      let before = c.clean;
      while (w.director.active === 'food') { before = c.clean; tick(w); }
      expect(w.events.some(e => e.type === 'foodLost')).toBe(true);
      expect(w.rtMs - t0).toBeGreaterThanOrEqual(DIRECTOR.foodFightFillSec * 1000);
      expect(w.stats.unsolved).toBe(unsolved + 1);
      expect(c.clean).toBeLessThanOrEqual(Math.max(0, before - 50) + 1); // (a janitor may sweep in the same tick)
      expect(c.blockedUntilMs - w.rtMs).toBeGreaterThan(29_000);
      expect(w.agents.some(a => a.state === 'brawling')).toBe(false);
      expect(w.agents.some(a => a.state === 'using' && a.act?.roomId === c.id)).toBe(false);
    });
    it('a guard covering the canteen calms one brawler every 3 s', () => {
      const w = fight(true);
      const c = roomById(w, w.director.data.foodRoom)!;
      const g = staffOf(w, 'guard')[0];
      expect(g, 'the casual bot has a guard by 10:00').toBeTruthy();
      g.flags &= ~AF.offDuty; g.x = c.x + c.w / 2; g.y = c.y + c.h / 2; g.tx = g.x; g.ty = g.y;
      const n = w.agents.filter(a => a.state === 'brawling').length;
      const t0 = w.rtMs;
      while (w.director.active === 'food' && w.rtMs - t0 < 20_000) { tick(w); g.x = c.x + c.w / 2; g.y = c.y + c.h / 2; }
      const byGuard = w.events.filter(e => e.type === 'calmed' && e.by === 'guard' && e.rtMs > t0);
      expect(byGuard.length).toBe(n);                         // nobody tapped: the guard calmed them all
      expect(w.events.some(e => e.type === 'foodSolved')).toBe(true);
      for (let i = 1; i < byGuard.length; i++) expect(byGuard[i].rtMs - byGuard[i - 1].rtMs).toBeGreaterThanOrEqual(DIRECTOR_RET.guardCalmSec * 1000 - 1);
    });
  });
  it('ruckus: mood < 20 for 30 s → 30 s work stop, an active event (nothing else starts meanwhile)', () => {
    const w = newGame(9); skip(w);
    runFor(w, 60_000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); });
    const sad = (x: World) => { for (const a of rascals(x)) { a.mood = 5; a.needs.fun = 0; a.needs.hunger = 0; a.needs.hygiene = 0; a.needs.energy = 0; } };
    // still inside the lock (tutorial end + 5 min): nothing
    runFor(w, 60_000, sad);
    expect(w.events.some(e => e.type === 'ruckus')).toBe(false);
    w.director.data.tutorialEndMs = -10 * MIN;               // lock over
    w.director.data.tunnelDone = 1;
    runFor(w, 45_000, x => { sad(x); });
    const r = firstEvent(w, 'ruckus');
    expect(r).toBeTruthy();
    expect(w.director.active === 'ruckus' || w.rtMs - r!.rtMs >= DIRECTOR.ruckusDurationSec * 1000).toBe(true);
    for (const room of roomsOf(w, 'workshop')) expect(room.blockedUntilMs).toBeGreaterThan(r!.rtMs);
    const during = w.events.filter(e => (e.type === 'tunnel' || e.type === 'foodFight') && e.rtMs > r!.rtMs && e.rtMs < r!.rtMs + DIRECTOR.ruckusDurationSec * 1000);
    expect(during.length).toBe(0);
  });
});
