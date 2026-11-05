/**
 * Onboarding layer (src/ui/tutorial.ts) – the pure parts: D1 word count per tutorial step (step text + wait line, both
 * languages), the just-in-time tip picker (≤ 1 per 30 s, never during the tutorial, sustain + priority + caps) and the
 * headless tutorial / skip paths the hand pointer leads through (D8, D9).
 */
import { describe, it, expect } from 'vitest';
import { newGame, tick, cmd } from '../../src/sim/sim';
import { TUTORIAL_STEPS, OBJECTIVES } from '../../src/sim/objectives';
import { roomsOf } from '../../src/sim/world';
import { TUTORIAL_WASH } from '../../src/content/site1';
import { tableOf } from '../../src/i18n/i18n';
import { stepWords, stepKeys, jitPick, jitShown, newJitMemo, JIT_GAP_MS } from '../../src/ui/tutorial';
import type { World } from '../../src/sim/types';

const run = (w: World, ms: number, each?: () => void) => { const end = w.rtMs + ms; while (w.rtMs < end) { tick(w); each?.(); } };

describe('D1 tutorial words (from i18n)', () => {
  it('every step shows ≤ 8 words in EN and DE, wait line included', () => {
    for (const l of ['en', 'de'] as const) {
      const T = tableOf(l);
      for (const s of TUTORIAL_STEPS) {
        for (const k of stepKeys(s)) expect(T[k], `${l} ${k}`).toBeTruthy();
        expect(stepWords(s, k => T[k]), `${l} ${s}`).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('just-in-time tips', () => {
  it('none while the tutorial runs', () => {
    const w = newGame(1);
    w.agents.filter(a => a.kind === 'rascal').forEach(a => { a.state = 'waitingDock'; });
    expect(jitPick(w, newJitMemo(), 1e6, { buildTool: true })).toBeNull();
  });

  it('≤ 1 tip per 30 s, conditions must hold for their sustain time, each tip is capped', () => {
    const w = newGame(1);
    run(w, 3000);                                         // the first ferry honks; Skip taps it (Brief §6.2)
    cmd.skipTutorial(w);
    run(w, 8000);                                         // the first ferry is in, rascals walk around
    const m = newJitMemo();
    // build-tool hint (second build teaches dragging) – no sustain
    let p = jitPick(w, m, 100_000, { buildTool: true });
    expect(p?.kind).toBe('drag');
    jitShown(m, 'drag', 100_000);
    expect(jitPick(w, m, 100_000 + JIT_GAP_MS - 1, { buildTool: true })).toBeNull();      // gap
    expect(jitPick(w, m, 100_000 + JIT_GAP_MS, { buildTool: true })?.kind).not.toBe('drag'); // drag only once
    // beds full: a rascal waits at the dock – needs 3 s of sustain
    const r = w.agents.find(a => a.kind === 'rascal')!;
    r.state = 'waitingDock';
    const t1 = 200_000;
    expect(jitPick(w, m, t1, { buildTool: false })?.kind).not.toBe('beds');
    p = jitPick(w, m, t1 + 3000, { buildTool: false });
    expect(p?.kind).toBe('beds');
    jitShown(m, 'beds', t1 + 3000);
    // same kind: cooldown 3 min, at most 3 times
    let shown = 1;
    for (let tt = t1 + 3000; tt < t1 + 3000 + 30 * 60_000; tt += 1000) {
      const q = jitPick(w, m, tt, { buildTool: false });
      if (q?.kind === 'beds') { expect(tt - (m.kindMs.beds ?? 0)).toBeGreaterThanOrEqual(180_000); jitShown(m, 'beds', tt); shown++; }
      else if (q) jitShown(m, q.kind, tt);
    }
    expect(shown).toBe(3);
  });

  it('priority: an escapee beats build advice; a canteen queue gives the queue tip', () => {
    const w = newGame(1);
    run(w, 3000);                                         // the first ferry honks; Skip taps it (Brief §6.2)
    cmd.skipTutorial(w);
    run(w, 8000);
    const can = roomsOf(w, 'canteen')[0];
    can.queueUsers = [1, 2, 3];
    const m = newJitMemo();
    jitPick(w, m, 0, { buildTool: false });
    expect(jitPick(w, m, 5000, { buildTool: false })?.kind).toBe('queue');
    const a = w.agents.find(x => x.kind === 'rascal')!;
    a.state = 'escaping';
    expect(jitPick(w, m, 5000, { buildTool: false })?.kind).toBe('escape');
  });

  it('a long session never shows more than one tip per 30 s', () => {
    const w = newGame(3);
    cmd.skipTutorial(w);
    const m = newJitMemo();
    const at: number[] = [];
    run(w, 600_000, () => {
      if (w.rtMs % 500) return;
      const q = jitPick(w, m, w.rtMs, { buildTool: false });
      if (q) { jitShown(m, q.kind, w.rtMs); at.push(w.rtMs); }
    });
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(JIT_GAP_MS);
  });
});

describe('tutorial paths the pointer leads through (headless)', () => {
  it('D8: horn → one-tap Wash Hut → stamp → upgrade, first release ≤ 90 s even with 2 s reactions', () => {
    const w = newGame(1);
    let next = 2000, release = -1;
    run(w, 120_000, () => {
      if (release < 0 && w.stats.released > 0) release = w.rtMs;
      if (w.rtMs < next || !w.tutorial.active) return;
      const s = TUTORIAL_STEPS[w.tutorial.step];
      let acted = false;
      if (s === 'horn' && w.ferry.state === 'arriving') acted = cmd.tapHorn(w).ok;
      else if (s === 'wash' && !roomsOf(w, 'wash').length) acted = cmd.build(w, 'wash', TUTORIAL_WASH.x, TUTORIAL_WASH.y, TUTORIAL_WASH.w, TUTORIAL_WASH.h).ok;
      else if (s === 'stamp' && w.agents.some(a => a.state === 'atGate')) acted = cmd.stamp(w).ok;
      else if (s === 'upgrade') acted = cmd.upgrade(w, roomsOf(w, 'canteen')[0].id, 1).ok;
      if (acted) next = w.rtMs + 2000;
    });
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThanOrEqual(90_000);
    expect(w.tutorial.done && !w.tutorial.skipped).toBe(true);
  });

  it('D9: skip at 3 s → Wash Hut is the first goal at once, release ≤ 120 s, tunnel ~3:00', () => {
    const w = newGame(1);
    run(w, 3000);
    cmd.skipTutorial(w);
    tick(w);
    expect(w.tutorial.done && w.tutorial.skipped).toBe(true);
    expect(OBJECTIVES[w.obj.current].id).toBe('wash');
    let release = -1, tunnel = -1, seen = w.eventSeq;
    run(w, 200_000, () => {
      if (release < 0 && w.stats.released > 0) release = w.rtMs;
      const n = Math.min(w.events.length, w.eventSeq - seen); seen = w.eventSeq;
      for (const e of w.events.slice(w.events.length - n)) if (e.type === 'tunnel' && tunnel < 0) tunnel = w.rtMs;
    });
    expect(release).toBeGreaterThan(0);
    expect(release).toBeLessThanOrEqual(120_000);
    expect(tunnel).toBeGreaterThanOrEqual(150_000);
    expect(tunnel).toBeLessThanOrEqual(210_000);
  });
});
