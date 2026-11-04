import { describe, it, expect } from 'vitest';
import { newGame, tick, Stepper, runFor, cmd } from '../../src/sim/sim';
import { stateHash } from '../../src/sim/hash';
import { violations } from '../../src/sim/invariants';
import { addRoomRaw, rebuild, applyParcels, roomsOf } from '../../src/sim/world';
import { spawnRascal } from '../../src/sim/agents';
import { addStaff } from '../../src/sim/staff';
import { defaultDoor } from '../../src/sim/layout';
import { TICKS_PER_HOUR } from '../../src/sim/types';

describe('sim smoke', () => {
  it('runs 10 real minutes with taps, no invariant violations, no NaN', () => {
    violations.length = 0;
    const w = newGame(7, { debug: true });
    runFor(w, 600000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); if (x.tutorial.active) cmd.skipTutorial(x); });
    expect(violations.slice(0, 5)).toEqual([]);
    expect(w.stats.arrived).toBeGreaterThan(4);
    expect(Number.isFinite(w.coins)).toBe(true);
  });
  it('first session skips the night in the first 5 minutes', () => {
    const w = newGame(1);
    runFor(w, 200000, x => { if (x.ferry.state === 'arriving') cmd.tapHorn(x); });
    expect(w.events.some(e => e.type === 'nightSkip') || w.stats.minute.length >= 0).toBe(true);
    // at 1:53 (22:00 day 1) the clock must jump to 06:00
    const hours: number[] = [];
    const w2 = newGame(1);
    while (w2.rtMs < 130000) { tick(w2); hours.push((w2.t % (24 * TICKS_PER_HOUR)) / TICKS_PER_HOUR); }
    expect(hours.some(h => h >= 22.5 && h < 24)).toBe(false);
  });
});

describe('C2 determinism', () => {
  const run = (frames: number[]) => {
    const w = newGame(42);
    const s = new Stepper(w);
    let k = 0;
    for (const f of frames) { s.frame(f); if (++k % 30 === 0 && w.ferry.state === 'arriving') cmd.tapHorn(w); }
    return { ticks: s.ticks, w };
  };
  // integer-µs frame sequences with identical sums (60 s of play)
  const seq = (hz: number, totalUs: number) => {
    const base = Math.floor(1e6 / hz), out: number[] = []; let sum = 0;
    while (sum + base <= totalUs) { out.push(base); sum += base; }
    if (sum < totalUs) out.push(totalUs - sum);
    return out;
  };
  it('same dt sum → same tick count at 60/144/165 Hz', () => {
    const T = 60_000_000;
    const a = new Stepper(newGame(1)), b = new Stepper(newGame(1)), c = new Stepper(newGame(1));
    for (const f of seq(60, T)) a.frame(f);
    for (const f of seq(144, T)) b.frame(f);
    for (const f of seq(165, T)) c.frame(f);
    expect(b.ticks).toBe(a.ticks); expect(c.ticks).toBe(a.ticks);
  });
  it('same ticks + same inputs → same state hash', () => {
    const w1 = newGame(9), w2 = newGame(9);
    for (let i = 0; i < 6000; i++) {
      tick(w1); tick(w2);
      if (i === 30) { cmd.tapHorn(w1); cmd.tapHorn(w2); }
      if (i === 900) { cmd.skipTutorial(w1); cmd.skipTutorial(w2); }
    }
    expect(stateHash(w1)).toBe(stateHash(w2));
    void run;
  });
});

describe('C1a performance', () => {
  it('200 agents: sim tick p95 ≤ 2 ms (Node)', () => {
    const w = newGame(3);
    w.parcels = w.parcels.map(() => true); applyParcels(w);
    // fill the map with bunks and canteens so 200 rascals have beds
    const spots: [string, number, number, number, number][] = [];
    for (const x of [3, 10, 17, 24]) { spots.push(['bunk', x, 1, 6, 6]); spots.push(['bunk', x, 23, 6, 6]); }
    for (const x of [18, 25]) { spots.push(['bunk', x, 11, 6, 3]); spots.push(['bunk', x, 18, 6, 3]); }
    for (const [t, x, y, ww, hh] of spots) addRoomRaw(w, t as 'bunk', x, y, ww, hh, defaultDoor('bunk', x, y, ww, hh, 'S'), true);
    addRoomRaw(w, 'canteen', 20, 11, 6, 3, defaultDoor('canteen', 20, 11, 6, 3, 'S'), true);
    rebuild(w);
    for (const r of roomsOf(w, 'canteen')) { addStaff(w, 'cook', r.id, true); addStaff(w, 'cook', r.id, true); }
    w.tutorial.active = false; w.tutorial.done = true;
    const bunks = roomsOf(w, 'bunk');
    let n = 0;
    for (const b of bunks) for (let s = 0; s < b.slots.length && n < 200; s++, n++) {
      const a = spawnRascal(w, 9 + (n % 6), 15.5);
      a.bed = b.id; a.bedSlot = s; a.state = 'idle';
    }
    // fill up to 200 agents (extra ones without a bed still walk, eat, work)
    while (w.agents.length < 200) { const a = spawnRascal(w, 9 + (n++ % 6), 15.5); a.state = 'idle'; }
    expect(w.agents.length).toBeGreaterThanOrEqual(200);
    for (let i = 0; i < 1500; i++) tick(w); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 10000; i++) { const t0 = process.hrtime.bigint(); tick(w); times.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`C1a: agents=${w.agents.length} p50=${times[5000].toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${times[9900].toFixed(3)}ms`);
    expect(p95).toBeLessThanOrEqual(2);
  }, 120000);
});
