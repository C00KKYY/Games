/**
 * G2 feedback (docs/G2_FEEDBACK.md): the hook-step changes that have pure, testable parts.
 *  - the petty offender (2nd arrival: short sentence, his own file, petty bounty) and Earl's cake file – deterministic
 *  - the guided build chain (src/ui/guide.ts): Rooms → card → spot → staff → hire, a valid suggested spot, read-only
 *  - the "Tap crate stacks" tip while saving up, release lines
 */
import { describe, it, expect } from 'vitest';
import { newGame, tick, cmd } from '../../src/sim/sim';
import { TUTORIAL_STEPS } from '../../src/sim/objectives';
import { roomsOf } from '../../src/sim/world';
import { stateHash } from '../../src/sim/hash';
import { AF, type World } from '../../src/sim/types';
import { TUTORIAL_WASH } from '../../src/content/site1';
import { SENTENCE, RUF, ECON, ROOMS } from '../../src/content/balance';
import { OFFENCES, RELEASE_QUOTES } from '../../src/content/gags';
import { buildGoal, guideStep, suggestSpot, savingsEta, missingStaff } from '../../src/ui/guide';
import { validatePlacement } from '../../src/sim/rooms';
import { jitPick, newJitMemo } from '../../src/ui/tutorial';
import { quoteFor, isPetty } from '../../src/ui/arrivalCards';

const run = (w: World, ms: number, each?: () => void) => { const end = w.rtMs + ms; while (w.rtMs < end) { tick(w); each?.(); } };
/** the tutorial played like the pointer says (1 s reactions) */
function playTutorial(seed: number) {
  const w = newGame(seed);
  let next = 1000;
  run(w, 120_000, () => {
    if (w.rtMs < next || !w.tutorial.active) return;
    const s = TUTORIAL_STEPS[w.tutorial.step];
    let acted = false;
    if (s === 'horn' && w.ferry.state === 'arriving') acted = cmd.tapHorn(w).ok;
    else if (s === 'wash' && !roomsOf(w, 'wash').length) acted = cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h).ok;
    else if (s === 'stamp' && w.agents.some(a => a.state === 'atGate')) acted = cmd.stamp(w).ok;
    else if (s === 'upgrade') acted = cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, 1).ok;
    if (acted) next = w.rtMs + 1000;
  });
  return w;
}

describe('petty offender and Earl (sim, deterministic)', () => {
  it('Earl carries the cake file, the 2nd arrival is the petty offender with the umbrella file', () => {
    const w = newGame(7);
    run(w, 2500); cmd.tapHorn(w); run(w, 6000);
    const rs = w.agents.filter(a => a.kind === 'rascal').sort((a, b) => a.id - b.id);
    expect(rs.length).toBeGreaterThanOrEqual(4);
    const earl = rs.find(a => a.flags & AF.earl)!;
    expect(OFFENCES[earl.crime % OFFENCES.length].en).toMatch(/cake/i);
    const petty = rs.filter(a => !(a.flags & AF.earl))[0];
    expect(petty.sentence).toBe(SENTENCE.petty);
    expect(OFFENCES[petty.crime % OFFENCES.length].en).toMatch(/umbrella/i);
    expect(isPetty(petty)).toBe(true);
    // balance pass M5: the 3rd passenger is a short-timer too (release 3 at ~5:00), the 4th keeps the long first-ferry range
    const rest = rs.filter(x => !(x.flags & AF.earl) && x !== petty);
    rest.forEach((a, k) => {
      const [lo, hi] = k === SENTENCE.thirdIndex - SENTENCE.pettyIndex - 1 ? SENTENCE.third : SENTENCE.firstFerryRange;
      expect(a.sentence).toBeGreaterThanOrEqual(lo);
      expect(a.sentence).toBeLessThanOrEqual(hi);
    });
    // same seed → same world (no extra RNG draw)
    const v = newGame(7); run(v, 2500); cmd.tapHorn(v); run(v, 6000);
    expect(stateHash(v)).toBe(stateHash(w));
  });

  it('the petty release comes early, pays a petty bounty and a little reputation', () => {
    const w = playTutorial(11);
    const before = { ruf: w.ruf, rel: w.stats.released };
    let pettyAt = -1, bounty = 0, rufGain = 0;
    let seen = w.eventSeq;
    run(w, 240_000, () => {
      const n = Math.min(w.events.length, w.eventSeq - seen); seen = w.eventSeq;
      for (const e of w.events.slice(w.events.length - n)) if (e.type === 'release' && pettyAt < 0) {
        const a = w.agents.find(x => x.id === e.id);
        if (a && isPetty(a)) { pettyAt = w.rtMs; bounty = Number(e.bounty); }
      }
      if (pettyAt > 0 && !rufGain) rufGain = w.stats.rufBy.release - RUF.release * before.rel;
    });
    // with the tutorial only (no Knitting Nook) the petty offender still reforms passively; with a Nook it is ~2:40
    expect(pettyAt).toBeGreaterThan(0);
    expect(bounty).toBeCloseTo(ECON.releaseBase * (1 + ECON.releasePerStar * 0) * SENTENCE.pettyBounty, 0);
    expect(rufGain).toBe(SENTENCE.pettyRuf);
  });
});

