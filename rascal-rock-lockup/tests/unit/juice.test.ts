import { describe, it, expect } from 'vitest';
import { allSprites } from '../../tools/art-build';
import { placePlaque, MERGE_S, STACK_MAX, type PlaqueSlot } from '../../src/render/juiceMath';

// E (Brief §12.6) needs its feedback sprites in the one atlas (batched, no extra textures besides the number font)
describe('E juice sprites', () => {
  const byName = new Map(allSprites().map(s => [s.name, s]));
  it('ships every feedback sprite in the atlas', () => {
    for (const n of ['fxRing', 'sparkle', 'fxStar', 'hatToss', 'scaffold', 'puff', 'confetti', 'coin', 'lvlBadge', 'plqL', 'plqM', 'plqR',
      'needHunger', 'needEnergy', 'needHygiene', 'needFun', 'alertMark']) expect(byName.has(n), n).toBe(true);
  });
  it('builds the coin plaque as a seamless 3-slice (same height, no padding → extruded edges)', () => {
    const parts = ['plqL', 'plqM', 'plqR'].map(n => byName.get(n)!);
    for (const p of parts) { expect(p.pad).toBe(0); expect(p.h).toBe(parts[0].h); expect(p.ay).toBe(p.h / 2); }
    expect(parts[0].ax).toBe(parts[0].w);   // left cap ends at x = 0 where the middle starts
    expect(parts[2].ax).toBe(0);
  });
  it('need plaques share one size and anchor at the tail tip (shown at a constant ≥ 14 px)', () => {
    const needs = ['needHunger', 'needEnergy', 'needHygiene', 'needFun'].map(n => byName.get(n)!);
    for (const s of needs) { expect([s.w, s.h, s.ax, s.ay]).toEqual([needs[0].w, needs[0].h, needs[0].ax, needs[0].ay]); expect(s.body).toContain('#f8f0de'); expect(s.body).toContain('#7a4e33'); }
  });
});

// LOW review finding: a night skip paid several incomes in one frame and stacked a tower of "+coins" plaques

describe('E coin plaques: merge + stack cap (pure placement)', () => {
  /** apply placements like juice.ts does (merge sums, new/replace take the slot) */
  const run = (events: { src: string; x: number; y: number; amount: number; dt?: number }[]) => {
    const list: PlaqueSlot[] = [];
    for (const e of events) {
      for (const q of list) q.t += e.dt ?? 0;
      const a = placePlaque(list, e.src, e.x, e.y, e.amount);
      if (a.kind === 'merge') { list[a.index].amount += e.amount; continue; }
      const p: PlaqueSlot = { on: true, t: 0, x: e.x, y: e.y, amount: e.amount, src: e.src, level: a.level };
      if (a.kind === 'replace') list[a.index] = p; else list.push(p);
    }
    return list;
  };
  it('same source, same spot, within 300 ms → one plaque with the summed amount', () => {
    const l = run([{ src: 'board', x: 100, y: 50, amount: 12 }, { src: 'board', x: 104, y: 52, amount: 8, dt: 0.1 }, { src: 'board', x: 100, y: 50, amount: 5, dt: 0.15 }]);
    expect(l.length).toBe(1);
    expect(l[0].amount).toBe(25);
  });
  it('a later income (≥ 300 ms) or another source stacks on the next level instead', () => {
    const l = run([{ src: 'board', x: 0, y: 0, amount: 12 }, { src: 'board', x: 0, y: 0, amount: 8, dt: MERGE_S + 0.01 }, { src: 'release', x: 0, y: 0, amount: 90 }]);
    expect(l.map(p => p.level)).toEqual([0, 1, 2]);
    expect(l.map(p => p.amount)).toEqual([12, 8, 90]);
  });
  it('spending never merges into income (sign), different spots never interact', () => {
    const l = run([{ src: 'x', x: 0, y: 0, amount: 12 }, { src: 'x', x: 0, y: 0, amount: -30 }, { src: 'x', x: 200, y: 0, amount: 7 }]);
    expect(l.map(p => [p.amount, p.level])).toEqual([[12, 0], [-30, 1], [7, 0]]);
  });
  it('night skip: 20 incomes from 6 sources at one spot in one frame → at most 3 plaques, nothing lost', () => {
    const ev = Array.from({ length: 20 }, (_, i) => ({ src: `s${i % 6}`, x: 300 + (i % 3) * 5, y: 200, amount: 10 + i }));
    const l = run(ev);
    expect(l.length).toBeLessThanOrEqual(STACK_MAX);
    expect(new Set(l.map(p => p.level)).size).toBe(l.length);
    expect(Math.max(...l.map(p => p.level))).toBeLessThan(STACK_MAX);
    expect(l.reduce((n, p) => n + p.amount, 0)).toBe(ev.reduce((n, e) => n + e.amount, 0));
  });
  it('full stack of the other sign: the oldest plaque is replaced (its level reused)', () => {
    const l = run([{ src: 'a', x: 0, y: 0, amount: 5 }, { src: 'b', x: 0, y: 0, amount: 6, dt: 0.05 }, { src: 'c', x: 0, y: 0, amount: 7, dt: 0.05 }, { src: 'd', x: 0, y: 0, amount: -50, dt: 0.05 }]);
    expect(l.length).toBe(3);
    expect(l.map(p => [p.amount, p.level])).toEqual([[-50, 0], [6, 1], [7, 2]]);
  });
  it('a plaque that has risen away (≥ 0.6 s) frees its level', () => {
    const l = run([{ src: 'a', x: 0, y: 0, amount: 5 }, { src: 'b', x: 0, y: 0, amount: 6, dt: 0.7 }]);
    expect(l.map(p => p.level)).toEqual([0, 0]);
  });
});

describe('E escapee marker sprite (USP 4)', () => {
  it('alertMark is the need-plaque size and anchor, coral with a cream "!"', () => {
    const byName = new Map(allSprites().map(s => [s.name, s]));
    const a = byName.get('alertMark')!, n = byName.get('needFun')!;
    expect([a.w, a.h, a.ax, a.ay]).toEqual([n.w, n.h, n.ax, n.ay]);
    expect(a.body).toContain('#df6450');
    expect(a.body).toContain('#f8f0de');
  });
});
