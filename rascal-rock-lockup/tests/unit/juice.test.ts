import { describe, it, expect } from 'vitest';
import { allSprites } from '../../tools/art-build';

// E (Brief §12.6) needs its feedback sprites in the one atlas (batched, no extra textures besides the number font)
describe('E juice sprites', () => {
  const byName = new Map(allSprites().map(s => [s.name, s]));
  it('ships every feedback sprite in the atlas', () => {
    for (const n of ['fxRing', 'sparkle', 'fxStar', 'hatToss', 'scaffold', 'puff', 'confetti', 'coin', 'lvlBadge', 'plqL', 'plqM', 'plqR',
      'needHunger', 'needEnergy', 'needHygiene', 'needFun']) expect(byName.has(n), n).toBe(true);
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