describe('guided build chain (src/ui/guide.ts)', () => {
  it('Rooms → goal card → suggested spot → staff → hire, and the spot is valid', () => {
    const w = playTutorial(11);
    expect(w.tutorial.done).toBe(true);
    const g = buildGoal(w)!;
    expect(g.type).toBe('workshop');
    w.coins = Math.max(w.coins, g.cost + 200);
    const ui = { menu: null as string | null, tool: { kind: 'none' as string, type: undefined as never }, pending: false, spot: null };
    expect(guideStep(w, ui)?.kind).toBe('rooms');
    expect(guideStep(w, { ...ui, menu: 'rooms' })).toEqual({ kind: 'card', type: 'workshop' });
    const hash = stateHash(w);
    const spot = suggestSpot(w, 'workshop', ROOMS.workshop.minW, ROOMS.workshop.minH)!;
    expect(stateHash(w), 'suggestSpot is read-only').toBe(hash);
    expect(spot).toBeTruthy();
    expect(validatePlacement(newGameLike(w), 'workshop', spot.x, spot.y, spot.w, spot.h).reason).toBe('ok');
    expect(guideStep(w, { ...ui, tool: { kind: 'build', type: 'workshop' as never }, spot })).toEqual({ kind: 'spot', type: 'workshop', ...spot });
    expect(guideStep(w, { ...ui, tool: { kind: 'build', type: 'workshop' as never }, pending: true, spot })?.kind).toBe('confirm');
    // build it where the guide says → staff → hire
    expect(cmd.build(w, 'workshop', spot.x, spot.y, spot.w, spot.h).ok).toBe(true);
    run(w, 8000);
    expect(missingStaff(w)).toBe('foreman');
    w.coins += 500;
    expect(guideStep(w, ui)).toEqual({ kind: 'staff', role: 'foreman' });
    expect(guideStep(w, { ...ui, menu: 'staff' })).toEqual({ kind: 'hire', role: 'foreman' });
    expect(cmd.hire(w, 'foreman').ok).toBe(true);
    expect(missingStaff(w)).toBeNull();
  });

  it('no pointer while the goal is unaffordable; the savings ETA counts down', () => {
    const w = playTutorial(28);
    const g = buildGoal(w)!;
    w.coins = g.cost - 100;
    expect(buildGoal(w)!.affordable).toBe(false);
    expect(guideStep(w, { menu: null, tool: { kind: 'none' }, pending: false, spot: null })).toBeNull();
    w.offline.ring = [60, 60];
    expect(savingsEta(w, g.cost)).toBe(2);
    w.offline.ring = [];
    expect(savingsEta(w, g.cost)).toBeNull();
    w.coins = g.cost;
    expect(savingsEta(w, g.cost)).toBe(0);
  });

  it('"Tap crate stacks" tip only while saving up for the goal room', () => {
    const w = playTutorial(45);
    const g = buildGoal(w)!;
    w.coins = g.cost + 10;
    const sp = suggestSpot(w, g.type, g.size.w, g.size.h)!;
    expect(cmd.build(w, g.type, sp.x, sp.y, sp.w, sp.h).ok).toBe(true);
    run(w, 8000);
    const nook = roomsOf(w, 'workshop')[0];
    nook.stack = 2;
    const next = buildGoal(w)!;             // the Classroom
    expect(next.type).toBe('classroom');
    w.coins = 10;
    w.ferry.tapped = true;                  // no honking ferry in the way (it has a higher priority)
    for (const a of w.agents) if (a.state === 'waitingDock') a.state = 'idle';
    const m = newJitMemo();
    jitPick(w, m, 0, { buildTool: false });
    expect(jitPick(w, m, 5000, { buildTool: false })?.kind).toBe('earnFaster');
    w.coins = next.cost + 50;
    const m2 = newJitMemo();
    jitPick(w, m2, 0, { buildTool: false });
    expect(jitPick(w, m2, 5000, { buildTool: false, guide: true })?.kind).not.toBe('earnFaster');
  });
});

