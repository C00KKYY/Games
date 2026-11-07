/**
 * Fast H checks for `npm test` (Brief §12.9). The full sweep (27 seeds over 3 seed bases, optimal bot, H1b) is
 * `npx tsx tools/balance.ts --minutes 30 --seeds 9` → qa/balance.md; these tests run a small, fixed sample of the same
 * bots and the same criteria, so a balance regression shows up in the normal test run.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runBot, type BotReport } from '../../tools/bots';
import { PACING, medMs, keysOf } from '../../tools/balance';
import { cmd } from '../../src/sim/sim';

const SEEDS = [11, 500, 1000];
const casual: BotReport[] = SEEDS.map(seed => runBot({ profile: 'casual', seed, minutes: 30 }));

describe('H1 pacing (casual median of 3 seeds, ±20 %)', () => {
  // rows the 3-seed sample measures robustly; the full table is checked by tools/balance.ts on 27 seeds
  const keys = ['release1', 'built:workshop', 'tunnel1', 'star1', 'built:classroom', 'obj:beds12', 'star2', 'foodFight1', 'parcel1', 'star3', 'milestone:workshop15', 'inspectionReady'];
  for (const k of keys) {
    const row = PACING.find(p => p.key === k)!;
    it(`${row.label} within ${row.lo}–${row.hi} s ±20 %`, () => {
      const m = medMs(casual, k);
      expect(m, k).not.toBeNull();
      expect(m!).toBeGreaterThanOrEqual(row.lo * 0.8);
      expect(m!).toBeLessThanOrEqual(row.hi * 1.2);
    });
  }
  // income mix / wage share (§3.8): only in the 27-seed sweep – a 3-seed median scatters by ±3 pp around corridor edges
});

describe('H2 pressure and the random bot', () => {
  // the scripted 3:00 tunnel always happens – it proves nothing about pressure (verifier M5): count the director's own picks
  it('every casual run has ≥ 1 escape attempt PICKED BY THE DIRECTOR (not the scripted one) and ≥ 1 food fight in 30 min', () => {
    for (const r of casual) { expect(r.pressure.tunnelsRandom, `seed ${r.seed}`).toBeGreaterThanOrEqual(1); expect(r.pressure.foodFights, `seed ${r.seed}`).toBeGreaterThanOrEqual(1); }
  });
  it('a random bot does not reach 2★ in 30 min (every sampled seed)', () => {
    const rnd = SEEDS.map(seed => runBot({ profile: 'random', seed, minutes: 30 }));
    for (const r of rnd) expect(r.final.maxStars, `seed ${r.seed}`).toBeLessThan(2);
  });
});

describe('H3 + key calibration', () => {
  it('first inspection possible at 22–30 min (Brief §12.9 H3, no tolerance), and it gets called', () => {
    const m = medMs(casual, 'inspectionReady');
    expect(m!).toBeGreaterThanOrEqual(1320);
    expect(m!).toBeLessThanOrEqual(1800);
    for (const r of casual) expect(r.milestones.inspection1, `seed ${r.seed}`).toBeDefined();
  });
  it('casual: 4–6 base keys at the first inspection, with 2★ exactly 2 perks (Brief §3.17)', () => {
    for (const r of casual) {
      const k = keysOf(r)!;
      expect(k, `seed ${r.seed}`).not.toBeNull();
      expect(k.base).toBeGreaterThanOrEqual(4);
      expect(k.base).toBeLessThanOrEqual(6);
      expect(k.perks).toBe(2);
    }
  });
});

describe('H6 no dead commands', () => {
  it('every cmd.* the UI calls exists in the sim command table', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk('src/ui'); files.push('src/app.ts');
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bcmd\.([a-zA-Z]+)\(/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) expect(typeof (cmd as Record<string, unknown>)[name], `cmd.${name}`).toBe('function');
  });
});
