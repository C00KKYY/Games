import { describe, it, expect } from 'vitest';
import { run } from '../../tools/economy-sheet';
import { bulkCost, maxAffordable, upCost } from '../../src/content/balance';

describe('H0 economy sheet', () => {
  it('has no contradictions with the pacing table', () => {
    const { errors } = run(false);
    expect(errors).toEqual([]);
  });
});

describe('upgrade math', () => {
  it('bulk cost equals sum of single costs', () => {
    let s = 0; for (let l = 3; l < 13; l++) s += upCost('workshop', l);
    expect(bulkCost('workshop', 3, 10)).toBeCloseTo(s, 6);
  });
  it('maxAffordable is the largest n with bulkCost <= coins', () => {
    for (const coins of [0, 50, 119, 120, 1000, 54321]) {
      const n = maxAffordable('workshop', 4, coins);
      expect(bulkCost('workshop', 4, n)).toBeLessThanOrEqual(coins + 1e-6);
      expect(bulkCost('workshop', 4, n + 1)).toBeGreaterThan(coins);
    }
  });
});
