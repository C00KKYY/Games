/**
 * M5 integration fixes (docs/QA_REPORT.md "Stand M5"): the release goal (20, H3 window), names, platform-facing events.
 */
import { describe, it, expect } from 'vitest';
import { newGame, cmd, runFor } from '../../src/sim/sim';
import { spawnRascal } from '../../src/sim/agents';
import { currentGoal, OBJECTIVES, mandatoryDone } from '../../src/sim/objectives';
import { keysFor, PRESTIGE } from '../../src/content/balance';
import { offlineCoins, offlineRatePerMin, incomeCounter } from '../../src/sim/offline';
import type { World } from '../../src/sim/types';

const doneUpTo = (w: World, id: string) => { for (const o of OBJECTIVES) { if (o.id === id) break; w.obj.done[o.id] = true; } };

describe('release goal (H3: inspection possible at 22–30 min)', () => {
  it('the clipboard asks for 20 releases, mandatory', () => {
    const o = OBJECTIVES.find(x => x.id === 'release20');
    expect(o?.target).toBe(20);
    expect(o?.mandatory).toBe(true);
    expect(OBJECTIVES.some(x => x.id === 'release15')).toBe(false);
    expect(OBJECTIVES.filter(x => x.mandatory)).toHaveLength(7);
    expect(OBJECTIVES.filter(x => !x.onlyIfSkipped)).toHaveLength(10); // + the Wash Hut goal of a skipped tutorial
  });
  it('a save that already finished the old "release15" gets the new goal and finishes it at 20 releases', () => {
    const w = newGame(3);
    cmd.skipTutorial(w);
    doneUpTo(w, 'release20');
    w.obj.done.release15 = true; // what an earlier M5 build stored
    w.stats.released = 17;
    runFor(w, 1);
    expect(currentGoal(w)).toMatchObject({ kind: 'objective', id: 'release20', progress: 17, target: 20 });
    expect(mandatoryDone(w)).toBe(false);
    w.stats.released = 20;
    runFor(w, 1);
    expect(w.obj.done.release20).toBe(true);
    expect(w.events.some(e => e.type === 'objective' && e.id === 'release20')).toBe(true);
  });
  it('key constant C = 600: 4 keys from 9.6 K, 6 up to 29.4 K lifetime coins (casual calls at 14.8–25.7 K)', () => {
    expect(PRESTIGE.C).toBe(600);
    expect(keysFor(9_600, 0)).toBe(4);
    expect(keysFor(14_800, 0)).toBe(4);
    expect(keysFor(18_500, 0)).toBe(5);
    expect(keysFor(25_700, 0)).toBe(6);
    expect(keysFor(29_399, 0)).toBe(6);
    expect(keysFor(18_500, 2)).toBe(7);
  });
});

describe('names', () => {
  it('"Earl" is only the scripted tutorial raccoon – never a later arrival, never on a transfer run', () => {
    const w = newGame(5);
    const names: string[] = [];
    for (let i = 0; i < 200; i++) { const a = spawnRascal(w, 2, 12); names.push(a.name); w.stats.arrived++; }
    expect(names).not.toContain('Earl');
    const earl = spawnRascal(w, 2, 12, { earl: true });
    expect(earl.name).toBe('Earl');
  });
});

describe('offline formula with an empty income ring (save migrated from M4)', () => {
  it('uses the world\'s own average, so a returning M4 player gets the return panel; 0 in the first minute', () => {
    const w = newGame(2);
    cmd.skipTutorial(w);
    runFor(w, 8 * 60_000);
    w.offline.ring = []; // what the 1 → 2 migration leaves: the ring starts at load time
    const avg = incomeCounter(w) / (w.rtMs / 60_000);
    expect(avg).toBeGreaterThan(0);
    expect(offlineRatePerMin(w)).toBeCloseTo(avg, 6);
    expect(offlineCoins(w, 20 * 60_000).coins).toBeGreaterThan(0);
    const fresh = newGame(2);
    expect(offlineRatePerMin(fresh)).toBe(0);
    expect(offlineCoins(fresh, 20 * 60_000).coins).toBe(0);
  });
});
