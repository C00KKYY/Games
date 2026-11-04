import { describe, it, expect } from 'vitest';
import { packRoom, bestDoor } from '../../src/sim/layout';
import { roomSlots, type RoomType } from '../../src/content/balance';

// Brief §3.4 capacity formulas must be reached for the standard sizes players actually build (door on S, middle)
const CASES: [RoomType, number, number][] = [
  ['canteen', 4, 3], ['canteen', 4, 4], ['canteen', 5, 4], ['canteen', 6, 3], ['canteen', 6, 4],
  ['classroom', 4, 4], ['classroom', 5, 4], ['classroom', 5, 5],
  ['bunk', 3, 3], ['bunk', 6, 3], ['bunk', 6, 6], ['bunk', 4, 6],
  ['workshop', 4, 4], ['workshop', 6, 4], ['wash', 3, 3], ['wash', 6, 3], ['yard', 5, 5], ['yard', 6, 6],
];
describe('room capacity reaches the brief formula', () => {
  for (const [t, w, h] of CASES) it(`${t} ${w}x${h} → ${roomSlots(t, w, h)}`, () => {
    // the best door position (chooseDoor optimises capacity) reaches the formula; every side still ≥ 80 %
    let best = 0;
    for (const side of ['S', 'N', 'E', 'W'] as const) {
      const n = packRoom(t, w, h, bestDoor(t, 0, 0, w, h, side)).slots.length;
      best = Math.max(best, n);
      expect(n, `door ${side}`).toBeGreaterThanOrEqual(Math.floor(roomSlots(t, w, h) * 0.8));
    }
    expect(best).toBe(roomSlots(t, w, h));
  });
});

it('big bunks lose at most one bed per bed row pair (aisle spine)', () => {
  const n = packRoom('bunk', 6, 9, bestDoor('bunk', 0, 0, 6, 9, 'W')).slots.length;
  expect(n).toBeGreaterThanOrEqual(16);
});
