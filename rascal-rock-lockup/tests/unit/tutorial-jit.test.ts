/**
 * Just-in-time tips go away with their reason (M4 review): jitStillValid() is true while the world condition of a shown
 * tip holds and false as soon as it ends – horn tapped, escapee caught / gone, crates sold, queue cleared, goal room built.
 * Also: the Knitting Nook unlock at the end of the tutorial is announced like every other unlock.
 */
import { describe, it, expect } from 'vitest';
import { newGame, tick, cmd } from '../../src/sim/sim';
import { roomsOf } from '../../src/sim/world';
import { jitPick, jitStillValid, newJitMemo, JIT_GAP_MS } from '../../src/ui/tutorial';
import type { World } from '../../src/sim/types';

const run = (w: World, ms: number) => { const end = w.rtMs + ms; while (w.rtMs < end) tick(w); };
/** a world right after a skipped tutorial with the first rascals walking around */
const afterSkip = () => { const w = newGame(1); run(w, 3000); cmd.skipTutorial(w); run(w, 8000); return w; };
const events = (w: World, from: number) => w.events.slice(w.events.length - Math.min(w.events.length, w.eventSeq - from));

describe('jitStillValid', () => {
  it('horn: valid while the ferry honks untapped, gone once it is tapped', () => {
    const w = afterSkip();
    w.ferry.state = 'arriving'; w.ferry.tapped = false;
    expect(jitStillValid(w, 'horn')).toBe(true);
    w.ferry.tapped = true;
    expect(jitStillValid(w, 'horn')).toBe(false);
    w.ferry.tapped = false; w.ferry.state = 'docked';
    expect(jitStillValid(w, 'horn')).toBe(false);
  });

  it('escape: valid while that escapee runs, gone when caught / out (and for any escapee without an id)', () => {
    const w = afterSkip();
    const a = w.agents.find(x => x.kind === 'rascal')!;
    a.state = 'escaping';
    expect(jitStillValid(w, 'escape')).toBe(true);
    expect(jitStillValid(w, 'escape', { agentId: a.id })).toBe(true);
    a.state = 'idle';
    expect(jitStillValid(w, 'escape')).toBe(false);
    expect(jitStillValid(w, 'escape', { agentId: a.id })).toBe(false);
    // another rascal escaping does not keep a tip about the first one alive
    const b = w.agents.find(x => x.kind === 'rascal' && x.id !== a.id)!;
    b.state = 'escaping';
    expect(jitStillValid(w, 'escape', { agentId: a.id })).toBe(false);
    expect(jitStillValid(w, 'escape', { agentId: b.id })).toBe(true);
  });

  it('crates: valid while the workshop stack is high, gone once the crates are sold', () => {
    const w = afterSkip();
    const r = roomsOf(w, 'canteen')[0];
    const shop = { ...r, id: 9999, type: 'workshop' as const, built: true, stack: 5 };
    w.rooms.push(shop as typeof r);
    expect(jitStillValid(w, 'crates')).toBe(true);
    expect(jitStillValid(w, 'crates', { roomId: shop.id })).toBe(true);
    (w.rooms.at(-1) as typeof shop).stack = 0;
    expect(jitStillValid(w, 'crates')).toBe(false);
    expect(jitStillValid(w, 'crates', { roomId: shop.id })).toBe(false);
    w.rooms.pop();
  });

  it('queue: valid while ≥ 3 queue at the canteen, gone when the queue clears', () => {
    const w = afterSkip();
    const can = roomsOf(w, 'canteen')[0];
    can.queueUsers = [1, 2, 3];
    expect(jitStillValid(w, 'queue', { roomId: can.id })).toBe(true);
    expect(jitStillValid(w, 'queue')).toBe(true);
    can.queueUsers = [1];
    expect(jitStillValid(w, 'queue', { roomId: can.id })).toBe(false);
    expect(jitStillValid(w, 'queue')).toBe(false);
  });

  it('beds: valid while a rascal waits at the dock; drag: depends on the build tool (unknown → keep)', () => {
    const w = afterSkip();
    for (const a of w.agents) if (a.state === 'waitingDock') a.state = 'idle';
    const r = w.agents.find(x => x.kind === 'rascal')!;
    r.state = 'waitingDock';
    expect(jitStillValid(w, 'beds')).toBe(true);
    r.state = 'idle';
    expect(jitStillValid(w, 'beds')).toBe(false);
    expect(jitStillValid(w, 'drag')).toBe(true);
    expect(jitStillValid(w, 'drag', undefined, { buildTool: true })).toBe(true);
    expect(jitStillValid(w, 'drag', undefined, { buildTool: false })).toBe(false);
  });

  it('every tip jitPick returns is valid at that moment (the picker and the check agree)', () => {
    const w = newGame(3);
    cmd.skipTutorial(w);
    const m = newJitMemo();
    let picks = 0;
    for (let t = 0; t < 600_000; t += 500) {
      run(w, 500);
      const p = jitPick(w, m, w.rtMs, { buildTool: false });
      if (p) { picks++; expect(jitStillValid(w, p.kind, p, { buildTool: false }), `${p.kind} at ${w.rtMs}`).toBe(true); m.lastMs = w.rtMs; m.kindMs[p.kind] = w.rtMs; m.count[p.kind] = (m.count[p.kind] ?? 0) + 1; }
    }
    expect(picks).toBeGreaterThan(0);
    expect(JIT_GAP_MS).toBe(30000); // Brief §6.2: ≤ 1 tip per 30 s – unchanged
  });
});

describe('tutorial end announces the Knitting Nook unlock', () => {
  it('finishing the tutorial emits unlock { what: "workshop" } once (skip path too)', () => {
    for (const skip of [false, true]) {
      const w = newGame(1);
      expect(w.unlocked.workshop).toBeFalsy();
      const seq = w.eventSeq;
      run(w, 3000);
      if (skip) cmd.skipTutorial(w);
      else { w.tutorial.step = 3; roomsOf(w, 'canteen')[0].level = 2; }
      tick(w);
      expect(w.tutorial.done).toBe(true);
      const ev = events(w, seq);
      const unl = ev.filter(e => e.type === 'unlock' && e.what === 'workshop');
      expect(unl.length, `skip=${skip}`).toBe(1);
      const iu = ev.findIndex(e => e.type === 'unlock' && e.what === 'workshop'), id = ev.findIndex(e => e.type === 'tutorialDone');
      expect(iu).toBeGreaterThanOrEqual(0);
      expect(iu).toBeLessThan(id);
      expect(w.unlocked.workshop).toBe(true);
      // never announced twice
      const seq2 = w.eventSeq;
      run(w, 2000);
      expect(events(w, seq2).filter(e => e.type === 'unlock' && e.what === 'workshop')).toEqual([]);
    }
  });
});