describe('release lines', () => {
  it('Earl and the petty offender pay off their files, everyone else draws from the pool (EN/DE)', () => {
    const earl = { id: 1, sentence: SENTENCE.earl, flags: AF.earl };
    const petty = { id: 2, sentence: SENTENCE.petty, flags: 0 };
    for (const l of ['en', 'de'] as const) {
      expect(quoteFor(earl, l)).toBe(RELEASE_QUOTES.earl[l]);
      expect(quoteFor(petty, l)).toBe(RELEASE_QUOTES.petty[l]);
      for (let id = 3; id < 20; id++) expect(RELEASE_QUOTES.pool.map(q => q[l])).toContain(quoteFor({ id, sentence: 100, flags: 0 }, l));
    }
    expect(RELEASE_QUOTES.pool.length).toBeGreaterThanOrEqual(6);
  });
});

/** a throw-away copy for validatePlacement (it rebuilds the grid) */
function newGameLike(w: World): World {
  const g = w.grid;
  const grid = { ...g, ground: g.ground.slice(), owned: g.owned.slice(), roomAt: g.roomAt.slice(), wallE: g.wallE.slice(), wallS: g.wallS.slice(), blocked: g.blocked.slice(), fixed: g.fixed.slice(), road: g.road.slice() };
  return { ...w, grid, rooms: w.rooms.map(r => ({ ...r, links: r.links.slice() })), poi: { ...w.poi }, cache: { ...w.cache, fields: new Map(w.cache.fields), doorRes: new Int32Array(0) }, events: [], log: [] };
}

describe('guide: level goals (Canteen level 5)', () => {
  it('points at the room, then at its upgrade button, only when the next level is affordable', async () => {
    const { upgradeGoal } = await import('../../src/ui/guide');
    const w = playTutorial(62);
    for (const id of ['workshop', 'classroom', 'guard', 'beds12', 'yard']) w.obj.done[id] = true;
    const can = roomsOf(w, 'canteen')[0];
    w.coins = 0;
    expect(upgradeGoal(w)).toBeNull();
    w.coins = 5000;
    const ui = { menu: null, tool: { kind: 'none' }, pending: false, spot: null };
    expect(guideStep(w, ui)).toEqual({ kind: 'room', roomId: can.id, type: 'canteen' });
    expect(guideStep(w, { ...ui, selRoom: can.id })).toEqual({ kind: 'upgrade', roomId: can.id, type: 'canteen' });
    expect(guideStep(w, { ...ui, menu: 'rooms' })).toBeNull();
  });
});
